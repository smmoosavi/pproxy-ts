import type { Server } from 'proxy-chain';
import type { ReadonlyAtom } from './atom.ts';
import { valuesToGraph } from './graph-utils.ts';
import type { Logger } from './logger.ts';
import type { ProxyConfig } from './types.ts';
import type { UsageStats } from './usage-meter.ts';

const FOOTER_WIDTH = 60;
const SEPARATOR = '-'.repeat(FOOTER_WIDTH);

export class UsageFooterLogger {
  private signal: AbortSignal | undefined;
  private cleanup: (() => void) | undefined;

  constructor(
    private readonly usageStats: ReadonlyAtom<UsageStats>,
    private readonly server: Server,
    private readonly logger: Logger,
    private readonly config: ProxyConfig,
  ) {}

  start(signal: AbortSignal): void {
    if (signal.aborted) {
      return;
    }

    this.signal = signal;
    this.cleanup = this.usageStats.subscribe(() => {
      this.renderFooter(this.usageStats.get());
    });
    this.renderFooter(this.usageStats.get());
    signal.addEventListener('abort', this.handleAbort, { once: true });
  }

  private stop(): void {
    this.cleanup?.();
    this.cleanup = undefined;
    this.signal?.removeEventListener('abort', this.handleAbort);
    this.signal = undefined;
    this.logger.clearFooter();
  }

  private readonly handleAbort = (): void => {
    const stats = this.usageStats.get();
    this.stop();
    this.logger.raw(this.buildShutdownSummary(stats).join('\n'));
  };

  private buildShutdownSummary(stats: UsageStats): string[] {
    const averageSpeedBytes =
      stats.uptimeSeconds > 0 ? stats.totalBytes / stats.uptimeSeconds : 0;
    const upstream =
      this.config.upstream === 'direct' ? 'direct' : this.config.upstream;

    return [
      'Proxy stopped',
      `Uptime: ${formatDuration(stats.uptimeSeconds)}`,
      `Total transferred: ${formatBytes(stats.totalBytes)}`,
      `Average speed: ${formatBytes(averageSpeedBytes)}/s`,
      `Upstream: ${upstream}`,
      `Listen port: ${this.server.port}`,
    ];
  }

  private renderFooter(stats: UsageStats): void {
    const graph = valuesToGraph(stats.usageBySecond, this.config.peakBytes);
    const upstream =
      this.config.upstream === 'direct' ? 'direct' : this.config.upstream;

    this.logger.setFooter([
      SEPARATOR,
      `up: ${upstream.padEnd(30)} | HTTP Proxy: :${this.server.port}`,
      `Uptime: ${formatDuration(stats.uptimeSeconds).padEnd(9)} | Total: ${formatBytes(stats.totalBytes).padEnd(10)} | Speed: ${formatBytes(stats.currentSpeedBytes)}/s`,
      graph
        .padStart(Math.floor((FOOTER_WIDTH + graph.length) / 2))
        .padEnd(FOOTER_WIDTH),
      SEPARATOR,
    ]);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${formatNumber(value)} ${units[unitIndex]}`;
}

function formatNumber(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
