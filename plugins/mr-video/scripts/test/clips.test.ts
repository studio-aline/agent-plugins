import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {resolveClips} from '../src/clips.ts';
import {FFMPEG} from '../src/media.ts';
import {parsePlan} from '../src/plan.ts';
import {samplePlan} from './fixtures/sample-plan.ts';

const dir = mkdtempSync(join(tmpdir(), 'mr-video-clips-'));

beforeAll(() => {
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=3', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', join(dir, 'clip.mp4')]);
});

function planWith(file: string) {
  const p: any = samplePlan();
  p.scenes.splice(1, 0, {type: 'clip', title: '결과', file, captions: ['봅니다.']});
  return parsePlan(p);
}

describe('resolveClips', () => {
  it('resolves the file next to plan.json and measures it', () => {
    const scene: any = resolveClips(planWith('clip.mp4'), dir).scenes[1];
    expect(scene.file).toBe(join(dir, 'clip.mp4'));
    expect(scene.clipSeconds).toBeCloseTo(3, 1);
    expect(scene.clipWidth).toBe(1280);
    expect(scene.clipHeight).toBe(720);
  });

  it('fails clearly for a missing clip', () => {
    expect(() => resolveClips(planWith('nope.mp4'), dir)).toThrow(/nope\.mp4/);
  });
});
