import {dirname, join, resolve} from 'node:path';
import {buildBlock, buildNote, inspectBody, sameBody, upsertBlock, videoFileName} from './mr-body.ts';
import {checkPlan, type Plan} from './plan.ts';
import {planSeconds} from './timing.ts';
import {getDescription, postNote, saveDescription, uploadVideo} from './upload.ts';

export interface PublishOptions {
  host: string;
  token: string;
  project: string;
  iid: number;
  /** plan.json for the description video (the whole MR). */
  plan: string;
  /** plan.delta.json for the history note (changes since the previous video). */
  deltaPlan?: string;
}

export interface PublishDeps {
  /** Reads a plan with its clips and voice resolved, as `render` expects. */
  load(file: string): Plan;
  render(plan: Plan, out: string): Promise<{seconds: number; qa: {ok: boolean; problems: string[]}}>;
}

export type PublishResult =
  | {ok: true; videoSeconds: number; noteUrl: string; head: string}
  | {ok: true; skipped: 'same-head'; head: string};

function checkFor(plan: Plan, file: string, o: PublishOptions) {
  if (plan.mr.project !== o.project) throw new Error(`${file}은 ${plan.mr.project}의 plan입니다 (--project ${o.project})`);
  if (plan.mr.iid !== undefined && plan.mr.iid !== o.iid) throw new Error(`${file}은 !${plan.mr.iid}의 plan입니다 (--iid ${o.iid})`);
  const {errors} = checkPlan(plan);
  if (errors.length) throw new Error(`${file} 검증 실패: ${errors.join('; ')}`);
}

async function renderTo(deps: PublishDeps, plan: Plan, out: string) {
  const r = await deps.render(plan, out);
  if (!r.qa.ok) throw new Error(`렌더 QA 실패: ${r.qa.problems.join('; ')}`);
  return r;
}

/**
 * Steps 5–9 of the skill in one call, for callers that only write plan.json (e.g. an app that
 * runs the agent unattended): render → upload → replace the marker block → save and compare →
 * post the history note and compare. Nothing on the MR changes before every upload succeeded.
 */
export async function publish(o: PublishOptions, deps: PublishDeps): Promise<PublishResult> {
  if (!o.host) throw new Error('GITLAB_HOST 환경 변수가 비어 있습니다 (예: gitlab.example.com).');
  if (!o.token) throw new Error('GITLAB_TOKEN 환경 변수가 비어 있습니다. api 스코프 PAT를 설정하세요.');
  const gitlab = {host: o.host, token: o.token, project: o.project, iid: o.iid};

  const plan = deps.load(o.plan);
  checkFor(plan, 'plan', o);
  const head7 = plan.mr.head.slice(0, 7);
  const delta = o.deltaPlan ? deps.load(o.deltaPlan) : undefined;
  if (delta) {
    checkFor(delta, 'delta plan', o);
    if (delta.mr.head !== plan.mr.head) throw new Error(`delta plan head(${delta.mr.head.slice(0, 7)})가 plan head(${head7})와 다릅니다`);
  }

  const existing = inspectBody((await getDescription(gitlab)).description);
  if (existing.hasBlock && existing.sha7 === head7) return {ok: true, skipped: 'same-head', head: head7};

  const name = videoFileName(plan.mr, plan.mr.head);
  const main = await renderTo(deps, plan, join(dirname(resolve(o.plan)), name));
  const deltaVideo = delta && join(dirname(resolve(o.deltaPlan!)), name.replace(/\.mp4$/, '-delta.mp4'));
  if (delta) await renderTo(deps, delta, deltaVideo!);

  const upload = await uploadVideo({file: join(dirname(resolve(o.plan)), name), project: o.project, host: o.host, token: o.token});
  const deltaUpload = delta && (await uploadVideo({file: deltaVideo!, project: o.project, host: o.host, token: o.token}));

  // Read again after the slow part, so edits made while rendering are kept and a run that
  // finished meanwhile (e.g. a retry of a timed-out call) is not published twice.
  const current = await getDescription(gitlab);
  const published = inspectBody(current.description);
  if (published.hasBlock && published.sha7 === head7) return {ok: true, skipped: 'same-head', head: head7};
  if (current.sha !== plan.mr.head) {
    throw new Error(`MR head(${current.sha.slice(0, 7)})가 plan head(${head7})와 다릅니다. 푸시된 head 기준으로 plan을 다시 쓰세요`);
  }
  const body = upsertBlock(current.description, buildBlock({url: upload.url, sha7: head7, seconds: planSeconds(plan), voice: plan.voice}));
  let check = sameBody(body, (await saveDescription({...gitlab, description: body})).description);
  if (!check.same) check = sameBody(body, (await saveDescription({...gitlab, description: body})).description);
  if (!check.same) throw new Error(`MR 본문을 저장했지만 저장된 본문이 다릅니다 (${check.line}번째 줄)`);

  const noted = deltaUpload ? {plan: delta!, url: deltaUpload.url} : {plan, url: upload.url};
  const note = buildNote({
    url: noted.url,
    base7: noted.plan.mr.base.slice(0, 7),
    sha7: head7,
    seconds: planSeconds(noted.plan),
    voice: noted.plan.voice,
    delta: Boolean(deltaUpload),
  });
  let posted;
  try {
    posted = await postNote({...gitlab, body: note});
  } catch (e) {
    throw new Error(`MR 본문은 저장했지만 기록 코멘트 작성에 실패했습니다: ${(e as Error).message}`);
  }
  const noteCheck = sameBody(note, posted.body);
  if (!noteCheck.same) throw new Error(`MR 본문은 저장했지만 작성된 기록 코멘트가 다릅니다 (${noteCheck.line}번째 줄): ${posted.webUrl}`);

  return {ok: true, videoSeconds: Number(main.seconds.toFixed(1)), noteUrl: posted.webUrl, head: head7};
}
