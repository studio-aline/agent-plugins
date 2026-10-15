import {z} from 'zod';
import {diagramKind, hasDiagramId} from './diagram.ts';
import {detectLang} from './lang.ts';
import {planSeconds} from './timing.ts';

const sha = z.string().regex(/^[0-9a-f]{7,40}$/, '7~40자리 16진수 SHA여야 합니다');
const captions = z.array(z.string().min(1).max(60)).min(1).max(6);
// With voice: what to read aloud instead of each caption (same count), e.g. identifiers spelled for speech.
const say = z.array(z.string().min(1).max(120)).optional();

const title = z.object({type: z.literal('title'), title: z.string().min(1), summary: z.string().optional(), meta: z.string().optional(), captions, say});
const flow = z.object({
  type: z.literal('flow'),
  title: z.string().min(1),
  nodes: z.array(z.string().min(1)).min(2).max(5),
  changed: z.array(z.number().int()).optional(),
  broken: z.array(z.number().int()).optional(),
  captions,
  say,
});
const code = z.object({
  type: z.literal('code'),
  title: z.string().min(1),
  file: z.string().min(1),
  before: z.string().optional(),
  after: z.string().min(1),
  highlight: z.string().optional(),
  captions,
  say,
});
const tests = z.object({
  type: z.literal('tests'),
  title: z.string().min(1),
  ran: z.array(z.object({name: z.string().min(1), result: z.enum(['pass', 'fail'])})).max(5),
  notRun: z.array(z.string().min(1)).max(5),
  captions,
  say,
});
const checklist = z.object({
  type: z.literal('checklist'),
  title: z.string().min(1),
  items: z.array(z.string().min(1)).min(1).max(5),
  captions,
  say,
});

const ids = z.array(z.string().min(1)).optional();
const mermaid = z.object({
  type: z.literal('mermaid'),
  title: z.string().min(1),
  code: z.string().min(1),
  // One entry per caption (flowcharts only); a caption without an entry keeps the previous emphasis.
  emphasis: z.array(z.object({accent: ids, bad: ids}).nullable()).optional(),
  captions,
  say,
});
const terminal = z.object({
  type: z.literal('terminal'),
  title: z.string().min(1),
  prompt: z.string().optional(),
  lines: z.array(z.object({cmd: z.string().min(1), out: z.string().optional()})).min(1).max(8),
  captions,
  say,
});
const clip = z.object({
  type: z.literal('clip'),
  title: z.string().min(1),
  // Recording made with `record` (path relative to plan.json, or absolute).
  file: z.string().min(1),
  // Address shown in the window frame, e.g. http://localhost:4000/hive.
  url: z.string().optional(),
  captions,
  say,
});
const table = z.object({
  type: z.literal('table'),
  title: z.string().min(1),
  columns: z.array(z.string()).min(2).max(4),
  rows: z.array(z.array(z.string())).min(1).max(6),
  accentRow: z.number().int().optional(),
  accentCol: z.number().int().optional(),
  captions,
  say,
});

export const PlanSchema = z.object({
  mr: z
    .object({
      project: z.string().min(1),
      iid: z.number().int().positive().optional(),
      branch: z.string().min(1).optional(),
      base: sha,
      head: sha,
    })
    .refine(m => m.iid !== undefined || m.branch !== undefined, 'iid 또는 branch 중 하나는 있어야 합니다'),
  title: z.string().min(1),
  // Needed only for code scenes (syntax highlighting and file-extension checks).
  lang: z.enum(['cpp', 'elixir']).optional(),
  // Video color theme; light when omitted.
  theme: z.enum(['dark', 'light']).optional(),
  // Read the captions aloud with the Windows Korean voice; the video gets an audio track.
  voice: z.boolean().optional(),
  scenes: z.array(z.discriminatedUnion('type', [title, flow, code, tests, checklist, mermaid, table, terminal, clip])),
});

export type Plan = z.infer<typeof PlanSchema>;
export type Scene = Plan['scenes'][number];
export type CodeScene = z.infer<typeof code>;
export type MermaidScene = z.infer<typeof mermaid>;
export type TableScene = z.infer<typeof table>;
export type TerminalScene = z.infer<typeof terminal>;
export type ClipScene = z.infer<typeof clip>;

export function parsePlan(input: unknown): Plan {
  return PlanSchema.parse(input);
}

