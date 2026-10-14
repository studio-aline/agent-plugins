/**
 * Beat i plays with caption i. Beats beyond the last caption play, in order, with the last caption,
 * so a scene with fewer captions than beats never hides content (e.g. the "not run" tests column).
 */
export function scheduleBeats<T>(beats: T[], captions: number): T[][] {
  return Array.from({length: captions}, (_, i) => (i === captions - 1 ? beats.slice(i) : beats.slice(i, i + 1)));
}
