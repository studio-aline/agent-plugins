import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {ZodError} from 'zod';
import {checkGrounding} from './grounding.ts';
import {contactSheet} from './media.ts';
import {buildBlock, inspectBody, sameBody, slug, upsertBlock, videoFileName} from './mr-body.ts';
import {checkPlan, parsePlan, planJsonSchema, type Plan} from './plan.ts';
import {planSeconds} from './timing.ts';
import {getDescription, saveDescription, uploadVideo} from './upload.ts';

const USAGE = `mr-video — GitLab MR 설명 영상 만들기

  mr-video schema
  mr-video workdir --project <group/repo> (--iid <N> | --branch <name>)
  mr-video validate <plan.json> [--repo <dir>]
  mr-video render <plan.json> [--out <video.mp4>]
  mr-video preview <video.mp4> <plan.json> [--out <preview.png>]
  mr-video upload <video.mp4> --project <group/repo>      (GITLAB_HOST, GITLAB_TOKEN 필요)
  mr-video description --project <group/repo> --iid <N> --out <body.md>   (MR 본문을 바이트 그대로 저장)
  mr-video save-description --project <group/repo> --iid <N> --current <body.md>   (GitLab MCP가 없는 호스트용: 본문 저장 후 대조)
  mr-video body [--current <body.md>] --inspect
  mr-video body [--current <body.md>] --upload <upload.json> --plan <plan.json> [--out <body.md>]
  mr-video same <a.md> <b.md>      (CRLF·BOM·끝 공백만 무시하고 같은지 비교, 다르면 종료 코드 1)

모든 결과는 stdout에 JSON(body 명령은 본문 텍스트)으로 출력합니다. 오류는 {"ok":false,"error":...}.`;

const print = (v: unknown) => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);

/**
 * Process env first; on Windows fall back to the user environment, because a value set with
 * `setx` is invisible to sessions (e.g. Claude Code) that were started before it.
 */
