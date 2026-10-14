import {Circle, Layout, Node, Rect, Txt} from '@revideo/2d';
import {chain, createRef, linear} from '@revideo/core';
import type {TerminalScene} from '../../plan.ts';
import {COLOR, FONT, LAYOUT} from '../theme.ts';
import type {Beat} from '../types.ts';
import {revealAt, typeSeconds} from '../../timing.ts';

/** A terminal window; each command is typed out, then its output appears. */
export function buildTerminal(s: TerminalScene, stage: Node): Beat[] {
  const card = createRef<Rect>();
  const prompts = s.lines.map(() => createRef<Txt>());
  const cmds = s.lines.map(() => createRef<Txt>());
  const outs = s.lines.map(() => createRef<Txt>());

  stage.add(
    <Rect ref={card} layout direction="column" minWidth={1040} radius={12} fill="#0b0f14" stroke={COLOR.border} lineWidth={2}
          clip y={(LAYOUT.stageTop + LAYOUT.stageBottom) / 2}>
      <Rect layout gap={8} padding={[10, 14]} fill={COLOR.card} alignItems="center">
        <Circle size={12} fill={COLOR.bad} />
        <Circle size={12} fill="#d29922" />
        <Circle size={12} fill={COLOR.ok} />
      </Rect>
      <Layout layout direction="column" gap={10} padding={[18, 24]}>
        {s.lines.map((l, i) => (
          <Layout layout direction="column" gap={4}>
            <Layout layout gap={12}>
              <Txt ref={prompts[i]} text={s.prompt ?? '>'} fontFamily={FONT.mono} fontSize={22} fill={COLOR.ok} opacity={0} />
              <Txt ref={cmds[i]} text={l.cmd} fontFamily={FONT.mono} fontSize={22} fill={COLOR.fg} opacity={0} />
            </Layout>
            {l.out ? <Txt ref={outs[i]} text={l.out} fontFamily={FONT.mono} fontSize={19} fill={COLOR.muted} opacity={0} /> : null}
          </Layout>
        ))}
      </Layout>
    </Rect>,
  );

  // Rows are laid out with their full text, so the window keeps its size while commands are typed.
  card().scale(Math.min(1, LAYOUT.stageWidth / card().width(), (LAYOUT.stageBottom - LAYOUT.stageTop) / card().height()));

  const type = (i: number) => function* () {
    const full = s.lines[i].cmd;
    prompts[i]().opacity(1);
    cmds[i]().opacity(1).text('');
    yield* cmds[i]().text(full, typeSeconds(full), linear);
    if (s.lines[i].out) yield* outs[i]().opacity(1, 0.25);
  };

  const k = s.captions.length;
  return Array.from({length: k}, (_, c): Beat => () =>
    chain(...s.lines.map((_, i) => i).filter(i => revealAt(i, s.lines.length, k) === c).map(i => type(i)())),
  );
}
