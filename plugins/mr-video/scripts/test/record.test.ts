import {createServer, type Server} from 'node:http';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {isLocalUrl, parseSteps} from '../src/record/steps.ts';

describe('isLocalUrl', () => {
  it('accepts loopback and .localhost hosts only', () => {
    for (const u of ['http://localhost:4000/hive', 'http://127.0.0.1:3000', 'http://[::1]:8080/x', 'http://app.localhost:4000/', 'https://localhost/']) {
      expect(isLocalUrl(u), u).toBe(true);
    }
    for (const u of ['https://example.com', 'http://localhost.example.com', 'http://10.0.0.5:4000', 'http://x7.xlgames.com', 'file:///C:/x.html', 'javascript:alert(1)', 'nonsense']) {
      expect(isLocalUrl(u), u).toBe(false);
    }
  });
});

describe('parseSteps', () => {
  const base = {url: 'http://localhost:4000/', steps: [{action: 'click', text: '저장'}, {action: 'pause', ms: 800}]};

  it('accepts a local recording script', () => {
    expect(parseSteps(base).steps).toHaveLength(2);
  });

  it('rejects a non-local start url or goto', () => {
    expect(() => parseSteps({...base, url: 'https://example.com'})).toThrow(/localhost/);
    expect(() => parseSteps({...base, steps: [{action: 'goto', url: 'http://10.1.1.1/'}]})).toThrow(/localhost/);
  });

  it('requires a target for click and type', () => {
    expect(() => parseSteps({...base, steps: [{action: 'click'}]})).toThrow();
    expect(() => parseSteps({...base, steps: [{action: 'type', text: 'a'}]})).toThrow();
  });

  it('caps the number of steps and waits', () => {
    expect(() => parseSteps({...base, steps: Array.from({length: 41}, () => ({action: 'pause', ms: 10}))})).toThrow();
    expect(() => parseSteps({...base, steps: [{action: 'pause', ms: 20_000}]})).toThrow();
  });
});

// Records a real local page in headless Chrome (a few seconds).
describe('recordSteps', () => {
  let server: Server;
  let origin = '';
  const out = mkdtempSync(join(tmpdir(), 'mr-video-record-'));

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><title>t</title><body style="font:32px sans-serif">
        <h1 id="msg">대기 중</h1><input id="name"><button onclick="msg.textContent='저장됨: '+name.value">저장</button>
        <a id="out" href="https://example.com/">밖으로</a></body>`);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const a = server.address();
    origin = a && typeof a === 'object' ? `http://127.0.0.1:${a.port}` : '';
  });
  afterAll(() => server.close());

  it('runs the steps and writes an mp4 clip', {timeout: 120_000}, async () => {
    const {recordSteps} = await import('../src/record/record.ts');
    const r = await recordSteps(
      parseSteps({url: `${origin}/`, steps: [
        {action: 'type', selector: '#name', text: '테스트'},
        {action: 'click', text: '저장'},
        {action: 'wait', text: '저장됨'},
        {action: 'pause', ms: 600},
      ]}),
      join(out, 'clip.mp4'),
      {profileDir: join(out, 'profile')},
    );
    expect(r.ok).toBe(true);
    expect(existsSync(r.clip)).toBe(true);
    expect(r.seconds).toBeGreaterThan(1);
    expect(r.width).toBe(1280);
    expect(r.height).toBe(720);
  });

  it('stops when the page navigates away from localhost', {timeout: 120_000}, async () => {
    const {recordSteps} = await import('../src/record/record.ts');
    const r = await recordSteps(
      parseSteps({url: `${origin}/`, steps: [{action: 'click', selector: '#out'}, {action: 'pause', ms: 500}]}),
      join(out, 'blocked.mp4'),
      {profileDir: join(out, 'profile')},
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/example\.com/);
  });

  it('reports which step failed', {timeout: 120_000}, async () => {
    const {recordSteps} = await import('../src/record/record.ts');
    const r = await recordSteps(
      parseSteps({url: `${origin}/`, steps: [{action: 'click', selector: '#does-not-exist', timeoutMs: 1500}]}),
      join(out, 'fail.mp4'),
      {profileDir: join(out, 'profile')},
    );
    expect(r.ok).toBe(false);
    expect(r.failedStep).toBe(0);
  });
});

