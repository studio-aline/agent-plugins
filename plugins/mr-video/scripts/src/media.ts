import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const require = createRequire(import.meta.url);
export const FFMPEG: string = require('@ffmpeg-installer/ffmpeg').path;
export const FFPROBE: string = require('@ffprobe-installer/ffprobe').path;

const run = (bin: string, args: string[]) => execFileSync(bin, args, {encoding: 'utf8', maxBuffer: 64 << 20});

/** Drop Revideo's silent audio track, use limited-range yuv420p and move moov first for web playback. */
export function postprocess(input: string, output: string): void {
  run(FFMPEG, ['-v', 'error', '-y', '-i', input, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23',
    '-preset', 'medium', '-movflags', '+faststart', output]);
}

export interface QaReport {
  ok: boolean;
  frames: number;
  fps: number;
  seconds: number;
  expectedSeconds: number;
  pixFmt: string;
  audioStreams: number;
  problems: string[];
}

/** Checks the encoded file itself: frame count, length, full decode, stream layout. */
export function qaVideo(file: string, expectedSeconds: number): QaReport {
  const probe = JSON.parse(run(FFPROBE, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]));
  const video = probe.streams.find((s: any) => s.codec_type === 'video');
  const audioStreams = probe.streams.filter((s: any) => s.codec_type === 'audio').length;
  const [num, den] = String(video?.r_frame_rate ?? '0/1').split('/').map(Number);
  const fps = num / den;
  const frames = Number(video?.nb_read_frames ?? 0);
  const seconds = Number(probe.format.duration);
  const problems: string[] = [];

  if (!Number.isFinite(seconds) || !(fps > 0)) problems.push(`길이(${seconds}) 또는 fps(${video?.r_frame_rate})를 읽지 못했습니다`);
  if (Math.abs(frames - Math.round(seconds * fps)) > 1) problems.push(`프레임 수 ${frames} ≠ ${fps}fps × ${seconds.toFixed(2)}초`);
  if (Math.abs(seconds - expectedSeconds) > 0.5) problems.push(`길이 ${seconds.toFixed(2)}초가 예상 ${expectedSeconds.toFixed(2)}초와 다릅니다`);
  if (video?.pix_fmt !== 'yuv420p') problems.push(`픽셀 포맷 ${video?.pix_fmt}`);
  if (audioStreams !== 0) problems.push(`오디오 트랙 ${audioStreams}개`);
  const decode = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'null', '-'], {encoding: 'utf8'});
  if (decode.status !== 0 || decode.stderr.trim() !== '') problems.push(`디코드 오류: ${decode.stderr.trim().slice(0, 300)}`);

  return {ok: problems.length === 0, frames, fps, seconds, expectedSeconds, pixFmt: video?.pix_fmt, audioStreams, problems};
}

export function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Grabs one frame per timestamp and tiles them two per row into a single PNG. Returns the tile count. */
export function contactSheet(video: string, times: number[], output: string): number {
  const duration = Number(run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).trim());
  const dir = mkdtempSync(join(tmpdir(), 'mr-video-preview-'));
  try {
    times.forEach((t, i) => {
      // A seek past the end writes nothing and would silently shift every later tile.
      const at = Math.max(0, Math.min(t, duration - 0.1));
      const png = join(dir, `p${String(i).padStart(2, '0')}.png`);
      run(FFMPEG, ['-v', 'error', '-y', '-ss', at.toFixed(3), '-i', video, '-frames:v', '1', png]);
      if (!existsSync(png)) throw new Error(`미리보기 프레임 ${at.toFixed(2)}초를 추출하지 못했습니다`);
    });
    const rows = Math.ceil(times.length / 2);
    run(FFMPEG, ['-v', 'error', '-y', '-framerate', '1', '-i', join(dir, 'p%02d.png'),
      '-vf', `scale=640:-1,tile=2x${rows}:padding=8:margin=8:color=0x30363d`, '-frames:v', '1', output]);
    return times.length;
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

/** Mean luma (0–255) of a rectangle in one frame, for render regression tests. */
export function regionLuma(video: string, t: number, x: number, y: number, w: number, h: number): number {
  const out = execFileSync(FFMPEG, ['-v', 'error', '-ss', t.toFixed(3), '-i', video, '-frames:v', '1',
    '-vf', `crop=${w}:${h}:${x}:${y},format=gray`, '-f', 'rawvideo', '-'], {maxBuffer: 64 << 20});
  let sum = 0;
  for (const b of out) sum += b;
  return sum / out.length;
}
