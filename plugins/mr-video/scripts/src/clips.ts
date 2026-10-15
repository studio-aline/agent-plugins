// Node side: locate and measure the recordings that clip scenes play.
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {isAbsolute, resolve} from 'node:path';
import {FFPROBE} from './media.ts';
import type {Plan} from './plan.ts';

export const MAX_CLIP_SECONDS = 60;

export interface ResolvedClip {
  file: string; // absolute
  clipSeconds: number;
  clipWidth: number;
  clipHeight: number;
}

/** Returns a copy of the plan whose clip scenes carry absolute paths and measured length/size. */
export function resolveClips(plan: Plan, planDir: string): Plan {
  return {
    ...plan,
    scenes: plan.scenes.map((s, i) => {
      if (s.type !== 'clip') return s;
      const file = isAbsolute(s.file) ? s.file : resolve(planDir, s.file);
      if (!existsSync(file)) throw new Error(`scenes[${i}](clip): 녹화 파일이 없습니다: ${s.file}`);
      let info: {format: {duration: string}; streams: {width: number; height: number}[]};
      try {
        info = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', file], {encoding: 'utf8'}));
      } catch {
        throw new Error(`scenes[${i}](clip): 영상으로 읽을 수 없습니다: ${s.file}`);
      }
      const clipSeconds = Number(info.format.duration);
      if (!(clipSeconds > 0)) throw new Error(`scenes[${i}](clip): 길이를 읽지 못했습니다: ${s.file}`);
      if (clipSeconds > MAX_CLIP_SECONDS) throw new Error(`scenes[${i}](clip): ${clipSeconds.toFixed(1)}초로 ${MAX_CLIP_SECONDS}초를 넘습니다`);
      const resolved: ResolvedClip = {file, clipSeconds, clipWidth: info.streams[0].width, clipHeight: info.streams[0].height};
      return {...s, ...resolved};
    }),
  };
}
