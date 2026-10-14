import {Layout, Rect, Txt} from '@revideo/2d';
import {all, createRef} from '@revideo/core';
import type {Scene} from '../../plan.ts';
import {COLOR, FONT} from '../theme.ts';
import type {Beat, Builder} from '../types.ts';

export const buildChecklist: Builder<Extract<Scene, {type: 'checklist'}>> = (s, stage) => {
  const rows = s.items.map(() => createRef<Rect>());
  stage.add(
    <Layout layout direction="column" gap={16} width={900}>
      {s.items.map((item, i) => (
        <Rect ref={rows[i]} layout alignItems="center" gap={20} padding={[14, 20]} radius={8} fill={COLOR.card}
              stroke={COLOR.border} lineWidth={2} opacity={0}>
          <Txt text={String(i + 1)} fontFamily={FONT.mono} fontSize={24} fontWeight={700} fill={COLOR.accent} />
          <Txt text={item} fontFamily={FONT.ui} fontSize={24} fill={COLOR.fg} textWrap grow={1} />
        </Rect>
      ))}
    </Layout>,
  );
  // One item per caption; leftovers appear with the last caption.
  const k = s.captions.length;
  return Array.from({length: k}, (_, c): Beat => () =>
    all(...rows.filter((_, i) => Math.min(i, k - 1) === c).map(r => r().opacity(1, 0.4))),
  );
};
