// Local Windows rendering only: system fonts are fine.
export const FONT = {ui: 'Malgun Gothic', mono: 'Consolas, "Malgun Gothic"'};

export type ThemeName = 'dark' | 'light';

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  ok: string;
  bad: string;
  warn: string;
  card: string; // raised surfaces: cards, boxes
  sunken: string; // table header, diagram clusters
  raised: string; // secondary diagram fill
  note: string; // diagram notes
  border: string;
  band: string; // caption band behind subtitles
}

export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    bg: '#0f1419',
    fg: '#e6edf3',
    muted: '#8b949e',
    accent: '#58a6ff',
    ok: '#3fb950',
    bad: '#f85149',
    warn: '#d29922',
    card: '#161b22',
    sunken: '#11161d',
    raised: '#1c2330',
    note: '#1f2a37',
    border: '#30363d',
    band: '#000000cc',
  },
  light: {
    bg: '#ffffff',
    fg: '#1f2328',
    muted: '#59636e',
    accent: '#0969da',
    ok: '#1a7f37',
    bad: '#cf222e',
    warn: '#9a6700',
    card: '#f6f8fa',
    sunken: '#eaeef2',
    raised: '#eef1f4',
    note: '#fff8c5',
    border: '#d1d9e0',
    band: '#f6f8faee',
  },
};

export const paletteFor = (theme: ThemeName | undefined): Palette => PALETTES[theme ?? 'dark'];

/**
 * The active palette. Scene builders read it while building, so the scene applies the plan's
 * theme once before building anything.
 */
export const COLOR: Palette = {...PALETTES.dark};

export function applyTheme(theme: ThemeName | undefined): void {
  Object.assign(COLOR, paletteFor(theme));
}

export const LAYOUT = {
  width: 1280,
  height: 720,
  headerY: -330,
  titleY: -280,
  captionY: 305,
  captionHeight: 110,
  // Free area for scene content, between the title band and the caption band.
  stageTop: -232,
  stageBottom: 228,
  stageWidth: 1180,
};
