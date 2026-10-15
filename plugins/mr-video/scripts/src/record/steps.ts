import {z} from 'zod';

/** Only the developer's own machine: loopback addresses and *.localhost names. */
export function isLocalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]';
}

const localUrl = z.string().refine(isLocalUrl, 'localhost(127.0.0.1, ::1, *.localhost) 주소만 녹화할 수 있습니다');
const timeoutMs = z.number().int().min(100).max(15_000).optional();
const target = {selector: z.string().min(1).optional(), text: z.string().min(1).optional()};
const hasTarget = (s: {selector?: string; text?: string}) => Boolean(s.selector || s.text);

const Step = z.discriminatedUnion('action', [
  z.object({action: z.literal('goto'), url: localUrl, timeoutMs}),
  z.object({action: z.literal('click'), ...target, timeoutMs}).refine(hasTarget, 'click에는 selector나 text가 필요합니다'),
  z.object({action: z.literal('hover'), ...target, timeoutMs}).refine(hasTarget, 'hover에는 selector나 text가 필요합니다'),
  z.object({action: z.literal('type'), selector: z.string().min(1), text: z.string(), timeoutMs}),
  z.object({action: z.literal('press'), key: z.string().min(1)}),
  z.object({action: z.literal('wait'), ...target, timeoutMs}).refine(hasTarget, 'wait에는 selector나 text가 필요합니다'),
  z.object({action: z.literal('scroll'), y: z.number().int()}),
  z.object({action: z.literal('pause'), ms: z.number().int().min(0).max(10_000)}),
]);

export const StepsSchema = z.object({
  url: localUrl,
  // Run before recording starts and left out of the clip (e.g. a dev-account sign-in).
  before: z.array(Step).max(20).optional(),
  steps: z.array(Step).min(1).max(40),
});

export type Steps = z.infer<typeof StepsSchema>;
export type RecordStep = Steps['steps'][number];

export function parseSteps(input: unknown): Steps {
  return StepsSchema.parse(input);
}
