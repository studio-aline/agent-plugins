import {describe, expect, it} from 'vitest';
import {findAllCodeRanges} from '@revideo/2d/lib/code/CodeRange.js';
import {literalPattern} from '../src/regex.ts';

const code = 'defp go(n) do\n  Process.sleep(backoff(n))\nend';

describe('literalPattern', () => {
  it('documents the Revideo bug: a raw string with parens finds nothing', () => {
    expect(findAllCodeRanges(code, 'Process.sleep(backoff(n))')).toEqual([]);
  });

  it('finds the exact text, including regex metacharacters', () => {
    expect(findAllCodeRanges(code, literalPattern('Process.sleep(backoff(n))'))).toEqual([[[1, 2], [1, 27]]]);
    expect(findAllCodeRanges('a * b + c?', literalPattern('* b + c?'))).toHaveLength(1);
  });

  it('does not treat . as a wildcard', () => {
    expect(findAllCodeRanges('aXb', literalPattern('a.b'))).toEqual([]);
  });
});
