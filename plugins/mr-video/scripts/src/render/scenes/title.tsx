import {Txt} from '@revideo/2d';
import {all, createRef} from '@revideo/core';
import type {Scene} from '../../plan.ts';
import {COLOR, FONT} from '../theme.ts';
import type {Builder} from '../types.ts';

export const buildTitle: Builder<Extract<Scene, {type: 'title'}>> = (s, stage, plan) => {
  const title = createRef<Txt>();
  const rest = createRef<Txt>();
  const id = plan.mr.iid !== undefined ? `MR !${plan.mr.iid}` : 'MR (작성 전)';
  const meta = s.meta ?? [id, plan.mr.branch, plan.mr.head.slice(0, 7)].filter(Boolean).join(' · ');
  stage.add(
    <>
      <Txt ref={title} text={s.title} fontFamily={FONT.ui} fontSize={46} fontWeight={700} fill={COLOR.fg}
           y={-50} width={1180} textWrap textAlign="center" opacity={0} />
      <Txt ref={rest} fontFamily={FONT.ui} fontSize={24} fill={COLOR.muted} y={40} width={1100} textWrap textAlign="center"
           text={s.summary ?? ''} opacity={0} />
      <Txt text={meta} fontFamily={FONT.mono} fontSize={22} fill={COLOR.accent} y={110} />
    </>,
  );
  return [() => all(title().opacity(1, 0.5), rest().opacity(1, 0.5))];
};
