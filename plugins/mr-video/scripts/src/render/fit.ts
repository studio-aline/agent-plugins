// Pure layout math, unit-tested in Node.

const ADVANCE = 0.55; // Consolas advance width in em
const PADDING = 24;

/** Width of a word in em-advances: Hangul and other wide glyphs count double. */
function advances(word: string): number {
  let n = 0;
  for (const ch of word) n += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1;
  return n;
}

/**
 * Column widths summing to `total`, proportional to each column's longest cell (Hangul counts
 * double), with a floor so short columns stay legible.
 */
export function columnWidths(cells: string[][], total: number, floor = 120): number[] {
  const cols = cells[0].length;
  const weight = Array.from({length: cols}, (_, c) => Math.max(4, ...cells.map(r => advances(r[c] ?? ''))));
  // Every column gets the floor; the remainder is split by weight.
  const sum = weight.reduce((a, b) => a + b, 0);
  const rest = Math.max(0, total - floor * cols);
  return weight.map(w => Math.floor(floor + (w / sum) * rest));
}

/** Smallest diagram scale at which mermaid's 18 px text stays readable in a 720p frame. */
export const MIN_DIAGRAM_SCALE = 0.62;

export interface DiagramLayout {
  scale: number;
  pan: boolean;
  scrollX: number; // how far the picture overflows the window, in stage px
  scrollY: number;
}

/**
 * Fit a diagram into the stage. If fitting would shrink text below readability, keep a readable
 * scale instead (width-fit for tall diagrams, MIN_DIAGRAM_SCALE for wide ones) and pan.
 */
export function diagramLayout(w: number, h: number, stageW: number, stageH: number): DiagramLayout {
  const fit = Math.min(1.2, stageW / w, stageH / h);
  if (fit >= MIN_DIAGRAM_SCALE) return {scale: fit, pan: false, scrollX: 0, scrollY: 0};
  const scale = Math.min(1, Math.max(MIN_DIAGRAM_SCALE, stageW / w));
  return {
    scale,
    pan: true,
    scrollX: Math.max(0, w * scale - stageW),
    scrollY: Math.max(0, h * scale - stageH),
  };
}

/**
 * Offset of the picture's center (in window coordinates, one axis) that puts `focus` (CSS px
 * from the picture's start edge) in the middle of the window, clamped so no blank shows.
 */
export function panTarget(size: number, window: number, scale: number, focus: number): number {
  const scaled = size * scale;
  if (scaled <= window) return 0;
  const start = scaled / 2 - window / 2; // picture's start edge at the window's start edge
  const end = start - (scaled - window);
  return Math.min(start, Math.max(end, scaled / 2 - focus * scale));
}

/** Largest font size (12–20 px) at which the longest unbreakable word of `label` fits a box `width` wide. */
export function labelFontSize(label: string, width: number, max = 20, min = 12): number {
  const longest = Math.max(1, ...label.split(/\s+/).map(advances));
  const fit = Math.floor((width - PADDING) / (longest * ADVANCE));
  return Math.max(min, Math.min(max, fit));
}
