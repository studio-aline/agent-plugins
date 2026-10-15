// Regenerates the README media with mr-video itself, into <repo>/docs/media/mr-video/:
//   intro.mp4 (+ intro.png poster) — what mr-video is and how to install it
//   demo.mp4  (+ demo.gif)         — example output for a fictional MR
// Run from plugins/mr-video/scripts: npx tsx tools/readme-media.mts
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FFMPEG} from '../src/media.ts';
import {checkPlan, parsePlan, type Plan} from '../src/plan.ts';
import {renderPlan} from '../src/render/run.ts';
import {samplePlan} from '../test/fixtures/sample-plan.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '..', '..', '..', 'docs', 'media', 'mr-video');
const git = (...a: string[]) => execFileSync('git', a, {cwd: ROOT, encoding: 'utf8'}).trim();

const ARCHITECTURE = `flowchart LR
  subgraph AI["Claude Code · Codex"]
    S["mr-video 스킬<br/>장면 작성 규칙"]
    MCP["MR 본문 저장<br/>GitLab MCP 또는 API"]
  end
  subgraph CLI["mr-video CLI (Node)"]
    V["validate<br/>스키마 + git 근거 검사"]
    MM["mermaid → PNG<br/>(Chromium)"]
    R["Revideo 렌더<br/>(headless Chromium)"]
    Q["ffmpeg 후처리 · QA"]
    U["upload · description<br/>(GitLab API)"]
  end
  S --> V --> MM --> R --> Q --> U --> MCP`;

function introPlan(): Plan {
  const first = git('rev-list', '--max-parents=0', 'HEAD');
  return parsePlan({
    mr: {project: 'x7-claude-plugins', branch: git('branch', '--show-current') || 'main', base: first, head: git('rev-parse', 'HEAD')},
    title: 'mr-video 소개',
    scenes: [
      {
        type: 'title',
        title: 'mr-video — MR에 설명 영상을',
        meta: 'mr-video@x7 · Claude Code · Codex',
        summary: 'Claude Code나 Codex에게 "MR에 설명 영상 넣어줘"라고 하면 자막 영상을 만들어 MR 본문 맨 위에 넣습니다',
        captions: ['mr-video는 MR의 변경 내용을 자막 영상으로 만듭니다.', '만든 영상은 MR 본문 맨 위에 바로 들어갑니다.'],
      },
      {
        type: 'flow',
        title: '한 번 부르면 끝까지',
        nodes: ['요청', 'plan.json 작성 (AI)', 'validate 근거 검사', 'render · QA', 'MR 본문에 삽입'],
        changed: [2],
        captions: [
          'Claude Code나 Codex에 "MR에 설명 영상 넣어줘"라고 요청합니다.',
          'AI가 diff와 MR 본문을 읽고 장면 계획을 씁니다.',
          '코드가 실제 커밋에 있는지 검사한 뒤 렌더합니다.',
          '업로드하고 MR 본문 맨 위에 영상을 넣습니다.',
        ],
      },
      {
        type: 'mermaid',
        title: '구성',
        code: ARCHITECTURE,
        emphasis: [{accent: ['S']}, {accent: ['V']}, {accent: ['MM', 'R']}, {accent: ['Q']}, {accent: ['U', 'MCP']}],
        captions: [
          '스킬이 AI에게 장면 쓰는 법을 알려 줍니다.',
          'validate가 스키마와 base·head 코드를 대조합니다.',
          'mermaid는 PNG로 그리고, Revideo가 영상을 렌더합니다.',
          '인코딩된 MP4를 직접 검사합니다: 프레임·디코드·길이.',
          '업로드는 API로, 본문 저장은 GitLab MCP가 있으면 MCP로 합니다.',
        ],
      },
      {
        type: 'table',
        title: '장면 종류',
        columns: ['장면', '쓰는 곳'],
        rows: [
          ['title · checklist', '개요, 배포·리뷰 포인트'],
          ['flow · mermaid', '동작 경로, 본문의 mermaid 다이어그램 (강조한 곳으로 이동)'],
          ['code', 'before → after 코드 모핑, 핵심 줄 강조 (C++ · Elixir)'],
          ['table', '수정 전/후, 왜 이렇게 했는지 비교'],
          ['terminal', '명령 입력과 출력'],
          ['tests', '실행한 것 / 실행하지 않은 것'],
        ],
        captions: ['장면은 여덟 종류입니다.', 'MR 본문의 mermaid와 비교표를 그대로 영상으로 옮깁니다.', '코드는 수정 전에서 수정 후로 바뀌는 모습을 보여 줍니다.'],
      },
      {
        type: 'terminal',
        title: '설치 (Windows)',
        prompt: '>',
        lines: [
          {cmd: '/plugin marketplace add studio-aline/x7-claude-plugins'},
          {cmd: '/plugin install mr-video@x7'},
          {cmd: 'codex plugin marketplace add studio-aline/x7-claude-plugins'},
          {cmd: 'codex plugin add mr-video@x7'},
          {cmd: 'setx GITLAB_HOST "<GitLab 호스트>"', out: '성공: 지정한 값을 저장했습니다.'},
          {cmd: 'setx GITLAB_TOKEN "<api 스코프 PAT>"', out: '성공: 지정한 값을 저장했습니다.'},
        ],
        captions: [
          'Claude Code에서는 x7 마켓플레이스에서 설치합니다.',
          'Codex에서는 codex plugin add로 설치합니다.',
          '업로드에 쓸 GitLab 호스트와 PAT를 등록합니다.',
        ],
      },
      {
        type: 'terminal',
        title: 'CLI로 직접 쓰기',
        prompt: '>',
        lines: [
          {cmd: 'node bin/setup.mjs', out: '{ "ok": true }'},
          {cmd: 'node bin/mr-video.mjs validate plan.json --repo .', out: '{ "ok": true, "seconds": 73.1, "scenes": 7 }'},
          {cmd: 'node bin/mr-video.mjs render plan.json', out: '{ "ok": true, "seconds": 73.1, "qa": { "problems": [] } }'},
          {cmd: 'node bin/mr-video.mjs upload mr-1234-abc1234.mp4 --project group/repo', out: '{ "url": "/uploads/…/mr-1234-abc1234.mp4" }'},
        ],
        captions: [
          '처음 한 번은 setup.mjs가 의존성을 설치하고, validate가 검사합니다.',
          'render는 렌더와 QA를 합니다.',
          'upload 결과의 url이 MR 본문 블록에 들어갑니다.',
        ],
      },
      {
        type: 'checklist',
        title: '안전장치',
        items: [
          '코드 장면은 base·head 커밋의 실제 코드와 대조',
          '업로드가 성공하기 전에는 MR을 건드리지 않음',
          '본문은 마커 블록만 교체하고, 저장 후 바이트 단위로 대조',
          '인코딩된 MP4를 직접 QA (프레임 수·디코드·길이)',
        ],
        captions: [
          '틀린 설명이 영상에 들어가지 않게 코드를 대조합니다.',
          '실패하면 MR은 그대로 둡니다.',
          '작성자가 쓴 본문은 한 글자도 바꾸지 않습니다.',
          '보낸 영상 파일 자체를 검사합니다.',
        ],
      },
    ],
  });
}

