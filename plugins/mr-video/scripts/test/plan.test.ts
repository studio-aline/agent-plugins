import {describe, expect, it} from 'vitest';
import {checkPlan, parsePlan} from '../src/plan.ts';
import {captionSeconds, planSeconds} from '../src/timing.ts';
import {decodePlan, encodePlan} from '../src/codec.ts';
import {detectLang} from '../src/lang.ts';
import {samplePlan} from './fixtures/sample-plan.ts';

describe('parsePlan', () => {
  it('accepts the sample plan', () => {
    expect(parsePlan(samplePlan()).title).toBe(samplePlan().title);
  });

  it('rejects an unknown scene type', () => {
    const p: any = samplePlan();
    p.scenes[0].type = 'video';
    expect(() => parsePlan(p)).toThrow();
  });

  it('rejects a non-hex sha', () => {
    const p: any = samplePlan();
    p.mr.head = 'main';
    expect(() => parsePlan(p)).toThrow();
  });

  it('requires iid or branch', () => {
    const p: any = samplePlan();
    delete p.mr.iid;
    delete p.mr.branch;
    expect(() => parsePlan(p)).toThrow();
  });

  it('rejects a caption over 60 chars', () => {
    const p: any = samplePlan();
    p.scenes[0].captions = ['가'.repeat(61)];
    expect(() => parsePlan(p)).toThrow();
  });
});

describe('checkPlan (structure rules beyond the schema)', () => {
  it('passes the sample plan', () => {
    expect(checkPlan(parsePlan(samplePlan())).errors).toEqual([]);
  });

  it('rejects fewer than 3 scenes', () => {
    const p = parsePlan(samplePlan());
    p.scenes = p.scenes.slice(0, 2);
    expect(checkPlan(p).errors.join()).toMatch(/3~16/);
  });

  it('rejects code over 20 lines and warns over 14', () => {
    const p = parsePlan(samplePlan());
    const code = p.scenes.find(s => s.type === 'code')!;
    if (code.type !== 'code') throw new Error();
    code.after = Array.from({length: 15}, (_, i) => `int a${i};`).join('\n');
    code.highlight = undefined;
    expect(checkPlan(p).warnings.join()).toMatch(/15줄/);
    code.after = Array.from({length: 21}, (_, i) => `int a${i};`).join('\n');
    expect(checkPlan(p).errors.join()).toMatch(/21줄/);
  });

  it('rejects a line over 100 chars', () => {
    const p = parsePlan(samplePlan());
    const code = p.scenes.find(s => s.type === 'code')!;
    if (code.type !== 'code') throw new Error();
    code.after = 'x'.repeat(101);
    code.highlight = undefined;
    expect(checkPlan(p).errors.join()).toMatch(/100자/);
  });

  it('rejects a highlight that is not in after', () => {
    const p = parsePlan(samplePlan());
    const code = p.scenes.find(s => s.type === 'code')!;
    if (code.type !== 'code') throw new Error();
    code.highlight = 'not there';
    expect(checkPlan(p).errors.join()).toMatch(/highlight/);
  });

  it('rejects flow indexes out of range', () => {
    const p = parsePlan(samplePlan());
    const flow = p.scenes.find(s => s.type === 'flow')!;
    if (flow.type !== 'flow') throw new Error();
    flow.broken = [9];
    expect(checkPlan(p).errors.join()).toMatch(/broken/);
  });

  it('highlights by file extension and only warns when it differs from lang', () => {
    const p = parsePlan(samplePlan());
    const code = p.scenes.find(s => s.type === 'code')!;
    if (code.type !== 'code') throw new Error();
    code.file = 'lib/foo.ex';
    expect(checkPlan(p).errors).toEqual([]);
    expect(checkPlan(p).warnings.join()).toMatch(/elixir/);
  });

  it('rejects a code file in an unsupported language', () => {
    const p = parsePlan(samplePlan());
    const code = p.scenes.find(s => s.type === 'code')!;
    if (code.type !== 'code') throw new Error();
    code.file = 'tools/build.py';
    expect(checkPlan(p).errors.join()).toMatch(/지원하지 않는 언어/);
  });
});

describe('timing', () => {
  it('uses a 2.2 s floor for short captions', () => {
    expect(captionSeconds('짧음')).toBe(2.2);
  });

  it('scales with length', () => {
    expect(captionSeconds('가'.repeat(48))).toBeCloseTo(4.9);
  });

  it('sums all captions', () => {
    const p = parsePlan(samplePlan());
    const sum = p.scenes.flatMap(s => s.captions).reduce((a, c) => a + captionSeconds(c), 0);
    expect(planSeconds(p)).toBeCloseTo(sum);
  });
});

describe('codec', () => {
  it('round-trips backticks, ${}, backslashes and Korean', () => {
    const p: any = samplePlan();
    p.scenes[0].captions = ['`MergeStack` ${x} \\\\ 한글'];
    expect(decodePlan(encodePlan(p))).toEqual(p);
  });
});

