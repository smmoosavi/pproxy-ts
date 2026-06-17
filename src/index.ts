/**
 * Main entry point for pproxy-ts
 * A simple HTTP proxy server with upstream support
 */

import { logger } from './logger.ts';
import { parseCliArgs } from './cli.ts';
import { startProxyServer, stopProxyServer } from './proxy.ts';
import { UsageMeter } from './usage-meter.ts';

async function main() {
  try {
    // Parse command line arguments
    const config = parseCliArgs(process.argv);

    // Start the proxy server
    const server = await startProxyServer(config, logger);
    const usageMeter = config.showFooter
      ? new UsageMeter(server, logger, config)
      : undefined;
    usageMeter?.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      usageMeter?.stop();
      logger.emptyLine();
      await stopProxyServer(server, logger);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
    } else {
      logger.error('An unknown error occurred');
    }
    process.exit(1);
  }
}

main();
