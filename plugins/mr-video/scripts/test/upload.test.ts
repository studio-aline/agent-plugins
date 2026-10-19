import {createServer, type IncomingMessage, type Server} from 'node:http';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {getDescription, postNote, saveDescription, uploadVideo} from '../src/upload.ts';

let server: Server;
let host = '';
let status = 201;
let last: {url?: string; token?: string; contentType?: string; body: string} = {body: ''};

const read = (req: IncomingMessage) =>
  new Promise<string>(res => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks).toString('latin1')));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    last = {url: req.url, token: req.headers['private-token'] as string, contentType: req.headers['content-type'], body: await read(req)};
    res.writeHead(status, {'content-type': 'application/json'});
    res.end(
      status === 201
        ? JSON.stringify({alt: 'mr-1-abc1234', url: '/uploads/s3cr3t/mr-1-abc1234.mp4', markdown: '![mr-1-abc1234](/uploads/s3cr3t/mr-1-abc1234.mp4)'})
        : JSON.stringify({message: 'nope'}),
    );
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (addr && typeof addr === 'object') host = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server.close());

function video() {
  const dir = mkdtempSync(join(tmpdir(), 'mr-video-upload-'));
  const file = join(dir, 'mr-1-abc1234.mp4');
  writeFileSync(file, Buffer.from('fake-mp4-bytes'));
  return file;
}

describe('uploadVideo', () => {
  it('posts multipart to the project uploads endpoint', async () => {
    status = 201;
    const r = await uploadVideo({file: video(), project: 'game/server', host, token: 'tok'});
    expect(r.url).toBe('/uploads/s3cr3t/mr-1-abc1234.mp4');
    expect(last.url).toBe('/api/v4/projects/game%2Fserver/uploads');
    expect(last.token).toBe('tok');
    expect(last.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(last.body).toMatch(/name="file"; filename="mr-1-abc1234.mp4"/);
    expect(last.body).toMatch(/Content-Type: video\/mp4/);
    expect(last.body).toContain('fake-mp4-bytes');
  });

  it('explains 401 as a token problem', async () => {
    status = 401;
    await expect(uploadVideo({file: video(), project: 'g/p', host, token: 'bad'})).rejects.toThrow(/GITLAB_TOKEN/);
  });

  it('explains 413 as a size problem', async () => {
    status = 413;
    await expect(uploadVideo({file: video(), project: 'g/p', host, token: 't'})).rejects.toThrow(/용량/);
  });

  it('explains 404 as a project problem', async () => {
    status = 404;
    await expect(uploadVideo({file: video(), project: 'g/p', host, token: 't'})).rejects.toThrow(/g\/p/);
  });

  it('requires a token', async () => {
    await expect(uploadVideo({file: video(), project: 'g/p', host, token: ''})).rejects.toThrow(/GITLAB_TOKEN/);
  });
});

describe('getDescription', () => {
  it('returns the exact description and diff refs', async () => {
    status = 201;
    const mock = createServer((req, res) => {
      last = {url: req.url, token: req.headers['private-token'] as string, body: ''};
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({description: '## 개요\r\n`a` "b"', sha: 'abc', diff_refs: {base_sha: 'b1', head_sha: 'h1', start_sha: 's1'}}));
    });
    await new Promise<void>(r => mock.listen(0, '127.0.0.1', r));
    const addr = mock.address();
    const h = addr && typeof addr === 'object' ? `http://127.0.0.1:${addr.port}` : '';
    const r = await getDescription({host: h, token: 'tok', project: 'group/project', iid: 2622});
    mock.close();
    expect(last.url).toBe('/api/v4/projects/group%2Fproject/merge_requests/2622');
    expect(last.token).toBe('tok');
    expect(r).toEqual({description: '## 개요\r\n`a` "b"', sha: 'abc', baseSha: 'b1'});
  });
});

describe('saveDescription', () => {
  it('PUTs the description as JSON and returns what GitLab stored', async () => {
    let seen: {method?: string; url?: string; token?: string; body?: string} = {};
    const mock = createServer(async (req, res) => {
      seen = {method: req.method, url: req.url, token: req.headers['private-token'] as string, body: Buffer.from(await read(req), 'latin1').toString('utf8')};
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({iid: 7, web_url: 'https://g/x/-/merge_requests/7', description: JSON.parse(seen.body!).description}));
    });
    await new Promise<void>(r => mock.listen(0, '127.0.0.1', r));
    const addr = mock.address();
    const h = addr && typeof addr === 'object' ? `http://127.0.0.1:${addr.port}` : '';
    const body = '<!-- mr-video:start -->\n본문 `코드` "따옴표"\r\n끝';
    const r = await saveDescription({host: h, token: 'tok', project: 'group/project', iid: 7, description: body});
    mock.close();
    expect(seen.method).toBe('PUT');
    expect(seen.url).toBe('/api/v4/projects/group%2Fproject/merge_requests/7');
    expect(seen.token).toBe('tok');
    expect(JSON.parse(seen.body!)).toEqual({description: body});
    expect(r).toEqual({iid: 7, webUrl: 'https://g/x/-/merge_requests/7', description: body});
  });
});

describe('postNote', () => {
  it('POSTs the note as JSON and returns its link and stored body', async () => {
    let seen: {method?: string; url?: string; token?: string; body?: string} = {};
    const mock = createServer(async (req, res) => {
      seen = {method: req.method, url: req.url, token: req.headers['private-token'] as string, body: Buffer.from(await read(req), 'latin1').toString('utf8')};
      res.writeHead(201, {'content-type': 'application/json'});
      res.end(JSON.stringify({id: 42, body: JSON.parse(seen.body!).body}));
    });
    await new Promise<void>(r => mock.listen(0, '127.0.0.1', r));
    const addr = mock.address();
    const h = addr && typeof addr === 'object' ? `http://127.0.0.1:${addr.port}` : '';
    const body = '<!-- mr-video:note -->\n## 🎬 설명 영상 기록 · 변경분\n`a` "b"';
    const r = await postNote({host: h, token: 'tok', project: 'group/project', iid: 7, body});
    mock.close();
    expect(seen.method).toBe('POST');
    expect(seen.url).toBe('/api/v4/projects/group%2Fproject/merge_requests/7/notes');
    expect(seen.token).toBe('tok');
    expect(JSON.parse(seen.body!)).toEqual({body});
    expect(r).toEqual({id: 42, webUrl: `${h}/group/project/-/merge_requests/7#note_42`, body});
  });

  it('reports a rejected note with its status', async () => {
    status = 403;
    await expect(postNote({host, token: 't', project: 'g/p', iid: 1, body: 'x'})).rejects.toThrow(/코멘트 작성 실패\(403\)/);
  });
});
