import type { ConnectionStats, Server } from 'proxy-chain';
import { atom, type WritableAtom } from './atom.ts';

const WINDOW_SECONDS = 60;
const SAMPLE_INTERVAL_MS = 1000;

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

export interface UsageStats {
  currentSpeedBytes: number;
  totalBytes: number;
  uptimeSeconds: number;
  usageBySecond: number[];
}

export function createUsageStatsAtom(): WritableAtom<UsageStats> {
  return atom<UsageStats>({
    currentSpeedBytes: 0,
    totalBytes: 0,
    uptimeSeconds: 0,
    usageBySecond: Array.from({ length: WINDOW_SECONDS }, () => 0),
  });
}

export class UsageMeter {
  private readonly server: Server;
  private readonly startedAt = Date.now();
  private readonly connectionSnapshots = new Map<number, ConnectionSnapshot>();
  private readonly samples: UsageSample[] = [];
  private totalBytes = 0;
  private interval: NodeJS.Timeout | undefined;
  private signal: AbortSignal | undefined;

  constructor(
    server: Server,
    private readonly usageStats: WritableAtom<UsageStats>,
  ) {
    this.server = server;
  }

  start(signal: AbortSignal): void {
    if (signal.aborted) {
      return;
    }

    this.signal = signal;
    this.server.on('connectionClosed', this.handleConnectionClosed);
    this.publishStats(0);
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
    this.publishStats(deltaBytes);
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
    this.publishStats(deltaBytes);
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

  private publishStats(currentSpeedBytes: number): void {
    const uptimeSeconds = Math.floor(
      (Date.now() - this.startedAt) / SAMPLE_INTERVAL_MS,
    );

    this.usageStats.set({
      currentSpeedBytes,
      totalBytes: this.totalBytes,
      uptimeSeconds,
      usageBySecond: this.getUsageWindow(),
    });
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
