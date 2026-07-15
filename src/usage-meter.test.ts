import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'events';
import type { ConnectionStats, Server } from 'proxy-chain';
import {
  createUsageStatsAtom,
  getTotalBytes,
  UsageMeter,
} from './usage-meter.ts';

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

describe('UsageMeter', () => {
  it('captures active connection bytes before stopping', () => {
    const connectionStats = {
      srcTxBytes: 1024,
      srcRxBytes: 2048,
    } as ConnectionStats;
    const server = Object.assign(new EventEmitter(), {
      getConnectionIds: () => [1],
      getConnectionStats: () => connectionStats,
    }) as unknown as Server;
    const usageStats = createUsageStatsAtom();
    const abortController = new AbortController();
    const usageMeter = new UsageMeter(server, usageStats);

    usageMeter.start(abortController.signal);
    abortController.abort();

    expect(usageStats.get().totalBytes).toBe(3072);
    expect(usageStats.get().currentSpeedBytes).toBe(3072);
  });
});
