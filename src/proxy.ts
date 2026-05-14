/**
 * Proxy server implementation using proxy-chain
 */

import { Server } from 'proxy-chain';
import type { Logger } from './logger.ts';
import type { ProxyConfig } from './types.ts';
import { parseListenAddress } from './types.ts';

/**
 * Create and start the proxy server
 */
export async function startProxyServer(
  config: ProxyConfig,
  logger: Logger,
): Promise<Server> {
  const { host, port } = parseListenAddress(config.listen);
  const upstreamProxyUrl =
    config.upstream === 'direct' ? null : config.upstream;

  logger.info(`Starting HTTP proxy server on ${host}:${port}`);
  logger.info(`Upstream: ${config.upstream}`);

  const server = new Server({
    port,
    host,
    verbose: false,
    prepareRequestFunction: ({
      request,
      username,
      password,
      hostname,
      port,
      isHttp,
    }) => {
      // Log the domain being accessed
      logger.info(`→ ${hostname}:${port}`);
      return {
        requestAuthentication: false,
        upstreamProxyUrl,
      };
    },
  });

  await server.listen();

  logger.info(`✓ Proxy server listening on ${host}:${port}`);

  return server;
}

/**
 * Stop the proxy server gracefully
 */
export async function stopProxyServer(
  server: Server,
  logger: Logger,
): Promise<void> {
  logger.info('Stopping proxy server...');
  await server.close(true);
  logger.info('✓ Proxy server stopped');
}
