// Shared by the CLI and the in-browser scene, so keep it dependency-free.

/** Seconds a caption stays on screen: Korean reading speed ≈ 12 chars/s plus a fixed beat. */
export function captionSeconds(caption: string): number {
  return Math.max(2.2, caption.length / 12 + 0.9);
}

/** Caption index at which item i of n appears: items are spread evenly over k captions. */
export function revealAt(i: number, n: number, k: number): number {
  return Math.floor((i * k) / n);
}

export const TYPE_CPS = 32; // terminal typing speed, characters per second
export const typeSeconds = (cmd: string) => Math.min(1.4, cmd.length / TYPE_CPS);
const OUTPUT_FADE = 0.25;
const READ_AFTER_TYPING = 0.8;

interface Timed {
  type?: string;
  captions: string[];
  lines?: {cmd: string; out?: string}[];
}

/** How long caption i holds: its reading time, or longer if the commands typed during it need it. */
export function holdSeconds(scene: Timed, i: number): number {
  const read = captionSeconds(scene.captions[i]);
  if (scene.type !== 'terminal' || !scene.lines) return read;
  const k = scene.captions.length;
  const typing = scene.lines
    .filter((_, li) => revealAt(li, scene.lines!.length, k) === i)
    .reduce((sum, l) => sum + typeSeconds(l.cmd) + (l.out ? OUTPUT_FADE : 0), 0);
  return typing === 0 ? read : Math.max(read, typing + READ_AFTER_TYPING);
}

export function sceneSeconds(scene: Timed): number {
  return scene.captions.reduce((sum, _, i) => sum + holdSeconds(scene, i), 0);
}

export function planSeconds(plan: {scenes: Timed[]}): number {
  return plan.scenes.reduce((sum, s) => sum + sceneSeconds(s), 0);
}
