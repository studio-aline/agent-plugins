// Node side: rasterize mermaid diagrams to PNG in headless Chromium before the Revideo render.
// PNG (not SVG) because mermaid's HTML labels (<br/>) live in <foreignObject>, which taints the
// canvas Revideo exports from.
import {createRequire} from 'node:module';
import puppeteer, {type Page} from 'puppeteer';
import {FONT, type Palette, PALETTES, paletteFor, type ThemeName} from './theme.ts';

import type {DiagramFrames, Emphasis} from '../diagram.ts';

export {diagramKind} from '../diagram.ts';
export type {DiagramFrames, Emphasis} from '../diagram.ts';

const require = createRequire(import.meta.url);

export interface DiagramJob {
  code: string;
  /** One picture per caption; each step may emphasize different flowchart nodes. */
  steps: Emphasis[];
}

export function emphasisCode(code: string, e: Emphasis, p: Palette = PALETTES.dark): string {
  const lines = [
    ...(e?.accent ?? []).map(id => `  style ${id} stroke:${p.accent},stroke-width:4px`),
    ...(e?.bad ?? []).map(id => `  style ${id} stroke:${p.bad},stroke-width:4px,stroke-dasharray:6 4`),
  ];
  return lines.length ? `${code}\n${lines.join('\n')}` : code;
}

function mermaidConfig(p: Palette, dark: boolean) {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: FONT.ui,
    flowchart: {useMaxWidth: false},
    sequence: {useMaxWidth: false},
    er: {useMaxWidth: false},
    themeVariables: {
      darkMode: dark,
      fontFamily: FONT.ui,
      fontSize: '18px',
      background: p.bg,
      primaryColor: p.card,
      primaryTextColor: p.fg,
      primaryBorderColor: p.border,
      secondaryColor: p.raised,
      tertiaryColor: p.sunken,
      lineColor: p.muted,
      textColor: p.fg,
      titleColor: p.fg,
      clusterBkg: p.sunken,
      clusterBorder: p.border,
      edgeLabelBackground: p.bg,
      noteBkgColor: p.note,
      noteTextColor: p.fg,
      noteBorderColor: p.border,
      actorBkg: p.card,
      actorBorder: p.border,
      actorTextColor: p.fg,
      actorLineColor: p.border,
      signalColor: p.muted,
      signalTextColor: p.fg,
      labelBoxBkgColor: p.card,
      labelBoxBorderColor: p.border,
      labelTextColor: p.fg,
      loopTextColor: p.fg,
      attributeBackgroundColorOdd: p.card,
      attributeBackgroundColorEven: p.sunken,
    },
  };
}

/**
 * Center of the union box of the given flowchart ids, relative to the rendered picture.
 * Mermaid ids: subgraph `<renderId>-<id>`, node `<renderId>-flowchart-<id>-<n>`.
 */
async function focusOf(page: Page, renderId: string, ids: string[]): Promise<{x: number; y: number} | null> {
  if (ids.length === 0) return null;
  return page.evaluate(
    (rid, ids) => {
      const container = document.getElementById('c')!.getBoundingClientRect();
      const boxes = ids.flatMap(id =>
        [...document.querySelectorAll(`[id="${rid}-${id}"], [id^="${rid}-flowchart-${id}-"]`)].map(e => e.getBoundingClientRect()),
      );
      if (boxes.length === 0) return null;
      const left = Math.min(...boxes.map(b => b.left));
      const right = Math.max(...boxes.map(b => b.right));
      const top = Math.min(...boxes.map(b => b.top));
      const bottom = Math.max(...boxes.map(b => b.bottom));
      return {x: (left + right) / 2 - container.left, y: (top + bottom) / 2 - container.top};
    },
    renderId,
    ids,
  );
}

export async function renderDiagrams(jobs: DiagramJob[], theme?: ThemeName): Promise<DiagramFrames[]> {
  const p = paletteFor(theme);
  if (jobs.length === 0) return [];
  const browser = await puppeteer.launch({headless: 'shell'});
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 3000, height: 2000, deviceScaleFactor: 2});
    await page.setContent(
      `<html><body style="margin:0;background:${p.bg}"><div id="c" style="display:inline-block;padding:12px;background:${p.bg}"></div></body></html>`,
    );
    await page.addScriptTag({path: require.resolve('mermaid/dist/mermaid.min.js')});
    await page.evaluate(cfg => (globalThis as any).mermaid.initialize(cfg), mermaidConfig(p, p === PALETTES.dark));

    const out: DiagramFrames[] = [];
    for (const [i, job] of jobs.entries()) {
      const result: DiagramFrames = {frames: [], width: 0, height: 0, focus: []};
      for (const [j, step] of job.steps.entries()) {
        const error = await page.evaluate(
          async (code, id) => {
            try {
              const {svg} = await (globalThis as any).mermaid.render(id, code);
              document.getElementById('c')!.innerHTML = svg;
              return null;
            } catch (e) {
              return String((e as Error)?.message ?? e);
            }
          },
          emphasisCode(job.code, step, p),
          `m${i}_${j}`,
        );
        if (error) throw new Error(`다이어그램 ${i} 렌더 실패: ${error.split('\n')[0]}`);
        const el = (await page.$('#c'))!;
        const box = (await el.boundingBox())!;
        const png = await el.screenshot({type: 'png'});
        result.frames.push(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
        result.width = box.width;
        result.height = box.height;
        result.focus!.push(await focusOf(page, `m${i}_${j}`, [...(step?.accent ?? []), ...(step?.bad ?? [])]));
      }
      out.push(result);
    }
    return out;
  } finally {
    await browser.close();
  }
}
