// Popups, new tabs and frames must not reach anything but localhost. 127.0.0.2 is loopback, so a
// request there is observable, but it is not an address the recorder accepts.
import {createServer, type Server} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {parseSteps} from '../src/record/steps.ts';

describe('recording stays on localhost', () => {
  let app: Server;
  let outside: Server;
  let origin = '';
  let other = '';
  const hits: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'mr-video-isolation-'));
  const listen = async (srv: Server, host: string) => {
    await new Promise<void>(r => srv.listen(0, host, r));
    const a = srv.address();
    return a && typeof a === 'object' ? `http://${host}:${a.port}` : '';
  };

  beforeAll(async () => {
    outside = createServer((req, res) => {
      hits.push(req.url ?? '');
      res.end('outside');
    });
    other = await listen(outside, '127.0.0.2');
    app = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, {location: `${other}/redirect`});
        return res.end();
      }
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      if (req.url === '/frame') return res.end(`<!doctype html><body><iframe src="${other}/frame"></iframe></body>`);
      res.end(`<!doctype html><body>
        <a id="tab" target="_blank" href="${other}/tab">tab</a>
        <button id="win" onclick="window.open('${other}/win')">win</button>
        <a id="go" href="/redirect">go</a></body>`);
    });
    origin = await listen(app, '127.0.0.1');
  });
  afterAll(() => {
    app.close();
    outside.close();
  });

  const record = async (path: string, steps: unknown[], name: string) => {
    const {recordSteps} = await import('../src/record/record.ts');
    return recordSteps(parseSteps({url: `${origin}${path}`, steps}), join(dir, `${name}.mp4`), {profileDir: join(dir, 'profile')});
  };

  it.each([
    ['a target=_blank link', '/', [{action: 'click', selector: '#tab'}, {action: 'pause', ms: 500}]],
    ['window.open', '/', [{action: 'click', selector: '#win'}, {action: 'pause', ms: 500}]],
    ['an external frame', '/frame', [{action: 'pause', ms: 500}]],
    ['a server redirect', '/', [{action: 'click', selector: '#go'}, {action: 'pause', ms: 500}]],
  ])('blocks %s', {timeout: 120_000}, async (_, path, steps) => {
    hits.length = 0;
    const r = await record(path as string, steps as unknown[], String(_).replace(/W+/g, '-'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/127.0.0.2|새 창/);
    expect(hits).toEqual([]);
  });
});
