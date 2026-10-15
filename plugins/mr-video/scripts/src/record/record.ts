// Records a scripted walk through a local web app (the MR's changed feature) as an MP4 clip.
// Uses mr-video's own Chromium and its own persistent profile, so it behaves the same under any
// agent host and never touches the user's personal browser profile.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import puppeteer, {type Browser, type Page} from 'puppeteer';
import {FFMPEG, FFPROBE} from '../media.ts';
import {isLocalUrl, type RecordStep, type Steps} from './steps.ts';

export const VIEWPORT = {width: 1280, height: 720};
const DEFAULT_TIMEOUT = 8000;

/** Persistent profile shared by `record` and `login-window`, so a sign-in survives between runs. */
export function defaultProfileDir(): string {
  return join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'mr-video', 'browser-profile');
}

export interface RecordResult {
  ok: boolean;
  clip: string;
  seconds: number;
  width: number;
  height: number;
  failedStep?: number;
  error?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * The browser screencast only emits a frame when something repaints, so the final state after a
 * click could be missing and the clip came out shorter than the run. An invisible 1px element that
 * changes every animation frame keeps frames flowing at a steady rate.
 * Kept as source text: a function would be rewritten by the TypeScript loader (name helpers that do
 * not exist in the page), and the ticker would silently fail under the CLI.
 */
const REPAINT_TICKER = `(() => {
  const start = () => {
    if (document.getElementById('__mr_video_tick')) return;
    const el = document.createElement('div');
    el.id = '__mr_video_tick';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;pointer-events:none;z-index:2147483647;background:#000;';
    document.documentElement.appendChild(el);
    let on = false;
    const tick = () => {
      on = !on;
      el.style.opacity = on ? '0.011' : '0.010';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;
const textSelector = (text: string) => `::-p-text(${JSON.stringify(text)})`;

function locate(page: Page, s: {selector?: string; text?: string; timeoutMs?: number}) {
  return page.locator(s.selector ?? textSelector(s.text!)).setTimeout(s.timeoutMs ?? DEFAULT_TIMEOUT);
}

async function runStep(page: Page, step: RecordStep): Promise<void> {
  switch (step.action) {
    case 'goto':
      await page.goto(step.url, {waitUntil: 'networkidle2', timeout: step.timeoutMs ?? 20_000});
      return;
    case 'click':
      await locate(page, step).click();
      await sleep(400); // let the UI react on camera
      return;
    case 'hover':
      await locate(page, step).hover();
      await sleep(300);
      return;
    case 'type':
      await locate(page, step).click();
      await page.keyboard.type(step.text, {delay: 60});
      return;
    case 'press':
      await page.keyboard.press(step.key as Parameters<Page['keyboard']['press']>[0]);
      await sleep(300);
      return;
    case 'wait':
      await locate(page, step).wait();
      return;
    case 'scroll':
      await page.evaluate(y => window.scrollBy({top: y, behavior: 'smooth'}), step.y);
      await sleep(700);
      return;
    case 'pause':
      await sleep(step.ms);
      return;
  }
}

function probe(file: string): {seconds: number; width: number; height: number} {
  const out = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', file], {encoding: 'utf8'}));
  return {seconds: Number(out.format.duration), width: out.streams[0].width, height: out.streams[0].height};
}

// Sign-in cookies of local apps, kept beside the profile. Many apps use session cookies (no expiry),
// which the browser drops when the login window closes, so they are saved here and restored on record.
const SESSION_FILE = 'mr-video-session.json';

interface SavedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expires?: number;
}

const isLocalCookie = (c: {domain: string}) => {
  const host = c.domain.replace(/^\./, '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]' || host === '::1';
};

async function localCookies(browser: Browser): Promise<SavedCookie[]> {
  const cdp = await browser.target().createCDPSession();
  const {cookies} = (await cdp.send('Storage.getCookies')) as {cookies: (SavedCookie & {session: boolean})[]};
  return cookies.filter(isLocalCookie).map(c => ({
    name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly,
    ...(c.sameSite ? {sameSite: c.sameSite} : {}),
    ...(c.session ? {} : {expires: c.expires}),
  }));
}

async function restoreSession(browser: Browser, profileDir: string): Promise<void> {
  const file = join(profileDir, SESSION_FILE);
  if (!existsSync(file)) return;
  const cookies = (JSON.parse(readFileSync(file, 'utf8')) as SavedCookie[]).filter(isLocalCookie);
  if (!cookies.length) return;
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Storage.setCookies', {cookies} as never);
}

/** Subframes may also hold documents that never touch the network. */
const isInertUrl = (raw: string) => /^(about|blob|data):/i.test(raw);

export async function recordSteps(s: Steps, outFile: string, opts: {profileDir?: string} = {}): Promise<RecordResult> {
  const clip = resolve(outFile);
  const webm = clip.replace(/\.mp4$/i, '') + '.raw.webm';
  mkdirSync(dirname(clip), {recursive: true});
  let blocked: string | undefined;
  let failedStep: number | undefined;
  let error: string | undefined;
  const fail = (where: string, why: string) => `${where} ${why}`;
  const leftLocal = (where: string) => `${where}에서 localhost 밖으로 이동하려 해서 중단했습니다: ${blocked}`;

  const profileDir = opts.profileDir ?? defaultProfileDir();
  try {
    const browser = await puppeteer.launch({
      headless: true,
      userDataDir: profileDir,
      defaultViewport: VIEWPORT,
      args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    });
    try {
      const page = (await browser.pages())[0] ?? (await browser.newPage());
      // Browser-wide filter, so popups, new tabs and frames are covered too. Sub-resources (CDN fonts,
      // scripts) may load; every document must stay local.
      const cdp = await browser.target().createCDPSession();
      cdp.on('Fetch.requestPaused', (e: {requestId: string; request: {url: string}}) => {
        const url = e.request.url;
        if (isLocalUrl(url) || isInertUrl(url)) {
          void cdp.send('Fetch.continueRequest', {requestId: e.requestId}).catch(() => undefined);
          return;
        }
        blocked ??= url;
        void cdp.send('Fetch.failRequest', {requestId: e.requestId, errorReason: 'BlockedByClient'}).catch(() => undefined);
      });
      await cdp.send('Fetch.enable', {patterns: [{urlPattern: '*', resourceType: 'Document', requestStage: 'Request'}]});
      await restoreSession(browser, profileDir);
      // Recordings show one tab; a popup (even a local one) means the script is off track.
      browser.on('targetcreated', t => {
        if (t.type() !== 'page' || t === page.target()) return;
        blocked ??= t.url() || '(새 창)';
        void t.page().then(p => p?.close()).catch(() => undefined);
      });
      await page.setViewport(VIEWPORT);

      await page.evaluateOnNewDocument(REPAINT_TICKER);
      await page.goto(s.url, {waitUntil: 'networkidle2', timeout: 20_000});
      if (blocked) error = leftLocal('첫 페이지(url)');
      for (const [i, step] of (s.before ?? []).entries()) {
        if (error) break;
        try {
          await runStep(page, step);
        } catch (e) {
          error = fail(`before[${i}](${step.action})`, `실패: ${(e as Error).message.split('\n')[0]}`);
          break;
        }
        if (blocked) error = leftLocal(`before[${i}](${step.action})`);
      }
      if (error) return {ok: false, clip, seconds: 0, width: 0, height: 0, error};

      const recorder = await page.screencast({path: webm as `${string}.webm`, ffmpegPath: FFMPEG, fps: 30});
      try {
        await sleep(500);
        for (const [i, step] of s.steps.entries()) {
          try {
            await runStep(page, step);
          } catch (e) {
            failedStep = i;
            error = fail(`steps[${i}](${step.action})`, `실패: ${(e as Error).message.split('\n')[0]}`);
            break;
          }
          if (blocked) {
            failedStep = i;
            error = leftLocal(`steps[${i}](${step.action})`);
            break;
          }
        }
        await sleep(600);
        if (blocked && !error) error = leftLocal('마지막 동작 뒤');
      } finally {
        await recorder.stop();
      }
    } finally {
      await browser.close();
    }

    if (error) return {ok: false, clip, seconds: 0, width: 0, height: 0, failedStep, error};
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', webm, '-an', '-r', '30', '-vf',
      `scale=${VIEWPORT.width}:${VIEWPORT.height}:force_original_aspect_ratio=decrease,pad=${VIEWPORT.width}:${VIEWPORT.height}:(ow-iw)/2:(oh-ih)/2:white`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', clip]);
    return {ok: true, clip, ...probe(clip)};
  } finally {
    rmSync(webm, {force: true});
  }
}

/** Closes the login window on its own before an agent host's 10-minute command timeout would kill us. */
export const LOGIN_WINDOW_MINUTES = 9;

export interface LoginWindowOptions {
  profileDir?: string;
  minutes?: number;
  /** Tests only: run without a visible window and drive the page instead of a person. */
  headless?: boolean;
  drive?: (page: Page) => Promise<void>;
}

/**
 * Opens a visible window on the shared profile so the user can sign in to their local app
 * themselves. Resolves when the user closes the window, or after `minutes` (the window is then
 * closed so no orphaned browser keeps the profile locked). The local app's cookies, including
 * session cookies the browser would forget, are saved for `record`.
 */
export async function openLoginWindow(url: string, opts: LoginWindowOptions = {}): Promise<{closedBy: 'user' | 'timeout'; cookies: number}> {
  if (!isLocalUrl(url)) throw new Error('localhost(127.0.0.1, ::1, *.localhost) 주소만 열 수 있습니다');
  const profileDir = opts.profileDir ?? defaultProfileDir();
  const browser = await puppeteer.launch({
    headless: opts.headless ?? false,
    userDataDir: profileDir,
    defaultViewport: null,
    args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height + 120}`],
  });
  const closed = new Promise<'user'>(r => browser.once('disconnected', () => r('user')));
  const close = () => void browser.close().catch(() => undefined);
  process.once('SIGINT', close).once('SIGTERM', close).once('SIGBREAK', close);

  // Cookies can no longer be read once the window is gone, so keep the latest copy while it is open.
  let saved: SavedCookie[] = [];
  const snapshot = async () => {
    try {
      saved = await localCookies(browser);
    } catch {
      // browser already closing
    }
  };
  const poll = setInterval(() => void snapshot(), 1000);

  // Closing the last window is the user saying "done", even if the browser process lingers.
  browser.on('targetdestroyed', () => {
    void browser.pages().then(pages => pages.length === 0 && close(), () => undefined);
  });

  const page = (await browser.pages())[0] ?? (await browser.newPage());
  await page.goto(url).catch(() => undefined);
  if (opts.drive) {
    await opts.drive(page);
    await snapshot();
    close();
  }
  let timer: NodeJS.Timeout | undefined;
  const result = await Promise.race([
    closed,
    new Promise<'timeout'>(r => { timer = setTimeout(() => r('timeout'), (opts.minutes ?? LOGIN_WINDOW_MINUTES) * 60_000); }),
  ]);
  clearTimeout(timer);
  clearInterval(poll);
  if (result === 'timeout') {
    await snapshot();
    await browser.close().catch(() => undefined);
  }
  writeFileSync(join(profileDir, SESSION_FILE), JSON.stringify(saved));
  return {closedBy: result, cookies: saved.length};
}
