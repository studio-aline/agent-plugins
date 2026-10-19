import {createServer, type IncomingMessage, type Server} from 'node:http';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {buildBlock} from '../src/mr-body.ts';
import {parsePlan, type Plan} from '../src/plan.ts';
import {publish, type PublishDeps} from '../src/publish.ts';
import {samplePlan} from './fixtures/sample-plan.ts';

const HEAD = 'abc1234def5678abc1234def5678abc1234def56';
const PREV = '9999999999999999999999999999999999999999';

/** A fake GitLab that keeps one MR: its description, head sha, uploads and notes. */
let gitlab: {
  description: string;
  sha: string;
  uploads: string[];
  notes: string[];
  puts: number;
  tokens: Set<string>;
  /** Overrides what a PUT stores, to simulate GitLab changing the text. */
  storeAs?: (body: string) => string;
  noteStatus: number;
  /** Runs right after an upload, to simulate someone editing the MR meanwhile. */
  afterUpload?: () => void;
};
let server: Server;
let host = '';

const read = (req: IncomingMessage) =>
  new Promise<string>(res => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await read(req);
    gitlab.tokens.add(req.headers['private-token'] as string);
    const json = (status: number, v: unknown) => {
      res.writeHead(status, {'content-type': 'application/json'});
      res.end(JSON.stringify(v));
    };
    const mr = '/api/v4/projects/game%2Fserver/merge_requests/1234';
    if (req.method === 'POST' && req.url === '/api/v4/projects/game%2Fserver/uploads') {
      const name = body.match(/filename="([^"]+)"/)![1];
      gitlab.uploads.push(name);
      gitlab.afterUpload?.();
      return json(201, {url: `/uploads/u${gitlab.uploads.length}/${name}`, markdown: ''});
    }
    if (req.method === 'GET' && req.url === mr) {
      return json(200, {description: gitlab.description, sha: gitlab.sha, diff_refs: {base_sha: '1111111'}});
    }
    if (req.method === 'PUT' && req.url === mr) {
      gitlab.puts++;
      const sent = JSON.parse(body).description as string;
      gitlab.description = gitlab.storeAs ? gitlab.storeAs(sent) : sent;
      return json(200, {iid: 1234, web_url: `${host}/game/server/-/merge_requests/1234`, description: gitlab.description});
    }
    if (req.method === 'POST' && req.url === `${mr}/notes`) {
      if (gitlab.noteStatus !== 201) return json(gitlab.noteStatus, {message: 'nope'});
      gitlab.notes.push(JSON.parse(body).body);
      return json(201, {id: 40 + gitlab.notes.length, body: JSON.parse(body).body});
    }
    json(404, {message: `unexpected ${req.method} ${req.url}`});
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (addr && typeof addr === 'object') host = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  gitlab = {description: '## 변경 내용\r\n- `a` "b"', sha: HEAD, uploads: [], notes: [], puts: 0, tokens: new Set(), noteStatus: 201};
});

function workdir(plans: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'mr-video-publish-'));
  for (const [name, plan] of Object.entries(plans)) writeFileSync(join(dir, name), JSON.stringify(plan));
  return dir;
}

function deltaPlan() {
  const p = samplePlan();
  return {...p, mr: {...p.mr, base: PREV}, scenes: p.scenes.slice(0, 3)};
}

/** Render stand-in: writes a small file and reports its scene count as the length. */
function fakeDeps(rendered: string[] = []): PublishDeps {
  return {
    load: file => parsePlan(JSON.parse(readFileSync(file, 'utf8'))),
    render: async (plan: Plan, out: string) => {
      rendered.push(basename(out));
      writeFileSync(out, Buffer.from('fake-mp4'));
      return {seconds: plan.scenes.length * 10 + 0.04, qa: {ok: true, problems: []}};
    },
  };
}

const opts = (dir: string, extra: {deltaPlan?: string} = {}) => ({
  host,
  token: 's3cr3t-token',
  project: 'game/server',
  iid: 1234,
  plan: join(dir, 'plan.json'),
  ...extra,
});

