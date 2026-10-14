import {Layout, Rect, Txt} from '@revideo/2d';
import {createRef} from '@revideo/core';
import type {Scene} from '../../plan.ts';
import {COLOR, FONT, LAYOUT} from '../theme.ts';
import type {Builder} from '../types.ts';

const COL_W = 540;
// Both columns hang from the same top edge so their headings line up.
const TOP = LAYOUT.stageTop + 40;

function card(text: string, color: string, font: string, dashed = false) {
  return (
    <Rect layout padding={[14, 18]} width={COL_W} radius={8} fill={COLOR.card} stroke={color} lineWidth={2}
          lineDash={dashed ? [8, 6] : []}>
      <Txt text={text} fontFamily={font} fontSize={18} fill={color} textWrap grow={1} />
    </Rect>
  );
}

export const buildTests: Builder<Extract<Scene, {type: 'tests'}>> = (s, stage) => {
  const ran = createRef<Layout>();
  const notRun = createRef<Layout>();
  stage.add(
    <>
      <Layout ref={ran} layout direction="column" gap={14} x={-300} y={TOP} offset={[0, -1]} opacity={0}>
        <Txt text="실행한 테스트" fontFamily={FONT.ui} fontSize={22} fontWeight={700} fill={COLOR.muted} />
        {s.ran.length === 0
          ? card('이 커밋에서 실행한 테스트 없음', COLOR.muted, FONT.ui)
          : s.ran.map(t => card(`${t.result === 'pass' ? 'PASS' : 'FAIL'}  ${t.name}`, t.result === 'pass' ? COLOR.ok : COLOR.bad, FONT.mono))}
      </Layout>
      <Layout ref={notRun} layout direction="column" gap={14} x={300} y={TOP} offset={[0, -1]} opacity={0}>
        <Txt text="실행하지 않은 것" fontFamily={FONT.ui} fontSize={22} fontWeight={700} fill={COLOR.muted} />
        {s.notRun.length === 0
          ? card('없음', COLOR.muted, FONT.ui)
          : s.notRun.map(t => card(`NOT RUN  ${t}`, COLOR.bad, FONT.ui, true))}
      </Layout>
    </>,
  );
  return [() => ran().opacity(1, 0.4), () => notRun().opacity(1, 0.4)];
};
