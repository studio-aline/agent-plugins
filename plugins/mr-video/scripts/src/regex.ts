/** Revideo's findFirstRange(string) builds an unescaped RegExp, so `foo(bar)` never matches. */
export function literalPattern(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
}
