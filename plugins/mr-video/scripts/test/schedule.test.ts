import {describe, expect, it} from 'vitest';
import {scheduleBeats} from '../src/render/schedule.ts';

describe('scheduleBeats', () => {
  it('maps one beat per caption', () => {
    expect(scheduleBeats(['a', 'b', 'c'], 3)).toEqual([['a'], ['b'], ['c']]);
  });

  it('plays leftover beats on the last caption, in order', () => {
    expect(scheduleBeats(['a', 'b', 'c'], 1)).toEqual([['a', 'b', 'c']]);
    expect(scheduleBeats(['a', 'b', 'c'], 2)).toEqual([['a'], ['b', 'c']]);
  });

  it('leaves extra captions without beats', () => {
    expect(scheduleBeats(['a'], 3)).toEqual([['a'], [], []]);
  });
});
