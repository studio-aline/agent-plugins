import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {checkGrounding} from '../src/grounding.ts';
import {parsePlan} from '../src/plan.ts';
import {CPP_AFTER, CPP_BEFORE, samplePlan} from './fixtures/sample-plan.ts';

let repo = '';
let base = '';
let head = '';

const git = (...args: string[]) => execFileSync('git', args, {cwd: repo, encoding: 'utf8'}).trim();

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'mr-video-grounding-'));
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');
  mkdirSync(join(repo, 'src'));
  // Base is committed with CRLF to prove line endings are normalised.
  writeFileSync(join(repo, 'src/Inventory.cpp'), `// header\r\n${CPP_BEFORE.replace(/\n/g, '\r\n')}\r\n`);
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  base = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'src/Inventory.cpp'), `// header\n${CPP_AFTER}\n`);
  writeFileSync(join(repo, 'src/Other.cpp'), 'int x;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'head');
  head = git('rev-parse', 'HEAD');
});

function plan() {
  const p = parsePlan(samplePlan());
  p.mr.base = base;
  p.mr.head = head;
  return p;
}

function codeScene(p: ReturnType<typeof plan>) {
  const s = p.scenes.find(x => x.type === 'code');
  if (!s || s.type !== 'code') throw new Error('no code scene');
  return s;
}

describe('checkGrounding', () => {
  it('passes when before/after exist at base/head', () => {
    expect(checkGrounding(plan(), repo)).toEqual({errors: [], warnings: []});
  });

  it('fails when after is not in the head file', () => {
    const p = plan();
    codeScene(p).after = CPP_AFTER.replace('total - dst.count', 'total - 1');
    codeScene(p).highlight = undefined;
    expect(checkGrounding(p, repo).errors.join()).toMatch(/after.*head/);
  });

  it('fails when before is not in the base file', () => {
    const p = plan();
    codeScene(p).before = CPP_AFTER;
    expect(checkGrounding(p, repo).errors.join()).toMatch(/before.*base/);
  });

  it('fails when the file does not exist at that commit', () => {
    const p = plan();
    codeScene(p).file = 'src/Missing.cpp';
    expect(checkGrounding(p, repo).errors.join()).toMatch(/Missing\.cpp/);
  });

  it('warns when the code file is not part of the diff', () => {
    const p = plan();
    // Same content at base and head is impossible here, so point at an unchanged path via a new commit.
    git('checkout', '-q', '-b', `w${Date.now()}`, head);
    writeFileSync(join(repo, 'src/Third.cpp'), 'int y;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'third');
    const third = git('rev-parse', 'HEAD');
    p.mr.base = head;
    p.mr.head = third;
    const s = codeScene(p);
    s.file = 'src/Inventory.cpp';
    s.before = undefined;
    expect(checkGrounding(p, repo).warnings.join()).toMatch(/diff/);
  });

  it('fails when a sha is unknown', () => {
    const p = plan();
    p.mr.head = 'deadbeef';
    expect(checkGrounding(p, repo).errors.join()).toMatch(/deadbeef/);
  });
});

describe('checkGrounding encodings and paths', () => {
  function repoWith(files: Record<string, Buffer | string>[]) {
    const dir = mkdtempSync(join(tmpdir(), 'mr-video-enc-'));
    const g = (...a: string[]) => execFileSync('git', a, {cwd: dir, encoding: 'utf8'}).trim();
    g('init', '-q');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 't');
    const shas = files.map((set, i) => {
      for (const [p, c] of Object.entries(set)) {
        mkdirSync(join(dir, p, '..'), {recursive: true});
        writeFileSync(join(dir, p), c);
      }
      g('add', '-A');
      g('commit', '-q', '-m', `c${i}`);
      return g('rev-parse', 'HEAD');
    });
    return {dir, shas};
  }

  function codePlan(file: string, after: string, base: string, head: string) {
    const p = parsePlan(samplePlan());
    p.mr.base = base;
    p.mr.head = head;
    const s = p.scenes.find(x => x.type === 'code');
    if (!s || s.type !== 'code') throw new Error();
    Object.assign(s, {file, after, before: undefined, highlight: undefined});
    return p;
  }

  it('reads CP949/EUC-KR sources (Korean comments)', () => {
    // "int a; // 한글" in EUC-KR: 한 = C7 D1, 글 = B1 DB
    const cp949 = Buffer.concat([Buffer.from('int a; // '), Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]), Buffer.from('\r\n')]);
    const {dir, shas} = repoWith([{'src/A.cpp': 'int b;\n'}, {'src/A.cpp': cp949}]);
    expect(checkGrounding(codePlan('src/A.cpp', 'int a; // 한글', shas[0], shas[1]), dir).errors).toEqual([]);
  });

  it('accepts Windows backslash paths', () => {
    const {dir, shas} = repoWith([{'src/A.cpp': 'int b;\n'}, {'src/A.cpp': 'int a;\n'}]);
    expect(checkGrounding(codePlan(String.raw`src\A.cpp`, 'int a;', shas[0], shas[1]), dir)).toEqual({errors: [], warnings: []});
  });

  it('does not warn about non-ASCII paths that are in the diff', () => {
    const {dir, shas} = repoWith([{'src/x.cpp': 'int b;\n'}, {'src/인벤토리.cpp': 'int a;\n'}]);
    expect(checkGrounding(codePlan('src/인벤토리.cpp', 'int a;', shas[0], shas[1]), dir).warnings).toEqual([]);
  });
});
