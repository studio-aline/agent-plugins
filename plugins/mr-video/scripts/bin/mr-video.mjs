#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, 'node_modules', 'tsx'))) {
  const setup = join(root, 'bin', 'setup.mjs');
  process.stdout.write(`${JSON.stringify({ok: false, needsSetup: true, error: `의존성이 설치되지 않았습니다. 먼저 node "${setup}" 를 실행하세요.`})}\n`);
  process.exit(1);
}

const {register} = await import('tsx/esm/api');
register();
await import('../src/cli.ts');
