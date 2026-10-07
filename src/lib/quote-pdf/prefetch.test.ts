import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefetchQuotePdf } from './index';

// The lazy PDF chunk can abort (navigation, flaky network: WebKit reports
// "Importing a module script failed"). The prefetch is best-effort, so that
// failure must never surface as an unhandled rejection.
vi.mock('./render', () => {
  throw new Error('Importing a module script failed.');
});

describe('prefetchQuotePdf', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    unhandled.length = 0;
  });

  it('swallows a failed chunk import (no unhandled rejection)', async () => {
    process.on('unhandledRejection', onUnhandled);
    expect(() => prefetchQuotePdf()).not.toThrow();
    // Let the rejected import settle and Node run its unhandled-rejection check.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(unhandled).toEqual([]);
  });
});
