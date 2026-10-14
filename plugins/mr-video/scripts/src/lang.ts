export type Lang = 'cpp' | 'elixir';

const EXT: Record<string, Lang> = {
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hh: 'cpp', hpp: 'cpp', inl: 'cpp',
  ex: 'elixir', exs: 'elixir',
};

export function detectLang(file: string): Lang | undefined {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return EXT[ext];
}