describe('detectLang', () => {
  it('maps C++ and Elixir extensions', () => {
    expect(detectLang('src/a.cpp')).toBe('cpp');
    expect(detectLang('src/a.HPP')).toBe('cpp');
    expect(detectLang('lib/a.ex')).toBe('elixir');
    expect(detectLang('test/a_test.exs')).toBe('elixir');
    expect(detectLang('README.md')).toBeUndefined();
  });

  it('maps C#, JavaScript, TypeScript and Rust extensions', () => {
    expect(detectLang('Assets/Scripts/Player.cs')).toBe('csharp');
    for (const f of ['a.js', 'a.mjs', 'a.cjs', 'a.jsx']) expect(detectLang(f), f).toBe('javascript');
    for (const f of ['a.ts', 'a.mts', 'a.cts', 'a.tsx']) expect(detectLang(f), f).toBe('typescript');
    expect(detectLang('src/main.rs')).toBe('rust');
  });
});

describe('mermaid and table scenes', () => {
  const base = () => parsePlan(samplePlan());
  const withScene = (scene: unknown) => {
    const p: any = samplePlan();
    p.scenes.splice(1, 0, scene);
    return parsePlan(p);
  };

  it('accepts a flowchart with per-caption emphasis', () => {
    const p = withScene({
      type: 'mermaid', title: '구조', code: 'flowchart LR\n  W["world"] --> NX["nexus"]',
      emphasis: [null, {accent: ['NX'], bad: ['W']}], captions: ['a', 'b'],
    });
    expect(checkPlan(p).errors).toEqual([]);
  });

  it('rejects emphasis on ids that are not in the diagram', () => {
    const p = withScene({type: 'mermaid', title: 't', code: 'flowchart LR\n  W --> NX', emphasis: [{accent: ['ZZ']}], captions: ['a']});
    expect(checkPlan(p).errors.join()).toMatch(/ZZ/);
  });

  it('rejects emphasis on non-flowchart diagrams and more steps than captions', () => {
    const seq = withScene({type: 'mermaid', title: 't', code: 'sequenceDiagram\n  A->>B: x', emphasis: [{accent: ['A']}], captions: ['a']});
    expect(checkPlan(seq).errors.join()).toMatch(/flowchart/);
    const many = withScene({type: 'mermaid', title: 't', code: 'flowchart LR\n  A --> B', emphasis: [null, null], captions: ['a']});
    expect(checkPlan(many).errors.join()).toMatch(/emphasis/);
  });

  it('accepts a table and checks row width and accent indexes', () => {
    const ok = withScene({type: 'table', title: '왜 JSON인가', columns: ['방식', '판단'], rows: [['JSON', '채택'], ['컬럼', '마이그레이션']], accentRow: 0, captions: ['a']});
    expect(checkPlan(ok).errors).toEqual([]);
    const bad = withScene({type: 'table', title: 't', columns: ['a', 'b'], rows: [['1']], accentRow: 3, accentCol: 2, captions: ['a']});
    expect(checkPlan(bad).errors.join()).toMatch(/rows\[0\].*accentRow.*accentCol|rows\[0\]/);
    expect(checkPlan(bad).errors).toHaveLength(3);
  });

  it('allows up to 16 scenes and 6 captions per scene', () => {
    const p: any = samplePlan();
    p.scenes[0].captions = ['1', '2', '3', '4', '5', '6'];
    while (p.scenes.length < 16) p.scenes.push({type: 'checklist', title: 'x', items: ['a'], captions: ['짧음']});
    expect(checkPlan(parsePlan(p)).errors).toEqual([]);
    p.scenes.push({type: 'checklist', title: 'x', items: ['a'], captions: ['짧음']});
    expect(checkPlan(parsePlan(p)).errors.join()).toMatch(/3~16/);
    expect(base()).toBeTruthy();
  });
});

describe('terminal scene and optional lang', () => {
  it('accepts a terminal scene', () => {
    const p: any = samplePlan();
    p.scenes.splice(1, 0, {type: 'terminal', title: '설치', lines: [{cmd: 'npm install'}, {cmd: 'npm test', out: 'Tests 75 passed'}], captions: ['a']});
    expect(checkPlan(parsePlan(p)).errors).toEqual([]);
  });

  it('rejects more than 8 terminal lines', () => {
    const p: any = samplePlan();
    p.scenes.splice(1, 0, {type: 'terminal', title: 't', lines: Array.from({length: 9}, () => ({cmd: 'x'})), captions: ['a']});
    expect(() => parsePlan(p)).toThrow();
  });

  it('allows a plan without lang when it has no code scenes', () => {
    const p: any = samplePlan();
    delete p.lang;
    p.scenes = p.scenes.filter((s: any) => s.type !== 'code');
    expect(checkPlan(parsePlan(p)).errors).toEqual([]);
  });

  it('does not need lang for code scenes', () => {
    const p: any = samplePlan();
    delete p.lang;
    expect(checkPlan(parsePlan(p)).errors).toEqual([]);
  });
});

