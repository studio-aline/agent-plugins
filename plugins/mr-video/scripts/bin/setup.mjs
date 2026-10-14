#!/usr/bin/env node
// Installs mr-video's npm dependencies next to this script: on first use and after a plugin update
// (installed plugin snapshots do not carry node_modules). Dependency-free on purpose.
// npm's own output goes to stderr; stdout carries one JSON result line like the CLI.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const print = v => process.stdout.write(`${JSON.stringify(v)}\n`);

// npm is a .cmd shim on Windows, which needs a shell; the command is a fixed string with nothing interpolated.
const options = {cwd: root, stdio: ['ignore', 2, 2]};
const r = process.platform === 'win32'
  ? spawnSync('npm ci --no-audit --no-fund', {...options, shell: true})
  : spawnSync('npm', ['ci', '--no-audit', '--no-fund'], options);

const ok = r.status === 0 && existsSync(join(root, 'node_modules', 'tsx'));
print(ok ? {ok: true, root} : {ok: false, error: `npm ci 실패 (종료 코드 ${r.status ?? r.error?.message}). 네트워크·프록시를 확인하세요.`});
process.exitCode = ok ? 0 : 1;
