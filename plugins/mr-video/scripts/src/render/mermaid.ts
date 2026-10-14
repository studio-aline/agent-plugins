// Node side: rasterize mermaid diagrams to PNG in headless Chromium before the Revideo render.
// PNG (not SVG) because mermaid's HTML labels (<br/>) live in <foreignObject>, which taints the
// canvas Revideo exports from.
import {createRequire} from 'node:module';
import puppeteer, {type Page} from 'puppeteer';
import {COLOR, FONT} from './theme.ts';

import type {DiagramFrames, Emphasis} from '../diagram.ts';

export {diagramKind} from '../diagram.ts';
export type {DiagramFrames, Emphasis} from '../diagram.ts';

const require = createRequire(import.meta.url);

export interface DiagramJob {
  code: string;
  /** One picture per caption; each step may emphasize different flowchart nodes. */
  steps: Emphasis[];
}

export function emphasisCode(code: string, e: Emphasis): string {
  const lines = [
    ...(e?.accent ?? []).map(id => `  style ${id} stroke:${COLOR.accent},stroke-width:4px`),
    ...(e?.bad ?? []).map(id => `  style ${id} stroke:${COLOR.bad},stroke-width:4px,stroke-dasharray:6 4`),
  ];
  return lines.length ? `${code}\n${lines.join('\n')}` : code;
}

const CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  fontFamily: FONT.ui,
  flowchart: {useMaxWidth: false},
  sequence: {useMaxWidth: false},
  er: {useMaxWidth: false},
  themeVariables: {
    darkMode: true,
    fontFamily: FONT.ui,
    fontSize: '18px',
    background: COLOR.bg,
    primaryColor: COLOR.card,
    primaryTextColor: COLOR.fg,
    primaryBorderColor: COLOR.border,
    secondaryColor: '#1c2330',
    tertiaryColor: '#11161d',
    lineColor: COLOR.muted,
    textColor: COLOR.fg,
    titleColor: COLOR.fg,
    clusterBkg: '#11161d',
    clusterBorder: COLOR.border,
    edgeLabelBackground: COLOR.bg,
    noteBkgColor: '#1f2a37',
    noteTextColor: COLOR.fg,
    noteBorderColor: COLOR.border,
    actorBkg: COLOR.card,
    actorBorder: COLOR.border,
    actorTextColor: COLOR.fg,
    actorLineColor: COLOR.border,
    signalColor: COLOR.muted,
    signalTextColor: COLOR.fg,
    labelBoxBkgColor: COLOR.card,
    labelBoxBorderColor: COLOR.border,
    labelTextColor: COLOR.fg,
    loopTextColor: COLOR.fg,
    attributeBackgroundColorOdd: COLOR.card,
    attributeBackgroundColorEven: '#11161d',
  },
};

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

export async function renderDiagrams(jobs: DiagramJob[]): Promise<DiagramFrames[]> {
  if (jobs.length === 0) return [];
  const browser = await puppeteer.launch({headless: 'shell'});
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 3000, height: 2000, deviceScaleFactor: 2});
    await page.setContent(
      `<html><body style="margin:0;background:${COLOR.bg}"><div id="c" style="display:inline-block;padding:12px;background:${COLOR.bg}"></div></body></html>`,
    );
    await page.addScriptTag({path: require.resolve('mermaid/dist/mermaid.min.js')});
    await page.evaluate(cfg => (globalThis as any).mermaid.initialize(cfg), CONFIG);

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
          emphasisCode(job.code, step),
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
