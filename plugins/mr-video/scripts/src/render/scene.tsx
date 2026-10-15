import {Node, Rect, Txt, makeScene2D} from '@revideo/2d';
import {all, chain, createRef, useScene, waitFor} from '@revideo/core';
import {decodePlan} from '../codec.ts';
import type {Scene} from '../plan.ts';
import {holdSeconds} from '../timing.ts';
import {buildChecklist} from './scenes/checklist.tsx';
import {buildCode} from './scenes/code.tsx';
import {buildFlow} from './scenes/flow.tsx';
import {buildMermaid} from './scenes/mermaid.tsx';
import {buildTable} from './scenes/table.tsx';
import {buildTerminal} from './scenes/terminal.tsx';
import {buildTests} from './scenes/tests.tsx';
import {buildTitle} from './scenes/title.tsx';
import {scheduleBeats} from './schedule.ts';
import {applyTheme, COLOR, FONT, LAYOUT} from './theme.ts';
import type {Beat, RenderPlan} from './types.ts';

function build(s: Scene, stage: Node, plan: RenderPlan, index: number): Beat[] {
  switch (s.type) {
    case 'title': return buildTitle(s, stage, plan);
    case 'flow': return buildFlow(s, stage, plan);
    case 'code': return buildCode(s, stage, plan);
    case 'tests': return buildTests(s, stage, plan);
    case 'checklist': return buildChecklist(s, stage, plan);
    case 'table': return buildTable(s, stage);
    case 'terminal': return buildTerminal(s, stage);
    case 'mermaid': {
      const d = plan.diagrams?.[index];
      if (!d) throw new Error(`scenes[${index}]: 다이어그램 이미지가 준비되지 않았습니다`);
      return buildMermaid(s, stage, d);
    }
  }
}

export default makeScene2D('mr', function* (view) {
  const plan = decodePlan<RenderPlan>(useScene().variables.get('plan', '')());
  applyTheme(plan.theme);
  view.fill(COLOR.bg);

  const id = plan.mr.iid !== undefined ? `!${plan.mr.iid}` : plan.mr.branch;
  const title = createRef<Txt>();
  const caption = createRef<Txt>();
  view.add(
    <>
      <Txt text={`${id} · ${plan.title} · ${plan.mr.head.slice(0, 7)}`} fontFamily={FONT.ui} fontSize={18}
           fill={COLOR.muted} y={LAYOUT.headerY} />
      <Txt ref={title} text="" fontFamily={FONT.ui} fontSize={34} fontWeight={700} fill={COLOR.fg} y={LAYOUT.titleY} />
      <Rect width={LAYOUT.width} height={LAYOUT.captionHeight} y={LAYOUT.captionY} fill={COLOR.band} />
      <Txt ref={caption} text="" fontFamily={FONT.ui} fontSize={28} fill={COLOR.fg} y={LAYOUT.captionY}
           width={LAYOUT.stageWidth} textWrap textAlign="center" />
    </>,
  );

  for (const [index, s] of plan.scenes.entries()) {
    const stage = createRef<Node>();
    view.add(<Node ref={stage} />);
    title().text(s.type === 'title' ? '' : s.title);
    const steps = scheduleBeats(build(s, stage(), plan, index), s.captions.length);
    for (let i = 0; i < s.captions.length; i++) {
      caption().text(s.captions[i]); // swap at the cut, never cross-fade copy
      yield* all(chain(...steps[i].map(b => b())), waitFor(holdSeconds(s, i)));
    }
    stage().remove();
  }
});