export function planJsonSchema(): unknown {
  return z.toJSONSchema(PlanSchema);
}

export const LIMITS = {minScenes: 3, maxScenes: 16, maxSeconds: 360, warnLines: 14, maxLines: 20, maxLineChars: 100};

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

/** Rules the schema cannot express. Pure: no git, no filesystem. */
export function checkPlan(plan: Plan): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const n = plan.scenes.length;
  if (n < LIMITS.minScenes || n > LIMITS.maxScenes) {
    errors.push(`장면은 ${LIMITS.minScenes}~${LIMITS.maxScenes}개여야 합니다 (현재 ${n}개)`);
  }
  const secs = planSeconds(plan);
  if (secs > LIMITS.maxSeconds) errors.push(`전체 길이 ${secs.toFixed(1)}초가 ${LIMITS.maxSeconds}초를 넘습니다`);

  plan.scenes.forEach((s, i) => {
    const at = `scenes[${i}](${s.type})`;
    if (s.say && s.say.length !== s.captions.length) errors.push(`${at}: say(${s.say.length})는 captions(${s.captions.length})와 개수가 같아야 합니다`);
    if (s.say && !plan.voice) warnings.push(`${at}: voice가 꺼져 있어 say는 쓰이지 않습니다`);
    if (s.type === 'flow') {
      for (const key of ['changed', 'broken'] as const) {
        for (const idx of s[key] ?? []) {
          if (idx < 0 || idx >= s.nodes.length) errors.push(`${at}: ${key} 인덱스 ${idx}가 nodes 범위를 벗어납니다`);
        }
      }
    }
    if (s.type === 'mermaid' && s.emphasis) {
      if (s.emphasis.length > s.captions.length) errors.push(`${at}: emphasis(${s.emphasis.length})가 captions(${s.captions.length})보다 많습니다`);
      if (diagramKind(s.code) !== 'flowchart') errors.push(`${at}: emphasis는 flowchart/graph 다이어그램에서만 쓸 수 있습니다`);
      const used = s.emphasis.flatMap(e => [...(e?.accent ?? []), ...(e?.bad ?? [])]);
      for (const id of new Set(used)) {
        if (!hasDiagramId(s.code, id)) errors.push(`${at}: emphasis의 ${id}가 다이어그램에 없습니다`);
      }
    }
    if (s.type === 'table') {
      s.rows.forEach((r, ri) => {
        if (r.length !== s.columns.length) errors.push(`${at}: rows[${ri}]의 칸 수(${r.length})가 columns(${s.columns.length})와 다릅니다`);
      });
      if (s.accentRow !== undefined && (s.accentRow < 0 || s.accentRow >= s.rows.length)) errors.push(`${at}: accentRow ${s.accentRow}가 범위를 벗어납니다`);
      if (s.accentCol !== undefined && (s.accentCol < 0 || s.accentCol >= s.columns.length)) errors.push(`${at}: accentCol ${s.accentCol}가 범위를 벗어납니다`);
    }
    if (s.type === 'code') {
      if (!plan.lang) errors.push(`${at}: code 장면이 있으면 lang(cpp|elixir)이 필요합니다`);
      else if (detectLang(s.file) !== plan.lang) errors.push(`${at}: ${s.file}의 확장자가 lang(${plan.lang})과 맞지 않습니다`);
      if (s.highlight !== undefined && !s.after.includes(s.highlight)) {
        errors.push(`${at}: highlight가 after 안에 없습니다`);
      }
      for (const [name, text] of [['before', s.before], ['after', s.after]] as const) {
        if (text === undefined) continue;
        const lines = text.split('\n');
        if (lines.length > LIMITS.maxLines) errors.push(`${at}: ${name}가 ${lines.length}줄로 ${LIMITS.maxLines}줄을 넘습니다`);
        else if (lines.length > LIMITS.warnLines) warnings.push(`${at}: ${name}가 ${lines.length}줄입니다. ${LIMITS.warnLines}줄 이하를 권장합니다`);
        const longest = Math.max(...lines.map(l => l.length));
        if (longest > LIMITS.maxLineChars) errors.push(`${at}: ${name}에 ${LIMITS.maxLineChars}자를 넘는 줄이 있습니다 (${longest}자)`);
      }
    }
  });
  return {errors, warnings};
}
