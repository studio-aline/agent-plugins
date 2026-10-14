// Launches headless Chromium once (a few seconds).
import {describe, expect, it} from 'vitest';
import {diagramKind, emphasisCode, renderDiagrams} from '../src/render/mermaid.ts';
import {FLOW_BEFORE_AFTER, SEQUENCE_TALL} from './fixtures/mermaid.ts';

describe('diagramKind', () => {
  it('reads the first keyword', () => {
    expect(diagramKind('flowchart LR\n a-->b')).toBe('flowchart');
    expect(diagramKind('  graph TD\n a-->b')).toBe('flowchart');
    expect(diagramKind('sequenceDiagram\n a->>b: x')).toBe('sequence');
    expect(diagramKind('erDiagram\n a { int x }')).toBe('er');
    expect(diagramKind('pie\n "a": 1')).toBe('other');
  });
});

describe('emphasisCode', () => {
  it('appends style lines for accent and bad ids', () => {
    expect(emphasisCode('flowchart LR\n  a-->b', {accent: ['a'], bad: ['b']})).toBe(
      'flowchart LR\n  a-->b\n  style a stroke:#58a6ff,stroke-width:4px\n  style b stroke:#f85149,stroke-width:4px,stroke-dasharray:6 4',
    );
  });

  it('returns the code unchanged without emphasis', () => {
    expect(emphasisCode('flowchart LR\n  a-->b', undefined)).toBe('flowchart LR\n  a-->b');
  });
});

describe('renderDiagrams', () => {
  it('rasterizes each emphasis step and reports the natural size', {timeout: 120_000}, async () => {
    const [flow, seq] = await renderDiagrams([
      {code: FLOW_BEFORE_AFTER, steps: [undefined, {bad: ['C', 'LC']}, {accent: ['A', 'SR']}]},
      {code: SEQUENCE_TALL, steps: [undefined]},
    ]);
    expect(flow.frames).toHaveLength(3);
    for (const f of [...flow.frames, ...seq.frames]) expect(f).toMatch(/^data:image\/png;base64,/);
    // Emphasis must actually change the picture.
    expect(flow.frames[1]).not.toBe(flow.frames[0]);
    expect(flow.width).toBeGreaterThan(200);
    expect(seq.height).toBeGreaterThan(seq.width * 0.6);
  });

  it('reports a mermaid syntax error with the diagram index', {timeout: 120_000}, async () => {
    await expect(renderDiagrams([{code: 'flowchart LR\n  a -->', steps: [undefined]}])).rejects.toThrow(/다이어그램 0/);
  });
});

describe('emphasisSteps', () => {
  it('gives one plain step without emphasis and carries the last entry forward', async () => {
    const {emphasisSteps} = await import('../src/diagram.ts');
    expect(emphasisSteps({captions: ['a', 'b']})).toEqual([null]);
    expect(emphasisSteps({emphasis: [null, {accent: ['X']}], captions: ['a', 'b', 'c']})).toEqual([null, {accent: ['X']}, {accent: ['X']}]);
  });
});

describe('renderDiagrams focus', () => {
  it('reports where emphasized nodes and subgraphs sit, per step', {timeout: 120_000}, async () => {
    const [d] = await renderDiagrams([{code: FLOW_BEFORE_AFTER, steps: [null, {bad: ['C', 'LC']}, {accent: ['A']}]}]);
    expect(d.focus?.[0]).toBeNull();
    const before = d.focus![1]!;
    const after = d.focus![2]!;
    for (const f of [before, after]) {
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(d.width);
      expect(f.y).toBeGreaterThan(0);
      expect(f.y).toBeLessThan(d.height);
    }
    // "예전" (C, LC) and "바뀐 뒤" (A) are stacked, so their centers differ vertically.
    expect(Math.abs(before.y - after.y)).toBeGreaterThan(100);
  });
});
