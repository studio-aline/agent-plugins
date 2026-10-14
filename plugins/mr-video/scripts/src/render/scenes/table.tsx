import {Layout, Node, Rect, Txt} from '@revideo/2d';
import {all, createRef} from '@revideo/core';
import type {TableScene} from '../../plan.ts';
import {columnWidths} from '../fit.ts';
import {COLOR, FONT, LAYOUT} from '../theme.ts';
import type {Beat} from '../types.ts';
import {revealAt} from './flow.tsx';

export function buildTable(s: TableScene, stage: Node): Beat[] {
  const widths = columnWidths([s.columns, ...s.rows], LAYOUT.stageWidth);
  const table = createRef<Layout>();
  const rows = s.rows.map(() => createRef<Rect>());

  const cell = (text: string, col: number, header: boolean, accentRow: boolean) => (
    <Rect width={widths[col]} padding={[12, 14]} layout>
      <Txt text={text} fontFamily={FONT.ui} fontSize={header ? 19 : 18} textWrap grow={1}
           fontWeight={header || accentRow ? 700 : 400}
           fill={col === s.accentCol ? COLOR.accent : header ? COLOR.muted : COLOR.fg} />
    </Rect>
  );

  stage.add(
    <Layout ref={table} layout direction="column" gap={6} y={(LAYOUT.stageTop + LAYOUT.stageBottom) / 2}>
      <Rect layout radius={8} fill="#11161d">{s.columns.map((c, ci) => cell(c, ci, true, false))}</Rect>
      {s.rows.map((r, ri) => (
        <Rect ref={rows[ri]} layout radius={8} fill={COLOR.card} opacity={0}
              stroke={ri === s.accentRow ? COLOR.accent : COLOR.border} lineWidth={ri === s.accentRow ? 3 : 1}>
          {r.map((c, ci) => cell(c, ci, false, ri === s.accentRow))}
        </Rect>
      ))}
    </Layout>,
  );

  // Long cells can make the table taller than the stage; shrink the whole table rather than clip it.
  const fit = Math.min(1, (LAYOUT.stageBottom - LAYOUT.stageTop) / table().height());
  table().scale(fit);

  const k = s.captions.length;
  return Array.from({length: k}, (_, c): Beat => () =>
    all(...s.rows.map((_, ri) => ri).filter(ri => revealAt(ri, s.rows.length, k) === c).map(ri => rows[ri]().opacity(1, 0.35))),
  );
}
