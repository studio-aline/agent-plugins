// Revideo injects `variables` into a template literal without escaping backticks or `${`,
// so the plan crosses into the browser as base64. Works in Node and in the browser.

export function encodePlan(plan: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodePlan<T = unknown>(encoded: string): T {
  const bin = atob(encoded);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
