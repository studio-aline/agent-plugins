// Slow: renders real videos through headless Chromium. Run with `npm run test:render`.
import {existsSync, mkdtempSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {contactSheet, regionLuma} from '../src/media.ts';
import {parsePlan} from '../src/plan.ts';
import {renderPlan, sceneEndTimes} from '../src/render/run.ts';
import {elixirPlan} from './fixtures/elixir-plan.ts';
import {samplePlan} from './fixtures/sample-plan.ts';

const out = mkdtempSync(join(tmpdir(), 'mr-video-render-'));

describe.each([
  ['cpp', samplePlan()],
  ['elixir', elixirPlan()],
])('render %s', (name, raw) => {
  it('produces a video that passes QA and a preview sheet', {timeout: 300_000}, async () => {
    const plan = parsePlan(raw);
    const r = await renderPlan(plan, join(out, `${name}.mp4`));
    expect(r.qa.problems).toEqual([]);
    expect(r.qa.ok).toBe(true);
    expect(r.bytes).toBeGreaterThan(10_000);

    const sheet = join(out, `${name}.png`);
    contactSheet(r.video, sceneEndTimes(plan), sheet);
    expect(existsSync(sheet) && statSync(sheet).size > 10_000).toBe(true);
    console.error(`[render ${name}] ${r.video} ${r.seconds.toFixed(1)}s in ${r.renderSeconds.toFixed(1)}s; sheet ${sheet}`);
  });
});

describe('beats beyond the last caption', () => {
  it('still shows the "not run" column when tests has one caption', {timeout: 300_000}, async () => {
    const raw = samplePlan();
    const tests = raw.scenes.find(s => s.type === 'tests')!;
    tests.captions = ['테스트 결과입니다.'];
    raw.scenes = raw.scenes.filter(s => s.type !== 'code');
    const plan = parsePlan(raw);
    const r = await renderPlan(plan, join(out, 'one-caption.mp4'));
    expect(r.qa.problems).toEqual([]);

    const end = sceneEndTimes(plan)[plan.scenes.findIndex(s => s.type === 'tests')];
    // Right column (x≈370..1180 in the 1280×720 frame) vs. an empty strip of background below it.
    const column = regionLuma(r.video, end, 700, 250, 480, 120);
    const background = regionLuma(r.video, end, 700, 480, 480, 60);
    console.error(`[one-caption] column=${column.toFixed(2)} background=${background.toFixed(2)}`);
    expect(column - background).toBeGreaterThan(2);
  });
});

describe('mermaid and table scenes', () => {
  it('renders a flowchart with emphasis, a scrolling sequence diagram and a table', {timeout: 300_000}, async () => {
    const {FLOW_BEFORE_AFTER, SEQUENCE_TALL} = await import('./fixtures/mermaid.ts');
    const raw: any = samplePlan();
    raw.scenes = [
      raw.scenes[0],
      {type: 'mermaid', title: '동접 경로', code: FLOW_BEFORE_AFTER, emphasis: [{bad: ['C', 'LC']}, {accent: ['A', 'SR']}], captions: ['예전에는 60초마다 따로 쌓았습니다.', '이제 5초마다 한 경로로 모읍니다.']},
      {type: 'mermaid', title: 'nexus 수집 흐름', code: SEQUENCE_TALL, captions: ['리포트를 받습니다.', '틱마다 저장합니다.', '분마다 집계합니다.']},
      {type: 'table', title: '왜 JSON인가', columns: ['방식', '판단'], accentRow: 2,
        rows: [['값마다 컬럼', '지표를 추가할 때마다 마이그레이션'], ['Erlang 바이너리', 'SQL로 볼 수 없음'], ['JSON + 변환 모듈', '통째로 교체, 마이그레이션 불필요']],
        captions: ['구조가 있는 값이 섞여 있습니다.', 'JSON 한 컬럼에 담기로 했습니다.']},
    ];
    const plan = parsePlan(raw);
    const r = await renderPlan(plan, join(out, 'mermaid.mp4'));
    expect(r.qa.problems).toEqual([]);
    const sheet = join(out, 'mermaid.png');
    contactSheet(r.video, sceneEndTimes(plan), sheet);
    console.error(`[mermaid] ${r.video} sheet ${sheet}`);
  });
});

describe('terminal scene', () => {
  it('types several commands in one caption without stretching the planned length', {timeout: 300_000}, async () => {
    const raw: any = samplePlan();
    raw.scenes = [
      raw.scenes[0],
      {type: 'terminal', title: '설치', prompt: 'PS>', captions: ['한 번에 설치합니다.'], lines: [
        {cmd: 'npm install', out: 'Applying patches...\n@revideo/renderer@0.11.0 ✔'},
        {cmd: 'setx GITLAB_HOST "<GitLab 호스트>"', out: '성공: 지정한 값을 저장했습니다.'},
        {cmd: 'setx GITLAB_TOKEN "<api 스코프 PAT>"', out: '성공: 지정한 값을 저장했습니다.'},
      ]},
      raw.scenes.at(-1),
    ];
    const plan = parsePlan(raw);
    const r = await renderPlan(plan, join(out, 'terminal.mp4'));
    expect(r.qa.problems).toEqual([]);
    contactSheet(r.video, sceneEndTimes(plan), join(out, 'terminal.png'));
  });
});
