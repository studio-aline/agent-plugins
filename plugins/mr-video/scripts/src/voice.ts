// Optional narration: each caption is read aloud with the Windows Korean voice (System.Speech,
// offline, no extra install). The spoken length feeds the caption hold, and the clips are laid
// on one audio track at the caption start times.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {FFMPEG} from './media.ts';
import type {Plan} from './plan.ts';
import {captionStarts, planSeconds} from './timing.ts';

const RATE = 1; // System.Speech rate, -10..10; 1 is a little faster than default and still clear

const SCRIPT = `param([string]$In, [string]$OutDir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'ko-KR' } | Select-Object -First 1
if (-not $v) { [Console]::Error.WriteLine('NO_KO_VOICE'); exit 3 }
$s.SelectVoice($v.VoiceInfo.Name)
$s.Rate = ${RATE}
$items = Get-Content -Raw -Encoding UTF8 $In | ConvertFrom-Json
foreach ($it in $items) {
  $s.SetOutputToWaveFile((Join-Path $OutDir $it.file))
  $s.Speak([string]$it.text)
}
$s.SetOutputToNull()
$s.Dispose()
`;

/** Text as it is read: underscores and backticks in identifiers are not spoken. */
export function speechText(text: string): string {
  return text.replace(/`/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Wav {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  data: Buffer;
}

export function readWav(file: string): Wav {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`WAV가 아닙니다: ${file}`);
  let fmt: Omit<Wav, 'data'> | undefined;
  for (let at = 12; at + 8 <= b.length;) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') {
      if (b.readUInt16LE(body) !== 1) throw new Error(`PCM WAV가 아닙니다: ${file}`);
      fmt = {channels: b.readUInt16LE(body + 2), sampleRate: b.readUInt32LE(body + 4), blockAlign: b.readUInt16LE(body + 12), bitsPerSample: b.readUInt16LE(body + 14)};
    } else if (id === 'data') {
      if (!fmt) throw new Error(`fmt 청크가 data보다 뒤에 있습니다: ${file}`);
      return {...fmt, data: b.subarray(body, Math.min(b.length, body + size))};
    }
    at = body + size + (size % 2);
  }
  throw new Error(`data 청크가 없습니다: ${file}`);
}

export const wavSeconds = (w: Wav) => w.data.length / w.blockAlign / w.sampleRate;

function writeWav(file: string, f: Omit<Wav, 'data'>, data: Buffer): void {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(f.channels, 22);
  h.writeUInt32LE(f.sampleRate, 24);
  h.writeUInt32LE(f.sampleRate * f.blockAlign, 28);
  h.writeUInt16LE(f.blockAlign, 32);
  h.writeUInt16LE(f.bitsPerSample, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}

/** Speaks each text into `dir` (cached by text) and returns the wav paths in order. */
export function synthesize(texts: string[], dir: string): string[] {
  mkdirSync(dir, {recursive: true});
  const files = texts.map(t => join(dir, `${createHash('sha1').update(`${RATE}\n${t}`).digest('hex').slice(0, 16)}.wav`));
  const todo = texts.map((text, i) => ({text, file: files[i]})).filter(x => !existsSync(x.file));
  if (todo.length) {
    if (process.platform !== 'win32') throw new Error('음성은 Windows에서만 만들 수 있습니다');
    const script = join(dir, 'speak.ps1');
    const input = join(dir, 'speak.json');
    writeFileSync(script, `﻿${SCRIPT}`); // BOM: Windows PowerShell 5.1 reads scripts as ANSI otherwise
    writeFileSync(input, JSON.stringify(todo.map(x => ({text: x.text, file: x.file.slice(dir.length + 1)}))));
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-In', input, '-OutDir', dir],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    } catch (e) {
      const err = String((e as {stderr?: string}).stderr ?? (e as Error).message);
      if (err.includes('NO_KO_VOICE')) throw new Error('Windows 한국어 음성이 없습니다. 설정 > 시간 및 언어 > 음성에서 한국어 음성을 추가하세요');
      throw new Error(`음성 합성 실패: ${err.trim().split('\n')[0]}`);
    } finally {
      rmSync(input, {force: true});
      rmSync(script, {force: true});
    }
  }
  return files;
}

type VoicedScene = Plan['scenes'][number] & {voiceSeconds?: number[]; voiceFiles?: string[]};

/** With `voice`, speaks every caption (or its `say`) into `<planDir>/voice` and records the lengths. */
export function resolveVoice(plan: Plan, planDir: string): Plan {
  if (!plan.voice) return plan;
  const texts = plan.scenes.flatMap(s => s.captions.map((c, i) => speechText(s.say?.[i] ?? c)));
  const files = synthesize(texts, resolve(planDir, 'voice'));
  let k = 0;
  return {
    ...plan,
    scenes: plan.scenes.map(s => {
      const voiceFiles = s.captions.map(() => files[k++]);
      return {...s, voiceFiles, voiceSeconds: voiceFiles.map(f => wavSeconds(readWav(f)))} as VoicedScene;
    }),
  };
}

/** Lays every spoken caption at its start time on one track and adds it to the (silent) video. */
export function addVoiceTrack(plan: Plan, video: string): void {
  const starts = captionStarts(plan);
  const items = (plan.scenes as VoicedScene[]).flatMap((s, si) =>
    (s.voiceFiles ?? []).map((file, ci) => ({wav: readWav(file), start: starts[si][ci]})));
  if (!items.length) return;
  const fmt = items[0].wav;
  for (const {wav} of items) {
    if (wav.sampleRate !== fmt.sampleRate || wav.channels !== fmt.channels || wav.bitsPerSample !== fmt.bitsPerSample) {
      throw new Error('음성 파일 형식이 서로 다릅니다');
    }
  }
  const frames = Math.ceil(planSeconds(plan) * fmt.sampleRate);
  const track = Buffer.alloc(frames * fmt.blockAlign); // silence
  for (const {wav, start} of items) {
    const at = Math.round(start * fmt.sampleRate) * fmt.blockAlign;
    wav.data.copy(track, at, 0, Math.max(0, Math.min(wav.data.length, track.length - at)));
  }
  const wavFile = `${video}.voice.wav`;
  const tmp = `${video}.voiced.mp4`;
  writeWav(wavFile, fmt, track);
  try {
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', video, '-i', wavFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', tmp]);
    renameSync(tmp, video);
  } finally {
    rmSync(wavFile, {force: true});
    rmSync(tmp, {force: true});
  }
}
