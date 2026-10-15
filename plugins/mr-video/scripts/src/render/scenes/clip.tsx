import {Circle, Layout, Node, Rect, Txt, Video} from '@revideo/2d';
import {createRef} from '@revideo/core';
import type {ClipScene} from '../../plan.ts';
import {COLOR, FONT, LAYOUT} from '../theme.ts';
import {idle, type Beat} from '../types.ts';

const BAR = 40;

/** A browser window playing the recorded walk through the local web app. */
export function buildClip(s: ClipScene, stage: Node, src: string, size: {width: number; height: number}): Beat[] {
  const video = createRef<Video>();
  const room = {width: LAYOUT.stageWidth, height: LAYOUT.stageBottom - LAYOUT.stageTop - BAR};
  const scale = Math.min(room.width / size.width, room.height / size.height);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);

  stage.add(
    <Rect layout direction="column" radius={10} fill={COLOR.card} stroke={COLOR.border} lineWidth={2} clip
          y={(LAYOUT.stageTop + LAYOUT.stageBottom) / 2}>
      <Rect layout height={BAR} gap={8} padding={[0, 14]} alignItems="center" fill={COLOR.sunken}>
        <Circle size={11} fill={COLOR.bad} />
        <Circle size={11} fill={COLOR.warn} />
        <Circle size={11} fill={COLOR.ok} />
        <Layout width={10} />
        {s.url ? (
          <Rect layout grow={1} height={26} radius={13} padding={[0, 14]} alignItems="center" fill={COLOR.bg}>
            <Txt text={s.url} fontFamily={FONT.mono} fontSize={15} fill={COLOR.muted} />
          </Rect>
        ) : null}
      </Rect>
      <Video ref={video} src={src} width={width} height={height} />
    </Rect>,
  );

  // Builders run on the scene's own thread, which lives through every caption. Media.play() follows
  // the clock of the thread that calls it, so starting it inside a (short-lived) beat would freeze
  // the recording on its first frame.
  video().play();
  return s.captions.map(() => idle);
}
