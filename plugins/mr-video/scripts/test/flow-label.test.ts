import {describe, expect, it} from 'vitest';
import {labelFontSize} from '../src/render/fit.ts';

describe('labelFontSize', () => {
  it('keeps the default size when every word fits', () => {
    expect(labelFontSize('ItemPickup', 250)).toBe(20);
  });

  it('shrinks so the longest unbreakable identifier fits the box', () => {
    const size = labelFontSize('NexusServerReportProc', 191);
    expect(size).toBeLessThan(20);
    // Consolas advance ≈ 0.55 em; 24 px of padding.
    expect(21 * 0.55 * size).toBeLessThanOrEqual(191 - 24);
  });

  it('counts Hangul as double width and never goes below the floor', () => {
    expect(labelFontSize('가'.repeat(30), 120)).toBe(12);
  });
});

describe('diagramLayout', () => {
  it('fits a diagram that stays readable', async () => {
    const {diagramLayout} = await import('../src/render/fit.ts');
    expect(diagramLayout(780, 610, 1180, 460)).toEqual({scale: 460 / 610, pan: false, scrollX: 0, scrollY: 0});
  });

  it('scrolls a tall diagram vertically at width-fit scale', async () => {
    const {diagramLayout} = await import('../src/render/fit.ts');
    const l = diagramLayout(1205, 912, 1180, 460);
    expect(l.pan).toBe(true);
    expect(l.scale).toBeCloseTo(1180 / 1205);
    expect(l.scrollX).toBe(0);
    expect(l.scrollY).toBeCloseTo(912 * l.scale - 460);
  });

  it('keeps a readable scale for a wide diagram and scrolls both ways', async () => {
    const {diagramLayout, MIN_DIAGRAM_SCALE} = await import('../src/render/fit.ts');
    const l = diagramLayout(2600, 900, 1180, 460);
    expect(l.scale).toBe(MIN_DIAGRAM_SCALE);
    expect(l.scrollX).toBeCloseTo(2600 * MIN_DIAGRAM_SCALE - 1180);
    expect(l.scrollY).toBeCloseTo(900 * MIN_DIAGRAM_SCALE - 460);
  });
});

describe('panTarget', () => {
  it('centers the focus and clamps to the picture edges', async () => {
    const {panTarget} = await import('../src/render/fit.ts');
    // picture 1000 px wide at scale 1 in a 400 px window: start offset 300, end offset -300
    expect(panTarget(1000, 400, 1, 500)).toBeCloseTo(0);
    expect(panTarget(1000, 400, 1, 50)).toBeCloseTo(300);
    expect(panTarget(1000, 400, 1, 990)).toBeCloseTo(-300);
    expect(panTarget(300, 400, 1, 10)).toBe(0); // fits: never moves
  });
});

describe('columnWidths', () => {
  it('sums to the total and gives long columns more room', async () => {
    const {columnWidths} = await import('../src/render/fit.ts');
    const w = columnWidths([['방식', '판단'], ['JSON', '행마다 통째로 교체하므로 부분 수정이 없다']], 1180);
    expect(w.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1180);
    expect(w.reduce((a, b) => a + b, 0)).toBeGreaterThan(1170);
    expect(w[1]).toBeGreaterThan(w[0]);
    expect(w[0]).toBeGreaterThanOrEqual(120);
  });
});
