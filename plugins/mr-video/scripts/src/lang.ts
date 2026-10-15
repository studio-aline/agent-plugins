export const LANGS = ['cpp', 'elixir', 'csharp', 'javascript', 'typescript', 'rust'] as const;
export type Lang = (typeof LANGS)[number];

const EXT: Record<string, Lang> = {
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hh: 'cpp', hpp: 'cpp', inl: 'cpp',
  ex: 'elixir', exs: 'elixir',
  cs: 'csharp',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  rs: 'rust',
};

export function detectLang(file: string): Lang | undefined {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return EXT[ext];
}

/** JSX syntax is on for .jsx/.tsx (and plain JS, where it rarely conflicts); TypeScript generics need it off. */
export function usesJsx(file: string): boolean {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'jsx' || ext === 'tsx' || ext === 'js' || ext === 'mjs' || ext === 'cjs';
}