describe('holdSeconds', () => {
  it('extends a caption so its typed terminal lines fit', async () => {
    const {holdSeconds, captionSeconds} = await import('../src/timing.ts');
    const scene = {type: 'terminal', captions: ['짧음'], lines: [{cmd: 'x'.repeat(64), out: 'ok'}, {cmd: 'y'.repeat(64)}, {cmd: 'z'}]};
    // 1.4 + 0.25 + 1.4 + 1/32 typing, plus a beat to read
    expect(holdSeconds(scene, 0)).toBeGreaterThan(captionSeconds('짧음'));
    expect(holdSeconds(scene, 0)).toBeCloseTo(1.4 + 0.25 + 1.4 + 1 / 32 + 0.8);
  });

  it('is just the caption time for other scenes', async () => {
    const {holdSeconds, captionSeconds} = await import('../src/timing.ts');
    expect(holdSeconds({type: 'title', captions: ['안녕하세요']}, 0)).toBe(captionSeconds('안녕하세요'));
  });
});

describe('title meta', () => {
  it('accepts an explicit meta line', () => {
    const p: any = samplePlan();
    p.scenes[0].meta = 'rnd/mr-video · Revideo';
    expect(parsePlan(p).scenes[0]).toMatchObject({meta: 'rnd/mr-video · Revideo'});
  });
});

describe('theme', () => {
  it('defaults to light and accepts dark', async () => {
    const {PALETTES, paletteFor} = await import('../src/render/theme.ts');
    expect(parsePlan(samplePlan()).theme).toBeUndefined();
    const p: any = samplePlan();
    p.theme = 'light';
    expect(parsePlan(p).theme).toBe('light');
    p.theme = 'sepia';
    expect(() => parsePlan(p)).toThrow();
    expect(paletteFor(undefined)).toBe(PALETTES.light);
    expect(paletteFor('dark')).toBe(PALETTES.dark);
    expect(paletteFor('light')).toBe(PALETTES.light);
  });

  it('keeps every palette color readable against its background', async () => {
    const {PALETTES} = await import('../src/render/theme.ts');
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    for (const p of Object.values(PALETTES)) {
      expect(contrast(p.fg, p.bg)).toBeGreaterThan(7);
      expect(contrast(p.fg, p.card)).toBeGreaterThan(7);
      for (const c of [p.muted, p.accent, p.ok, p.bad]) expect(contrast(c, p.bg)).toBeGreaterThan(3);
    }
  });
});

describe('clip scenes', () => {
  it('accepts a clip scene and keeps it on screen for the whole clip', async () => {
    const {sceneSeconds} = await import('../src/timing.ts');
    const p: any = samplePlan();
    p.scenes.splice(1, 0, {type: 'clip', title: '결과 화면', file: 'clip.mp4', url: 'http://localhost:4000/hive', captions: ['저장하면', '목록에 바로 보입니다.']});
    const plan = parsePlan(p);
    expect(checkPlan(plan).errors).toEqual([]);
    const clip: any = plan.scenes[1];
    const reading = sceneSeconds(clip);
    expect(sceneSeconds({...clip, clipSeconds: 1})).toBeCloseTo(reading); // short clip: reading time wins
    expect(sceneSeconds({...clip, clipSeconds: 20})).toBeCloseTo(20.5); // long clip: clip + 0.5 s tail
  });
});

describe('voice timing', () => {
  it('holds a caption until its spoken line ends', async () => {
    const {holdSeconds, captionStarts} = await import('../src/timing.ts');
    const scene = {type: 'title', captions: ['짧음', '두 번째'], voiceSeconds: [5, 0.5]};
    expect(holdSeconds(scene, 0)).toBeCloseTo(5.4);
    expect(holdSeconds(scene, 1)).toBe(captionSeconds('두 번째'));
    expect(captionStarts({scenes: [scene, scene]})).toEqual([[0, 5.4], [5.4 + captionSeconds('두 번째'), 10.8 + captionSeconds('두 번째')]]);
  });

  it('checks that say matches the captions', () => {
    const p: any = samplePlan();
    p.voice = true;
    p.scenes[0].say = ['하나', '둘', '셋', '넷', '다섯', '여섯'].slice(0, p.scenes[0].captions.length + 1);
    expect(checkPlan(parsePlan(p)).errors.join()).toMatch(/say/);
    p.scenes[0].say = p.scenes[0].captions.map(() => '읽을 문장');
    expect(checkPlan(parsePlan(p)).errors).toEqual([]);
    p.voice = false;
    expect(checkPlan(parsePlan(p)).warnings.join()).toMatch(/say/);
  });
});