function demoPlan(): Plan {
  const p = samplePlan();
  p.title = '예시: 아이템 스택 병합 수정 (가상 MR)';
  return parsePlan(p);
}

/** Two-pass palette GIF; small enough for a README. */
function gif(video: string, out: string, from: number, seconds: number) {
  const dir = mkdtempSync(join(tmpdir(), 'mr-video-gif-'));
  try {
    const filters = 'fps=10,scale=720:-1:flags=lanczos';
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(from), '-t', String(seconds), '-i', video,
      '-vf', `${filters},palettegen=stats_mode=diff`, join(dir, 'palette.png')]);
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(from), '-t', String(seconds), '-i', video, '-i', join(dir, 'palette.png'),
      '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, '-loop', '0', out]);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

mkdirSync(OUT, {recursive: true});
for (const [name, plan] of [['intro', introPlan()], ['demo', demoPlan()]] as const) {
  const {errors} = checkPlan(plan);
  if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
  writeFileSync(join(OUT, `${name}.plan.json`), `${JSON.stringify(plan, null, 2)}\n`);
  const r = await renderPlan(plan, join(OUT, `${name}.mp4`));
  if (!r.qa.ok) throw new Error(`${name}: ${r.qa.problems.join('; ')}`);
  console.error(`${name}.mp4 ${r.seconds.toFixed(1)}s ${(r.bytes / 1e6).toFixed(2)}MB`);
}
// Poster for the intro (title scene) and a short GIF of the demo's flow → code part.
execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', '3', '-i', join(OUT, 'intro.mp4'), '-frames:v', '1', join(OUT, 'intro.png')]);
gif(join(OUT, 'demo.mp4'), join(OUT, 'demo.gif'), 4.5, 16);
console.error(`demo.gif ${(statSync(join(OUT, 'demo.gif')).size / 1e6).toFixed(2)}MB`);
