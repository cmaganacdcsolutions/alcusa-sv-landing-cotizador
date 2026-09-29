import { describe, expect, it } from 'vitest';
import { mockCreateWompiPayment } from './mock';

describe('mockCreateWompiPayment', () => {
  it('approves by default, no forceOutcome', async () => {
    const result = await mockCreateWompiPayment(209.6);
    expect(result.outcome).toBe('approved');
    expect(result.orderNumber).toMatch(/^ALC-\d{4}-\d{4}$/);
    expect(result.reference).toContain('209.60');
  });

  it('respects forceOutcome: declined (e2e determinism hook)', async () => {
    const result = await mockCreateWompiPayment(262, { forceOutcome: 'declined' });
    expect(result.outcome).toBe('declined');
  });

  it('never touches the network — resolves synchronously with a plain object', async () => {
    const result = await mockCreateWompiPayment(100);
    expect(typeof result.orderNumber).toBe('string');
    expect(typeof result.reference).toBe('string');
  });
});
