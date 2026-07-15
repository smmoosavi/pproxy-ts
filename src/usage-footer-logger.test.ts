import { describe, expect, it } from 'bun:test';
import type { Server } from 'proxy-chain';
import { atom } from './atom.ts';
import type { Logger } from './logger.ts';
import type { ProxyConfig } from './types.ts';
import { UsageFooterLogger } from './usage-footer-logger.ts';
import type { UsageStats } from './usage-meter.ts';

describe('UsageFooterLogger', () => {
  it('prints a durable usage summary when aborted', () => {
    const usageStats = atom<UsageStats>({
      currentSpeedBytes: 512,
      totalBytes: 12 * 1024,
      uptimeSeconds: 6,
      usageBySecond: [512],
    });
    const rawCalls: unknown[][] = [];
    let footerCleared = false;
    const logger = {
      setFooter: () => undefined,
      clearFooter: () => {
        footerCleared = true;
      },
      raw: (...args: unknown[]) => {
        rawCalls.push(args);
      },
    } as unknown as Logger;
    const server = { port: 3080 } as Server;
    const config = {
      upstream: 'direct',
      peakBytes: 1024,
    } as ProxyConfig;
    const abortController = new AbortController();

    new UsageFooterLogger(usageStats, server, logger, config).start(
      abortController.signal,
    );
    abortController.abort();

    expect(footerCleared).toBe(true);
    expect(rawCalls).toEqual([
      [
        [
          'Proxy stopped',
          'Uptime: 6s',
          'Total transferred: 12 KB',
          'Average speed: 2.0 KB/s',
          'Upstream: direct',
          'Listen port: 3080',
        ].join('\n'),
      ],
    ]);
  });
});