// Goes through the real CLI: its TypeScript loader rewrites functions, which once broke the
// in-page repaint ticker while the same code worked under vitest.
describe('recorded clip content', () => {
  it('ends on the state after the last action and lasts as long as the run', {timeout: 120_000}, async () => {
    const {execFile} = await import('node:child_process');
    const {writeFileSync} = await import('node:fs');
    const {regionLuma} = await import('../src/media.ts');
    const server = createServer((req, res) => {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      // Clicking turns the whole page black, which is easy to measure in the last frame.
      res.end(`<!doctype html><body style="margin:0;background:#fff"><button id="b" style="font-size:40px"
        onclick="document.body.style.background='#000'">go</button></body>`);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const a = server.address();
    const url = a && typeof a === 'object' ? `http://127.0.0.1:${a.port}/` : '';
    const dir = mkdtempSync(join(tmpdir(), 'mr-video-record-content-'));
    try {
      writeFileSync(join(dir, 'steps.json'), JSON.stringify({url, steps: [{action: 'pause', ms: 1200}, {action: 'click', selector: '#b'}, {action: 'pause', ms: 1500}]}));
      // The CLI records with the shared profile; point LOCALAPPDATA at the temp dir to keep it isolated.
      const stdout = await new Promise<string>((ok, fail) => {
        execFile(process.execPath, [fileURLToPath(new URL('../bin/mr-video.mjs', import.meta.url)), 'record', join(dir, 'steps.json'), '--out', join(dir, 'c.mp4')],
          {env: {...process.env, LOCALAPPDATA: dir}, encoding: 'utf8'}, (e, out) => (e ? fail(new Error(`${e.message}
${out}`)) : ok(out)));
      });
      const r = JSON.parse(stdout);
      expect(r.ok).toBe(true);
      // 0.5 s lead-in + 1.2 s + click (~0.4 s) + 1.5 s + 0.6 s tail ≈ 4.2 s
      expect(r.seconds).toBeGreaterThan(3.5);
      expect(regionLuma(r.clip, r.seconds - 0.2, 600, 300, 200, 200)).toBeLessThan(40);
      expect(regionLuma(r.clip, 0.8, 600, 300, 200, 200)).toBeGreaterThan(215);
    } finally {
      server.close();
    }
  });
});

describe('before steps', () => {
  it('run before recording starts and stay out of the clip', {timeout: 120_000}, async () => {
    const {recordSteps} = await import('../src/record/record.ts');
    const {regionLuma} = await import('../src/media.ts');
    const server = createServer((req, res) => {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><body style="margin:0;background:#fff"><button id="b" style="font-size:40px"
        onclick="document.body.style.background='#000'">sign in</button></body>`);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const a = server.address();
    const url = a && typeof a === 'object' ? `http://127.0.0.1:${a.port}/` : '';
    const dir = mkdtempSync(join(tmpdir(), 'mr-video-record-before-'));
    try {
      const r = await recordSteps(parseSteps({url, before: [{action: 'click', selector: '#b'}], steps: [{action: 'pause', ms: 800}]}),
        join(dir, 'c.mp4'), {profileDir: join(dir, 'profile')});
      expect(r.ok).toBe(true);
      expect(regionLuma(r.clip, 0.1, 600, 300, 200, 200)).toBeLessThan(40);

      const bad = await recordSteps(parseSteps({url, before: [{action: 'click', selector: '#nope', timeoutMs: 500}], steps: [{action: 'pause', ms: 10}]}),
        join(dir, 'd.mp4'), {profileDir: join(dir, 'profile')});
      expect(bad.ok).toBe(false);
      expect(bad.error).toMatch(/^before\[0\]/);
    } finally {
      server.close();
    }
  });
});