function env(name: 'GITLAB_HOST' | 'GITLAB_TOKEN'): string {
  if (process.env[name]) return process.env[name]!;
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    return out.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)`))?.[1].trim() ?? '';
  } catch {
    return '';
  }
}

function readPlan(file: string): Plan {
  return parsePlan(JSON.parse(readFileSync(file, 'utf8')));
}

function formatZod(e: ZodError): string[] {
  return e.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

async function main(argv: string[]): Promise<number> {
  const {values: o, positionals: [cmd, ...args]} = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: {type: 'string'},
      iid: {type: 'string'},
      branch: {type: 'string'},
      repo: {type: 'string'},
      out: {type: 'string'},
      current: {type: 'string'},
      upload: {type: 'string'},
      plan: {type: 'string'},
      inspect: {type: 'boolean'},
      help: {type: 'boolean', short: 'h'},
    },
  });

  switch (cmd) {
    case 'schema':
      print(planJsonSchema());
      return 0;

    case 'workdir': {
      if (!o.project || (!o.iid && !o.branch)) throw new Error('--project 와 --iid 또는 --branch 가 필요합니다');
      const root = process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share');
      const dir = join(root, 'mr-video', slug(o.project), o.iid ? `mr-${o.iid}` : slug(o.branch!));
      mkdirSync(dir, {recursive: true});
      print({dir});
      return 0;
    }

    case 'validate': {
      const [file] = args;
      if (!file) throw new Error('plan.json 경로가 필요합니다');
      let plan: Plan;
      try {
        plan = readPlan(file);
      } catch (e) {
        if (e instanceof ZodError) {
          print({ok: false, errors: formatZod(e), warnings: []});
          return 1;
        }
        throw e;
      }
      const structure = checkPlan(plan);
      const grounding = checkGrounding(plan, resolve(o.repo ?? process.cwd()));
      const errors = [...structure.errors, ...grounding.errors];
      const warnings = [...structure.warnings, ...grounding.warnings];
      print({ok: errors.length === 0, errors, warnings, seconds: Number(planSeconds(plan).toFixed(1)), scenes: plan.scenes.length});
      return errors.length === 0 ? 0 : 1;
    }

    case 'render': {
      const [file] = args;
      if (!file) throw new Error('plan.json 경로가 필요합니다');
      const plan = readPlan(file);
      const {errors} = checkPlan(plan);
      if (errors.length) {
        print({ok: false, errors});
        return 1;
      }
      const {renderPlan} = await import('./render/run.ts'); // keeps Revideo out of the fast commands
      const out = o.out ?? join(dirname(resolve(file)), videoFileName(plan.mr, plan.mr.head));
      const result = await renderPlan(plan, out);
      print({ok: result.qa.ok, ...result});
      return result.qa.ok ? 0 : 1;
    }

    case 'preview': {
      const [video, file] = args;
      if (!video || !file) throw new Error('video.mp4 와 plan.json 경로가 필요합니다');
      const {sceneEndTimes} = await import('./render/run.ts');
      const out = resolve(o.out ?? join(dirname(resolve(video)), 'preview.png'));
      contactSheet(resolve(video), sceneEndTimes(readPlan(file)), out);
      print({preview: out});
      return 0;
    }

    case 'upload': {
      const [video] = args;
      if (!video || !o.project) throw new Error('video.mp4 경로와 --project 가 필요합니다');
      const r = await uploadVideo({
        file: resolve(video),
        project: o.project,
        host: env('GITLAB_HOST'),
        token: env('GITLAB_TOKEN'),
      });
      print(r);
      return 0;
    }

    case 'description': {
      if (!o.project || !o.iid || !o.out) throw new Error('--project, --iid, --out 이 필요합니다');
      const r = await getDescription({
        host: env('GITLAB_HOST'),
        token: env('GITLAB_TOKEN'),
        project: o.project,
        iid: Number(o.iid),
      });
      writeFileSync(o.out, r.description);
      print({out: resolve(o.out), sha: r.sha, baseSha: r.baseSha, bytes: Buffer.byteLength(r.description)});
      return 0;
    }

    case 'save-description': {
      if (!o.project || !o.iid || !o.current) throw new Error('--project, --iid, --current <body.md> 가 필요합니다');
      const description = readFileSync(o.current, 'utf8');
      const r = await saveDescription({host: env('GITLAB_HOST'), token: env('GITLAB_TOKEN'), project: o.project, iid: Number(o.iid), description});
      const check = sameBody(description, r.description);
      print({ok: check.same, iid: r.iid, webUrl: r.webUrl, ...(check.same ? {} : {differsAtLine: check.line})});
      return check.same ? 0 : 1;
    }

    case 'body': {
      const current = o.current ? readFileSync(o.current, 'utf8') : '';
      if (o.inspect) {
        print(inspectBody(current));
        return 0;
      }
      if (!o.upload || !o.plan) throw new Error('--upload 와 --plan 이 필요합니다');
      const upload = JSON.parse(readFileSync(o.upload, 'utf8')) as {url?: unknown};
      if (typeof upload.url !== 'string' || !upload.url) throw new Error(`${o.upload}에 url이 없습니다 (upload 명령의 출력이어야 합니다)`);
      const plan = readPlan(o.plan);
      const block = buildBlock({url: upload.url, sha7: plan.mr.head.slice(0, 7), seconds: planSeconds(plan)});
      const body = upsertBlock(current, block);
      if (o.out) writeFileSync(o.out, body);
      else process.stdout.write(body);
      return 0;
    }

    case 'same': {
      const [a, b] = args;
      if (!a || !b) throw new Error('비교할 파일 두 개가 필요합니다');
      const r = sameBody(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
      print(r);
      return r.same ? 0 : 1;
    }

    default:
      process.stdout.write(`${USAGE}\n`);
      return cmd === undefined || o.help ? 0 : 2;
  }
}

// Calling process.exit() while fetch sockets are still closing trips a libuv assertion on Windows
// (exit 9 after a successful upload). Set the code and let the loop drain; force exit only if
// something (Revideo's browser, telemetry) keeps it alive.
function finish(code: number) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 3000).unref();
}

main(process.argv.slice(2)).then(finish, (e: Error) => {
  print({ok: false, error: e.message});
  process.stderr.write(`mr-video: ${e.message}\n`);
  finish(1);
});
