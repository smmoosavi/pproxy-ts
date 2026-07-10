import { describe, expect, it } from 'bun:test';
import type { ConnectionStats } from 'proxy-chain';
import { getTotalBytes } from './usage-meter.ts';

describe('getTotalBytes', () => {
  it('counts traffic once at the client boundary', () => {
    const stats = {
      srcTxBytes: 32,
      srcRxBytes: 420,
      trgTxBytes: 420,
      trgRxBytes: 32,
    } as ConnectionStats;

    expect(getTotalBytes(stats)).toBe(452);
  });
});
