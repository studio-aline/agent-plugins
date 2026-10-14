import {Line, Rect, Txt} from '@revideo/2d';
import {all, createRef} from '@revideo/core';
import type {Scene} from '../../plan.ts';
import {labelFontSize} from '../fit.ts';
import {COLOR, FONT, LAYOUT} from '../theme.ts';
import {revealAt} from '../../timing.ts';
import type {Beat, Builder} from '../types.ts';

const GAP = 56;

export {revealAt} from '../../timing.ts';
export const buildFlow: Builder<Extract<Scene, {type: 'flow'}>> = (s, stage) => {
  const n = s.nodes.length;
  const k = s.captions.length;
  const w = Math.min(250, (LAYOUT.stageWidth - (n - 1) * GAP) / n);
  const x0 = -((n * w + (n - 1) * GAP) / 2) + w / 2;
  const broken = new Set(s.broken ?? []);
  const changed = new Set(s.changed ?? []);
  const boxes = s.nodes.map(() => createRef<Rect>());
  const arrows = s.nodes.map(() => createRef<Line>());

  s.nodes.forEach((label, i) => {
    const stroke = broken.has(i) ? COLOR.bad : changed.has(i) ? COLOR.accent : COLOR.border;
    stage.add(
      <Rect ref={boxes[i]} x={x0 + i * (w + GAP)} width={w} height={120} radius={10} fill={COLOR.card}
            stroke={stroke} lineWidth={changed.has(i) ? 4 : 3} lineDash={broken.has(i) ? [10, 8] : []} opacity={0}>
        <Txt text={label} fontFamily={FONT.mono} fontSize={labelFontSize(label, w)} fill={broken.has(i) ? COLOR.bad : COLOR.fg}
             width={w - 24} textWrap textAlign="center" />
      </Rect>,
    );
    if (i > 0) {
      const xa = x0 + (i - 1) * (w + GAP) + w / 2 + 6;
      stage.add(
        <Line ref={arrows[i]} points={[[xa, 0], [xa + GAP - 12, 0]]} stroke={broken.has(i) ? COLOR.bad : COLOR.accent}
              lineWidth={4} endArrow arrowSize={12} lineDash={broken.has(i) ? [8, 6] : []} end={0} />,
      );
    }
  });

  const reveal = (i: number) => (i === 0 ? boxes[0]().opacity(1, 0.4) : all(arrows[i]().end(1, 0.4), boxes[i]().opacity(1, 0.4)));
  const marked = s.nodes.map((_, i) => i).filter(i => broken.has(i) || changed.has(i));

  return Array.from({length: k}, (_, c): Beat => () => {
    const steps = s.nodes.map((_, i) => i).filter(i => revealAt(i, n, k) === c).map(reveal);
    if (c === k - 1) steps.push(...marked.map(i => boxes[i]().scale(1.08, 0.25).to(1, 0.25)));
    return all(...steps);
  });
};
