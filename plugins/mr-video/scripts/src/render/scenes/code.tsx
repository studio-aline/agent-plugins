import {Code, Rect} from '@revideo/2d';
import {createRef} from '@revideo/core';
import {detectLang, usesJsx} from '../../lang.ts';
import type {CodeScene} from '../../plan.ts';
import {literalPattern} from '../../regex.ts';
import {highlighterFor} from '../highlight.ts';
import {COLOR, FONT, LAYOUT} from '../theme.ts';
import {type Beat, type Builder, idle} from '../types.ts';

export const buildCode: Builder<CodeScene> = (s, stage, plan) => {
  const card = createRef<Rect>();
  const code = createRef<Code>();
  stage.add(
    <Rect ref={card} fill={COLOR.card} radius={12} padding={28} stroke={COLOR.border} lineWidth={2} layout
          y={(LAYOUT.stageTop + LAYOUT.stageBottom) / 2}>
      <Code ref={code} highlighter={highlighterFor(detectLang(s.file) ?? plan.lang ?? 'cpp', plan.theme, usesJsx(s.file))} code={s.after} fill={COLOR.fg} fontFamily={FONT.mono} fontSize={24} />
    </Rect>,
  );

  // Fit the larger of before/after into the stage area so long snippets never cover the title.
  const measure = () => ({w: card().width(), h: card().height()});
  const after = measure();
  if (s.before !== undefined) code().code(s.before);
  const before = measure();
  const fit = Math.min(
    1,
    LAYOUT.stageWidth / Math.max(after.w, before.w),
    (LAYOUT.stageBottom - LAYOUT.stageTop) / Math.max(after.h, before.h),
  );
  card().scale(fit);

  // Look the range up when the beat runs, not when it is created: with fewer captions the morph to
  // `after` is chained right before this in the same caption, and `highlight` exists only in `after`.
  const select: Beat = s.highlight === undefined
    ? idle
    : function* () {
        yield* code().selection(code().findFirstRange(literalPattern(s.highlight!)), 0.6);
      };

  if (s.before === undefined) return [idle, select];
  return [idle, () => code().code(s.after, 1.2), select];
};
