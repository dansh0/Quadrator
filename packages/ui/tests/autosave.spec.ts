import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver } from '../src/autosave.ts';

describe('createAutosaver (leading + trailing throttle)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes immediately on the first notify', () => {
    const write = vi.fn();
    createAutosaver(write, 5000).notify();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('coalesces notifies during the cooldown into one trailing write', () => {
    const write = vi.fn();
    const saver = createAutosaver(write, 5000);

    saver.notify();
    saver.notify();
    saver.notify();
    expect(write).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(2); // the trailing write

    vi.advanceTimersByTime(60_000);
    expect(write).toHaveBeenCalledTimes(2); // nothing pending → no more writes
  });

  it('a notify after an idle cooldown writes immediately again', () => {
    const write = vi.fn();
    const saver = createAutosaver(write, 5000);

    saver.notify();
    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(1);

    saver.notify();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('stop cancels a pending trailing write', () => {
    const write = vi.fn();
    const saver = createAutosaver(write, 5000);

    saver.notify();
    saver.notify(); // pending trailing
    saver.stop();

    vi.advanceTimersByTime(60_000);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
