import {renderVideo} from '@revideo/renderer';
import {copyFileSync, mkdirSync, rmSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodePlan} from '../codec.ts';
import {postprocess, qaVideo, sha256, type QaReport} from '../media.ts';
import type {Plan} from '../plan.ts';
import {planSeconds, sceneSeconds} from '../timing.ts';
import {type DiagramFrames, emphasisSteps} from '../diagram.ts';
import {renderDiagrams} from './mermaid.ts';
import type {ClipAsset, RenderPlan} from './types.ts';

const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));
// Vite serves PKG_ROOT/public at the site root; recordings are copied there for one render.
const CLIP_DIR = 'mr-video-clips';

export interface RenderResult {
  video: string;
  seconds: number;
  bytes: number;
  sha256: string;
  renderSeconds: number;
  qa: QaReport;
}

export async function renderPlan(plan: Plan, outFile: string): Promise<RenderResult> {
  process.env.DISABLE_TELEMETRY = 'true';
  const out = resolve(outFile);
  const started = Date.now();
  const prevCwd = process.cwd();
  // Before touching console/cwd: a mermaid syntax error must not leave them changed.
  const diagrams = await prepareDiagrams(plan);
  const tag = `render-${process.pid}-${Date.now()}`;
  const files: string[] = [];
  // Revideo resolves projectFile against cwd and logs with console.log/info; keep stdout for our JSON.
  const {log, info} = console;
  console.log = console.info = (...a: unknown[]) => console.error(...a);
  process.chdir(PKG_ROOT);
  const name = `${tag}.mp4` as const;
  const raw = resolve(PKG_ROOT, 'output', name); // Revideo's default outDir; removed even if rendering fails
  try {
    const browserPlan: RenderPlan = {...plan, diagrams, clips: prepareClips(plan, tag, files)};
    await renderVideo({
      projectFile: './src/render/project.ts',
      variables: {plan: encodePlan(browserPlan)},
      settings: {
        outFile: name,
        workers: 1, // more workers were slower in the spike
        logProgress: false,
        puppeteer: {headless: 'shell'},
        viteConfig: {logLevel: 'error'},
        projectSettings: {size: {x: 1280, y: 720}},
      },
    });
    postprocess(raw, out);
  } finally {
    rmSync(raw, {force: true});
    for (const f of files) rmSync(f, {force: true});
    process.chdir(prevCwd);
    console.log = log;
    console.info = info;
  }

  const qa = qaVideo(out, planSeconds(plan));
  return {
    video: out,
    seconds: qa.seconds,
    bytes: statSync(out).size,
    sha256: sha256(out),
    renderSeconds: (Date.now() - started) / 1000,
    qa,
  };
}

/**
 * Copy each clip scene's recording where the render server can serve it. The plan must have gone
 * through resolveClips. Copied paths go into `files` (before copying) so the caller can remove them.
 */
function prepareClips(plan: Plan, tag: string, files: string[]): Record<number, ClipAsset> {
  const clips: Record<number, ClipAsset> = {};
  for (const [i, s] of plan.scenes.entries()) {
    if (s.type !== 'clip') continue;
    const c = s as typeof s & {clipWidth?: number; clipHeight?: number; clipSeconds?: number};
    if (!c.clipSeconds || !c.clipWidth || !c.clipHeight) throw new Error(`scenes[${i}](clip): 녹화 파일 정보가 없습니다(resolveClips를 거치지 않음)`);
    const name = `${tag}-${i}.mp4`;
    const dest = resolve(PKG_ROOT, 'public', CLIP_DIR, name);
    mkdirSync(resolve(PKG_ROOT, 'public', CLIP_DIR), {recursive: true});
    files.push(dest);
    copyFileSync(s.file, dest);
    clips[i] = {src: `/${CLIP_DIR}/${name}`, width: c.clipWidth, height: c.clipHeight};
  }
  return clips;
}

/** Rasterize every mermaid scene (one picture per emphasis step), keyed by scene index. */
async function prepareDiagrams(plan: Plan): Promise<Record<number, DiagramFrames>> {
  const scenes = plan.scenes.flatMap((s, i) => (s.type === 'mermaid' ? [{i, s}] : []));
  const frames = await renderDiagrams(scenes.map(({s}) => ({code: s.code, steps: emphasisSteps(s)})), plan.theme);
  return Object.fromEntries(scenes.map(({i}, n) => [i, frames[n]]));
}

/** A moment near the end of each scene, when all of its beats have played. */
export function sceneEndTimes(plan: Plan): number[] {
  let t = 0;
  return plan.scenes.map(s => {
    t += sceneSeconds(s);
    return Math.max(0, t - 0.2);
  });
}
