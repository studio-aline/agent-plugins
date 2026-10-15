import {HighlightStyle} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';
import {DefaultHighlightStyle, LezerHighlighter} from '@revideo/2d';
import {parser as cppParser} from '@lezer/cpp';
import {parser as elixirParser} from 'lezer-elixir';
import {DEFAULT_THEME, type ThemeName} from './theme.ts';

// Readable on a white card; colors in the spirit of common light editor themes.
const LightHighlightStyle = HighlightStyle.define([
  {tag: [t.keyword, t.operatorKeyword, t.modifier], color: '#cf222e'},
  {tag: [t.name, t.propertyName, t.macroName, t.labelName], color: '#1f2328'},
  {tag: [t.variableName], color: '#953800'},
  {tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#8250df'},
  {tag: [t.typeName, t.className, t.namespace], color: '#953800'},
  {tag: [t.definition(t.name), t.definition(t.variableName)], color: '#8250df'},
  {tag: [t.number, t.bool, t.atom, t.constant(t.name), t.standard(t.name), t.self], color: '#0550ae'},
  {tag: [t.string, t.special(t.string), t.regexp, t.character], color: '#0a3069'},
  {tag: [t.comment, t.lineComment, t.blockComment], color: '#6e7781'},
  {tag: [t.operator, t.punctuation, t.separator, t.brace, t.bracket, t.squareBracket, t.angleBracket], color: '#1f2328'},
  {tag: [t.annotation, t.meta], color: '#116329'},
]);

const PARSERS = {cpp: cppParser, elixir: elixirParser};
const STYLES = {dark: DefaultHighlightStyle, light: LightHighlightStyle};
const cache = new Map<string, LezerHighlighter>();

export function highlighterFor(lang: keyof typeof PARSERS, theme: ThemeName | undefined): LezerHighlighter {
  const t = theme ?? DEFAULT_THEME;
  const key = `${lang}:${t}`;
  if (!cache.has(key)) cache.set(key, new LezerHighlighter(PARSERS[lang], STYLES[t]));
  return cache.get(key)!;
}
