const START = '<!-- mr-video:start -->';
const END = '<!-- mr-video:end -->';
const BLOCK = String.raw`<!-- mr-video:start -->[\s\S]*?<!-- mr-video:end -->`;
const BLOCK_RE = new RegExp(BLOCK);

export function buildBlock(o: {url: string; sha7: string; seconds: number; voice?: boolean}): string {
  return [
    START,
    '## 🎬 설명 영상',
    `![설명 영상 · ${o.sha7}](${o.url})`,
    `> \`${o.sha7}\` 기준 · ${Math.round(o.seconds)}초 · ${o.voice ? '자막 + 음성' : '자막 전용'} · mr-video 생성`,
    END,
  ].join('\n');
}

const NOTE = '<!-- mr-video:note -->';

/**
 * A history comment for one render. The description block is replaced on every render so
 * reviewers always see the latest video; posting each render as a new note keeps the earlier
 * ones reachable. `delta` marks a video that covers only base..head since the previous video.
 */
export function buildNote(o: {url: string; base7: string; sha7: string; seconds: number; voice?: boolean; delta?: boolean}): string {
  const range = o.delta ? `\`${o.base7}\`..\`${o.sha7}\` 변경분` : `\`${o.sha7}\` 기준 MR 전체`;
  return [
    NOTE,
    `## 🎬 설명 영상 기록 · ${o.delta ? '변경분' : 'MR 전체'}`,
    `![설명 영상 · ${o.sha7}](${o.url})`,
    `> ${range} · ${Math.round(o.seconds)}초 · ${o.voice ? '자막 + 음성' : '자막 전용'} · mr-video 생성 · 최신 전체 영상은 MR 본문`,
  ].join('\n');
}

const stripBom = (s: string) => s.replace(/^﻿/, '');

/** Replaces the existing marker block, or puts the block at the top. Everything else is kept as is. */
export function upsertBlock(rawBody: string, rawBlock: string): string {
  const body = stripBom(rawBody);
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const block = rawBlock.replace(/\r?\n/g, eol);
  if (BLOCK_RE.test(body)) {
    let first = true;
    // First block is replaced in place; any duplicates are removed with the blank lines before them.
    return body.replace(new RegExp(`(?:\\r?\\n){0,2}${BLOCK}`, 'g'), match => {
      if (!first) return '';
      first = false;
      return match.replace(BLOCK_RE, () => block);
    });
  }
  if (body.trim() === '') return block;
  return `${block}${eol}${eol}${body}`;
}

export function inspectBody(body: string): {hasBlock: false} | {hasBlock: true; sha7?: string} {
  const m = body.match(BLOCK_RE);
  if (!m) return {hasBlock: false};
  const sha = m[0].match(/`([0-9a-f]{7})` 기준/);
  return sha ? {hasBlock: true, sha7: sha[1]} : {hasBlock: true};
}

const normalize = (s: string) => stripBom(s).replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n');

/** Compares two descriptions ignoring only CRLF, a BOM and trailing whitespace at the end. */
export function sameBody(a: string, b: string): {same: true} | {same: false; line: number} {
  const x = normalize(a);
  const y = normalize(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return {same: false, line: i + 1};
  }
  return {same: true};
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function videoFileName(mr: {iid?: number; branch?: string}, head: string): string {
  const id = mr.iid !== undefined ? String(mr.iid) : slug(mr.branch ?? 'branch');
  return `mr-${id}-${head.slice(0, 7)}.mp4`;
}
