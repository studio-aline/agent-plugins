import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {contactSheet, FFMPEG, qaVideo} from '../src/media.ts';

const dir = mkdtempSync(join(tmpdir(), 'mr-video-media-'));
const video = join(dir, 'clip.mp4');

beforeAll(() => {
  // 2 s, 30 fps, yuv420p, no audio: what a good render looks like.
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=2',
    '-pix_fmt', 'yuv420p', '-c:v', 'libx264', video]);
});

describe('qaVideo', () => {
  it('passes a clean clip', () => {
    expect(qaVideo(video, 2).problems).toEqual([]);
  });

  it('flags a length mismatch', () => {
    expect(qaVideo(video, 5).problems.join()).toMatch(/예상/);
  });
});

describe('contactSheet', () => {
  it('clamps timestamps past the end instead of dropping tiles', () => {
    const out = join(dir, 'sheet.png');
    expect(contactSheet(video, [0.5, 1.5, 9], out)).toBe(3);
    expect(existsSync(out)).toBe(true);
  });
});
