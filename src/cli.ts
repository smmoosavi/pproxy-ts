/**
 * CLI argument parsing
 */

import { Command } from 'commander';
import type { ProxyConfig } from './types.ts';
import { ListenAddressSchema, UpstreamServerSchema } from './types.ts';

/**
 * Parse command line arguments and return configuration
 */
export function parseCliArgs(argv: string[]): ProxyConfig {
  const program = new Command();

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
    .helpOption('-h, --help', 'Show this help message and exit')
    .parse(argv);

  const options = program.opts<{
    listen: string;
    rserver: string;
    direct?: string;
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

  return {
    listen: listenResult.data,
    upstream: upstreamResult.data,
    directFile: options.direct,
  };
}