describe('publish', () => {
  it('renders, uploads, puts the block on top of the description and posts the same video as a note', async () => {
    const dir = workdir({'plan.json': samplePlan()});
    const rendered: string[] = [];
    const r = await publish(opts(dir), fakeDeps(rendered));

    expect(r).toEqual({ok: true, videoSeconds: samplePlan().scenes.length * 10, noteUrl: `${host}/game/server/-/merge_requests/1234#note_41`, head: 'abc1234'});
    expect(rendered).toEqual(['mr-1234-abc1234.mp4']);
    expect(gitlab.uploads).toEqual(['mr-1234-abc1234.mp4']);
    expect(gitlab.description).toMatch(/^<!-- mr-video:start -->\r\n## 🎬 설명 영상\r\n!\[설명 영상 · abc1234\]\(\/uploads\/u1\/mr-1234-abc1234\.mp4\)/);
    expect(gitlab.description.endsWith('<!-- mr-video:end -->\r\n\r\n## 변경 내용\r\n- `a` "b"')).toBe(true);
    expect(gitlab.notes).toHaveLength(1);
    expect(gitlab.notes[0]).toContain('MR 전체');
    expect(gitlab.notes[0]).toContain('(/uploads/u1/mr-1234-abc1234.mp4)');
    expect([...gitlab.tokens]).toEqual(['s3cr3t-token']);
  });

  it('posts a separately rendered delta video as the note when a delta plan is given', async () => {
    const dir = workdir({'plan.json': samplePlan(), 'plan.delta.json': deltaPlan()});
    const rendered: string[] = [];
    const r = await publish(opts(dir, {deltaPlan: join(dir, 'plan.delta.json')}), fakeDeps(rendered));

    expect(r).toMatchObject({ok: true, head: 'abc1234', noteUrl: `${host}/game/server/-/merge_requests/1234#note_41`});
    expect(rendered).toEqual(['mr-1234-abc1234.mp4', 'mr-1234-abc1234-delta.mp4']);
    expect(gitlab.uploads).toEqual(['mr-1234-abc1234.mp4', 'mr-1234-abc1234-delta.mp4']);
    expect(gitlab.description).toContain('(/uploads/u1/mr-1234-abc1234.mp4)');
    expect(gitlab.notes[0]).toContain('`9999999`..`abc1234` 변경분');
    expect(gitlab.notes[0]).toContain('(/uploads/u2/mr-1234-abc1234-delta.mp4)');
  });

  it('changes nothing when the description already has the video of this head', async () => {
    gitlab.description = `${buildBlock({url: '/uploads/old/x.mp4', sha7: 'abc1234', seconds: 30})}\n\n본문`;
    const before = gitlab.description;
    const dir = workdir({'plan.json': samplePlan()});
    const rendered: string[] = [];
    const r = await publish(opts(dir), fakeDeps(rendered));

    expect(r).toEqual({ok: true, skipped: 'same-head', head: 'abc1234'});
    expect(rendered).toEqual([]);
    expect(gitlab.uploads).toEqual([]);
    expect(gitlab.puts).toBe(0);
    expect(gitlab.notes).toEqual([]);
    expect(gitlab.description).toBe(before);
  });

  it('replaces an older video and keeps an edit made while rendering', async () => {
    gitlab.description = `intro\n\n${buildBlock({url: '/uploads/old/x.mp4', sha7: '9999999', seconds: 30})}\n\n본문`;
    gitlab.afterUpload = () => {
      gitlab.description += '\n추가된 줄';
    };
    const dir = workdir({'plan.json': samplePlan()});
    await publish(opts(dir), fakeDeps());

    expect(gitlab.description.startsWith('intro\n\n<!-- mr-video:start -->')).toBe(true);
    expect(gitlab.description).not.toContain('/uploads/old/x.mp4');
    expect(gitlab.description.endsWith('<!-- mr-video:end -->\n\n본문\n추가된 줄')).toBe(true);
  });

  it('does not publish twice when another run published this head while rendering', async () => {
    gitlab.afterUpload = () => {
      gitlab.description = `${buildBlock({url: '/uploads/other/x.mp4', sha7: 'abc1234', seconds: 30})}\n\n본문`;
    };
    const dir = workdir({'plan.json': samplePlan()});
    const r = await publish(opts(dir), fakeDeps());

    expect(r).toEqual({ok: true, skipped: 'same-head', head: 'abc1234'});
    expect(gitlab.puts).toBe(0);
    expect(gitlab.notes).toEqual([]);
  });

  it('refuses when the MR head is not the plan head', async () => {
    gitlab.sha = PREV;
    const dir = workdir({'plan.json': samplePlan()});
    await expect(publish(opts(dir), fakeDeps())).rejects.toThrow(/MR head\(9999999\).*plan head\(abc1234\)/);
    expect(gitlab.puts).toBe(0);
    expect(gitlab.notes).toEqual([]);
  });

  it('refuses a plan for another MR or a delta plan for another head', async () => {
    const other = samplePlan();
    const dir = workdir({'plan.json': {...other, mr: {...other.mr, iid: 99}}, 'plan.delta.json': {...deltaPlan(), mr: {...deltaPlan().mr, head: PREV}}});
    await expect(publish(opts(dir), fakeDeps())).rejects.toThrow(/!99/);

    writeFileSync(join(dir, 'plan.json'), JSON.stringify(samplePlan()));
    await expect(publish(opts(dir, {deltaPlan: join(dir, 'plan.delta.json')}), fakeDeps())).rejects.toThrow(/delta plan head/);
    expect(gitlab.uploads).toEqual([]);
  });

  it('fails without uploading when the render QA fails', async () => {
    const dir = workdir({'plan.json': samplePlan()});
    const deps = fakeDeps();
    deps.render = async () => ({seconds: 1, qa: {ok: false, problems: ['프레임 수 부족', '오디오 없음']}});
    await expect(publish(opts(dir), deps)).rejects.toThrow('렌더 QA 실패: 프레임 수 부족; 오디오 없음');
    expect(gitlab.uploads).toEqual([]);
  });

  it('saves once more and then fails when GitLab stores a different description', async () => {
    gitlab.storeAs = s => s.replace('변경 내용', '변경 내옹');
    const dir = workdir({'plan.json': samplePlan()});
    await expect(publish(opts(dir), fakeDeps())).rejects.toThrow(/저장된 본문이 다릅니다 \(\d+번째 줄\)/);
    expect(gitlab.puts).toBe(2);
    expect(gitlab.notes).toEqual([]);
  });

  it('says the description was saved when only the note fails', async () => {
    gitlab.noteStatus = 403;
    const dir = workdir({'plan.json': samplePlan()});
    await expect(publish(opts(dir), fakeDeps())).rejects.toThrow(/본문은 저장했지만 기록 코멘트.*403/);
    expect(gitlab.description).toContain('<!-- mr-video:start -->');
  });

  it('needs GITLAB_HOST and GITLAB_TOKEN before rendering', async () => {
    const dir = workdir({'plan.json': samplePlan()});
    const rendered: string[] = [];
    await expect(publish({...opts(dir), token: ''}, fakeDeps(rendered))).rejects.toThrow(/GITLAB_TOKEN/);
    await expect(publish({...opts(dir), host: ''}, fakeDeps(rendered))).rejects.toThrow(/GITLAB_HOST/);
    expect(rendered).toEqual([]);
  });
});
