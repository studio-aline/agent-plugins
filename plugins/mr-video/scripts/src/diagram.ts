// Pure helpers shared by plan checks (Node) and the mermaid rasterizer.
export type DiagramKind = 'flowchart' | 'sequence' | 'er' | 'other';

export function diagramKind(code: string): DiagramKind {
  const first = code.trim().split(/\s/)[0];
  if (first === 'flowchart' || first === 'graph') return 'flowchart';
  if (first === 'sequenceDiagram') return 'sequence';
  if (first === 'erDiagram') return 'er';
  return 'other';
}

export type Emphasis = {accent?: string[]; bad?: string[]} | null | undefined;

export interface DiagramFrames {
  frames: string[]; // PNG data URLs at 2× device scale, one per distinct emphasis step
  width: number; // CSS px at 1×
  height: number;
  /** Per frame: center of the emphasized nodes (CSS px from the picture's top-left), or null. */
  focus?: ({x: number; y: number} | null)[];
}

/** Emphasis for each caption: an entry persists until the next one; no emphasis → one plain picture. */
export function emphasisSteps(s: {emphasis?: Emphasis[] | null; captions: string[]}): Emphasis[] {
  const e = s.emphasis ?? [];
  if (e.length === 0) return [null];
  return s.captions.map((_, i) => e[Math.min(i, e.length - 1)] ?? null);
}

/** Whether a node or subgraph id appears as a whole word in the diagram source. */
export function hasDiagramId(code: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`, 'm').test(code);
}
