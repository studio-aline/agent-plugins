// Each supported language parses real code without syntax errors and marks keywords for highlighting.
import {highlightTree, tagHighlighter, tags as t} from '@lezer/highlight';
import {parser as cppParser} from '@lezer/cpp';
import {parser as jsParser} from '@lezer/javascript';
import {parser as rustParser} from '@lezer/rust';
import {StreamLanguage} from '@codemirror/language';
import {csharp} from '@codemirror/legacy-modes/mode/clike';
import {parser as elixirParser} from 'lezer-elixir';
import type {Parser} from '@lezer/common';
import {describe, expect, it} from 'vitest';

const SAMPLES: [string, Parser, string, string][] = [
  ['cpp', cppParser, 'int Merge(Item& a) { return a.count; }', 'return'],
  ['elixir', elixirParser, 'defmodule A do\n  def f(x), do: x + 1\nend', 'def'],
  ['csharp', StreamLanguage.define(csharp).parser, 'public sealed class Player { public async Task<int> Hit(int d) { await Task.Yield(); return Hp -= d; } }', 'return'],
  ['javascript', jsParser.configure({dialect: 'jsx'}), 'export function f(a) { return <b>{a}</b>; }', 'return'],
  ['typescript', jsParser.configure({dialect: 'ts'}), 'export const id = <T,>(x: T): T => x;\ninterface A { n: number }', 'interface'],
  ['tsx', jsParser.configure({dialect: 'ts jsx'}), 'export function A({n}: {n: number}) { return <div>{n}</div>; }', 'return'],
  ['rust', rustParser, 'pub fn merge(a: &mut Item) -> u32 { let n = a.count; n }', 'fn'],
];

const marker = tagHighlighter([{tag: t.keyword, class: 'kw'}, {tag: t.controlKeyword, class: 'kw'}, {tag: t.definitionKeyword, class: 'kw'}, {tag: t.modifier, class: 'kw'}]);

describe('grammars', () => {
  it.each(SAMPLES)('%s parses and highlights keywords', (_, parser, code, keyword) => {
    const tree = parser.parse(code);
    let errors = 0;
    tree.iterate({enter: n => { if (n.type.isError) errors++; }});
    expect(errors).toBe(0);
    const words: string[] = [];
    highlightTree(tree, marker, (from, to, cls) => { if (cls.includes('kw')) words.push(code.slice(from, to)); });
    expect(words).toContain(keyword);
  });
});
