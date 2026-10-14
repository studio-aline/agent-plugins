import {Img, Node, Rect} from '@revideo/2d';
import {all, createRef, easeInOutCubic, Vector2} from '@revideo/core';
import type {DiagramFrames} from '../../diagram.ts';
import type {MermaidScene} from '../../plan.ts';
import {captionSeconds} from '../../timing.ts';
import {diagramLayout, panTarget} from '../fit.ts';
import {LAYOUT} from '../theme.ts';
import type {Beat} from '../types.ts';

const STAGE_H = LAYOUT.stageBottom - LAYOUT.stageTop;

/**
 * Pre-rasterized mermaid pictures (one per emphasis step) stacked and toggled per caption.
 * Diagrams too big to read when fitted stay at a readable scale inside a window that pans:
 * to the emphasized nodes when a step has them, otherwise from the top-left to the bottom-right.
 */
export function buildMermaid(s: MermaidScene, stage: Node, d: DiagramFrames): Beat[] {
  const layout = diagramLayout(d.width, d.height, LAYOUT.stageWidth, STAGE_H);
  const w = d.width * layout.scale;
  const h = d.height * layout.scale;
  const winW = Math.min(w, LAYOUT.stageWidth);
  const winH = Math.min(h, STAGE_H);
  const holder = createRef<Node>();
  const frames = d.frames.map(() => createRef<Img>());
  const k = s.captions.length;
  const stepOf = (i: number) => Math.min(i, d.frames.length - 1);

  // Where the picture sits for caption i. Steps without focus keep the previous position, unless
  // the scene has no focus at all, in which case it sweeps evenly across the captions.
  const hasFocus = (d.focus ?? []).some(Boolean);
  const positions: Vector2[] = [];
  for (let i = 0; i < k; i++) {
    const f = d.focus?.[stepOf(i)];
    const t = k === 1 ? 0 : i / (k - 1);
    positions.push(
      f
        ? new Vector2(panTarget(d.width, winW, layout.scale, f.x), panTarget(d.height, winH, layout.scale, f.y))
        : hasFocus
          ? (positions[i - 1] ?? new Vector2(panTarget(d.width, winW, layout.scale, 0), panTarget(d.height, winH, layout.scale, 0)))
          : new Vector2(
              panTarget(d.width, winW, layout.scale, 0) - layout.scrollX * t,
              panTarget(d.height, winH, layout.scale, 0) - layout.scrollY * t,
            ),
    );
  }

  stage.add(
    <Rect y={(LAYOUT.stageTop + LAYOUT.stageBottom) / 2} width={winW} height={winH} clip>
      <Node ref={holder} position={positions[0]} opacity={0}>
        {d.frames.map((src, i) => <Img ref={frames[i]} src={src} width={w} height={h} opacity={i === 0 ? 1 : 0} />)}
      </Node>
    </Rect>,
  );

  return s.captions.map((caption, i): Beat => function* () {
    frames.forEach((f, j) => f().opacity(j === stepOf(i) ? 1 : 0)); // emphasis changes at the cut
    const steps = [];
    if (i === 0) steps.push(holder().opacity(1, 0.4));
    if (layout.pan) {
      // A single-caption sweep uses the whole hold; otherwise move briskly to the next position.
      if (k === 1 && !hasFocus) {
        const end = new Vector2(positions[0].x - layout.scrollX, positions[0].y - layout.scrollY);
        steps.push(holder().position(end, captionSeconds(caption) - 0.3, easeInOutCubic));
      } else if (i > 0) {
        steps.push(holder().position(positions[i], 1.0, easeInOutCubic));
      }
    }
    yield* all(...steps);
  });
}
