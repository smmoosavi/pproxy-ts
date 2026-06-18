import type { ConnectionStats, Server } from 'proxy-chain';
import { valuesToGraph } from './graph-utils.ts';
import type { Logger } from './logger.ts';
import type { ProxyConfig } from './types.ts';

const WINDOW_SECONDS = 60;
const FOOTER_WIDTH = 60;
const SAMPLE_INTERVAL_MS = 1000;
const SEPARATOR = '─'.repeat(FOOTER_WIDTH);

interface ConnectionSnapshot {
  totalBytes: number;
}

interface UsageSample {
  second: number;
  bytes: number;
}

interface ConnectionClosedEvent {
  connectionId: number;
  stats: ConnectionStats;
}

export class UsageMeter {
  private readonly server: Server;
  private readonly logger: Logger;
  private readonly config: ProxyConfig;
  private readonly startedAt = Date.now();
  private readonly connectionSnapshots = new Map<number, ConnectionSnapshot>();
  private readonly samples: UsageSample[] = [];
  private totalBytes = 0;
  private interval: NodeJS.Timeout | undefined;
  private signal: AbortSignal | undefined;

  constructor(server: Server, logger: Logger, config: ProxyConfig) {
    this.server = server;
    this.logger = logger;
    this.config = config;
  }

  start(signal: AbortSignal): void {
    if (signal.aborted) {
      return;
    }

    this.signal = signal;
    this.server.on('connectionClosed', this.handleConnectionClosed);
    this.renderFooter(0);
    this.interval = setInterval(() => {
      this.sampleActiveConnections();
    }, SAMPLE_INTERVAL_MS);
    signal.addEventListener('abort', this.handleAbort, { once: true });
  }

  private stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.server.off('connectionClosed', this.handleConnectionClosed);
    this.signal?.removeEventListener('abort', this.handleAbort);
    this.signal = undefined;
    this.logger.clearFooter();
  }

  private readonly handleAbort = (): void => {
    this.stop();
  };

  private readonly handleConnectionClosed = ({
    connectionId,
    stats,
  }: ConnectionClosedEvent): void => {
    const previousTotal =
      this.connectionSnapshots.get(connectionId)?.totalBytes ?? 0;
    const currentTotal = getTotalBytes(stats);
    const deltaBytes = Math.max(0, currentTotal - previousTotal);

    this.connectionSnapshots.delete(connectionId);
    this.addSample(deltaBytes);
    this.renderFooter(deltaBytes);
  };

  private sampleActiveConnections(): void {
    let deltaBytes = 0;

    for (const connectionId of this.server.getConnectionIds()) {
      const stats = this.server.getConnectionStats(connectionId);
      if (!stats) {
        continue;
      }

      const previousTotal =
        this.connectionSnapshots.get(connectionId)?.totalBytes ?? 0;
      const currentTotal = getTotalBytes(stats);
      deltaBytes += Math.max(0, currentTotal - previousTotal);
      this.connectionSnapshots.set(connectionId, { totalBytes: currentTotal });
    }

    this.addSample(deltaBytes);
    this.renderFooter(deltaBytes);
  }

  private addSample(bytes: number): void {
    const second = Math.floor(Date.now() / SAMPLE_INTERVAL_MS);
    const currentSample = this.samples.at(-1);
    this.totalBytes += bytes;

    if (currentSample?.second === second) {
      currentSample.bytes += bytes;
    } else {
      this.samples.push({ second, bytes });
    }

    this.trimSamples(second);
  }

  private trimSamples(currentSecond: number): void {
    const oldestSecond = currentSecond - WINDOW_SECONDS + 1;
    while (this.samples[0] && this.samples[0].second < oldestSecond) {
      this.samples.shift();
    }
  }

  private renderFooter(currentSpeedBytes: number): void {
    const usageBySecond = this.getUsageWindow();
    const graph = valuesToGraph(usageBySecond, this.config.peakBytes);
    const uptimeSeconds = Math.floor(
      (Date.now() - this.startedAt) / SAMPLE_INTERVAL_MS,
    );
    const upstream =
      this.config.upstream === 'direct' ? 'direct' : this.config.upstream;
    const listenPort = this.server.port;

    this.logger.setFooter([
      SEPARATOR,
      `up: ${upstream.padEnd(30)} | HTTP Proxy: :${listenPort}`,
      `Uptime: ${formatDuration(uptimeSeconds).padEnd(9)} | Total: ${formatBytes(this.totalBytes).padEnd(10)} | Speed: ${formatBytes(currentSpeedBytes)}/s`,
      graph
        .padStart(Math.floor((FOOTER_WIDTH + graph.length) / 2))
        .padEnd(FOOTER_WIDTH),
      SEPARATOR,
    ]);
  }

  private getUsageWindow(): number[] {
    const currentSecond = Math.floor(Date.now() / SAMPLE_INTERVAL_MS);
    const bytesBySecond = new Map(
      this.samples.map((sample) => [sample.second, sample.bytes]),
    );

    return Array.from({ length: WINDOW_SECONDS }, (_, index) => {
      const second = currentSecond - WINDOW_SECONDS + 1 + index;
      return bytesBySecond.get(second) ?? 0;
    });
  }
}

function getTotalBytes(stats: ConnectionStats): number {
  return (
    stats.srcTxBytes +
    stats.srcRxBytes +
    (stats.trgTxBytes ?? 0) +
    (stats.trgRxBytes ?? 0)
  );
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
