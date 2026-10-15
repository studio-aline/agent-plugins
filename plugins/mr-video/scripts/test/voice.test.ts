// Speaks real captions with the Windows Korean voice; skipped where that voice is missing.
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {FFMPEG, FFPROBE} from '../src/media.ts';
import {parsePlan} from '../src/plan.ts';
import {captionStarts, planSeconds} from '../src/timing.ts';
import {addVoiceTrack, readWav, resolveVoice, speechText, synthesize, wavSeconds} from '../src/voice.ts';
import {samplePlan} from './fixtures/sample-plan.ts';

const hasKoreanVoice = (() => {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | % { $_.VoiceInfo.Culture.Name }'],
      {encoding: 'utf8'});
    return out.includes('ko-KR');
  } catch {
    return false;
  }
})();

/** Mean loudness (dB) of 0.6 s of the file's audio from t. */
function meanDb(file: string, t: number): number {
  const r = spawnSync(FFMPEG, ['-ss', String(t), '-t', '0.6', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], {encoding: 'utf8'});
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? -91);
}

describe('speechText', () => {
  it('drops identifier punctuation that would be read out', () => {
    expect(speechText('`select_node/2`로 모읍니다')).toBe('select node/2로 모읍니다');
  });
});

describe.skipIf(!hasKoreanVoice)('voice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mr-video-voice-'));

  it('speaks each text once and reuses the cache', {timeout: 60_000}, () => {
    const [a, b] = synthesize(['안녕하세요.', '변경 사항을 설명합니다.'], join(dir, 'v'));
    expect(wavSeconds(readWav(a))).toBeGreaterThan(0.4);
    expect(wavSeconds(readWav(b))).toBeGreaterThan(wavSeconds(readWav(a)));
    const before = statSync(a).mtimeMs;
    expect(synthesize(['안녕하세요.'], join(dir, 'v'))).toEqual([a]);
    expect(statSync(a).mtimeMs).toBe(before);
  });

  it('stretches captions to the speech and lays it at the caption starts', {timeout: 120_000}, () => {
    const raw: any = samplePlan();
    raw.voice = true;
    raw.scenes = raw.scenes.slice(0, 2);
    raw.scenes[0].captions = ['짧게.'];
    raw.scenes[0].say = ['이 문장은 자막보다 훨씬 길게 읽어서 자막 시간을 늘립니다.'];
    const plan = resolveVoice(parsePlan(raw), dir);
    const spoken = (plan.scenes[0] as any).voiceSeconds[0];
    expect(spoken).toBeGreaterThan(3);
    const starts = captionStarts(plan);
    expect(starts[1][0]).toBeGreaterThan(spoken); // the next caption waits for the speech

    // A silent video as long as the plan: speech right after a caption start, silence in the tail.
    const total = planSeconds(plan);
    const video = join(dir, 'v.mp4');
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=white:s=320x180:r=30:d=${total.toFixed(2)}`,
      '-pix_fmt', 'yuv420p', '-c:v', 'libx264', video]);
    addVoiceTrack(plan, video);
    const streams = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_streams', '-of', 'json', video], {encoding: 'utf8'})).streams;
    expect(streams.filter((x: any) => x.codec_type === 'audio')).toHaveLength(1);
    expect(meanDb(video, starts[0][0] + 0.5)).toBeGreaterThan(-40);
    expect(meanDb(video, starts[1][0] + 0.5)).toBeGreaterThan(-40);
    expect(meanDb(video, Math.max(0, total - 0.35))).toBeLessThan(-60);
  });
});
