import {execFileSync} from 'node:child_process';
import type {CheckResult, Plan} from './plan.ts';

const lf = (s: string) => s.replace(/\r\n/g, '\n');
const posix = (p: string) => p.replace(/\\/g, '/');

function gitBytes(repo: string, args: string[]): Buffer | undefined {
  try {
    // quotePath=false: keep non-ASCII paths (e.g. Korean file names) as-is in diff output.
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: repo, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20,
    });
  } catch {
    return undefined;
  }
}

/** UTF-8 first; Korean C++ sources are often CP949, which the WHATWG "euc-kr" decoder covers. */
export function decodeSource(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

const git = (repo: string, args: string[]) => {
  const out = gitBytes(repo, args);
  return out === undefined ? undefined : decodeSource(out);
};

/** Checks every code scene against the real files at the plan's base and head commits. */
export function checkGrounding(plan: Plan, repo: string): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const {base, head} = plan.mr;

  for (const sha of [base, head]) {
    if (git(repo, ['cat-file', '-e', `${sha}^{commit}`]) === undefined) errors.push(`커밋 ${sha}를 ${repo}에서 찾을 수 없습니다`);
  }
  if (errors.length) return {errors, warnings};

  const changed = new Set((git(repo, ['diff', '--name-only', base, head]) ?? '').split('\n').map(l => l.trim()).filter(Boolean));

  plan.scenes.forEach((s, i) => {
    if (s.type !== 'code') return;
    const at = `scenes[${i}](code)`;
    const file = posix(s.file);
    if (!changed.has(file)) warnings.push(`${at}: ${file}은 base..head diff에 없는 파일입니다`);

    const checks: [string, string | undefined, string][] = [
      ['before', s.before, base],
      ['after', s.after, head],
    ];
    for (const [name, snippet, sha] of checks) {
      if (snippet === undefined) continue;
      const label = sha === base ? 'base' : 'head';
      const content = git(repo, ['show', `${sha}:${file}`]);
      if (content === undefined) {
        errors.push(`${at}: ${file}이 ${label}(${sha.slice(0, 7)})에 없습니다`);
      } else if (!lf(content).includes(lf(snippet))) {
        errors.push(`${at}: ${name} 코드가 ${label}(${sha.slice(0, 7)})의 ${file}에 그대로 존재하지 않습니다`);
      }
    }
  });
  return {errors, warnings};
}
