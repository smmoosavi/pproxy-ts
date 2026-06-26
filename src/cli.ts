/**
 * CLI argument parsing
 */

import { Command } from 'commander';
import type { ProxyConfig } from './types.ts';
import {
  ByteSizeSchema,
  ListenAddressSchema,
  UpstreamServerSchema,
} from './types.ts';

/**
 * Parse command line arguments and return configuration
 */
export function parseCliArgs(argv: string[]): ProxyConfig {
  const program = new Command();
  const normalizedArgv = argv[2] === '--' ? argv.toSpliced(2, 1) : argv;

  program
    .name('pproxy-ts')
    .description('A simple HTTP proxy server with upstream support')
    .option(
      '-l, --listen <address>',
      'HTTP proxy server listen address',
      '0.0.0.0:3080',
    )
    .option('-r, --rserver <uri>', 'Upstream proxy server URI', 'direct')
    .option(
      '-d, --direct <file>',
      'Path to direct file with domains to bypass proxy',
    )
    .option('-b, --block <file>', 'Path to block file with domains to reject')
    .option(
      '-p, --peak-bytes <bytes>',
      'Maximum bytes per second used to scale the usage graph',
      '6M',
    )
    .option('--no-footer', 'Disable footer display')
    .helpOption('-h, --help', 'Show this help message and exit')
    .parse(normalizedArgv);

  const options = program.opts<{
    listen: string;
    rserver: string;
    direct?: string;
    block?: string;
    peakBytes: string;
    footer: boolean;
  }>();

  // Validate listen address
  const listenResult = ListenAddressSchema.safeParse(options.listen);
  if (!listenResult.success) {
    throw new Error(`Invalid listen address: ${options.listen}`);
  }

  // Validate upstream server
  const upstreamResult = UpstreamServerSchema.safeParse(options.rserver);
  if (!upstreamResult.success) {
    throw new Error(`Invalid upstream server: ${options.rserver}`);
  }

  // Validate peak bytes
  const peakBytesResult = ByteSizeSchema.safeParse(options.peakBytes);
  if (!peakBytesResult.success) {
    throw new Error(`Invalid peak bytes: ${options.peakBytes}`);
  }

  return {
    listen: listenResult.data,
    upstream: upstreamResult.data,
    directFile: options.direct,
    blockFile: options.block,
    peakBytes: peakBytesResult.data,
    showFooter: options.footer,
  };
}
