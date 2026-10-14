import type {Node} from '@revideo/2d';
import type {ThreadGenerator} from '@revideo/core';
import type {DiagramFrames} from '../diagram.ts';
import type {Plan} from '../plan.ts';

/** What the browser receives: the plan plus assets prepared in Node (mermaid pictures by scene index). */
export type RenderPlan = Plan & {diagrams?: Record<number, DiagramFrames>};

/** One animation step, started together with the caption of the same index. */
export type Beat = () => ThreadGenerator;

export type Builder<S> = (scene: S, stage: Node, plan: Plan) => Beat[];

export function* idle(): ThreadGenerator {}
