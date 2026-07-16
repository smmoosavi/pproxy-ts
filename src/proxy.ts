/**
 * Proxy server implementation using proxy-chain
 */

import { Server } from 'proxy-chain';
import { RequestError } from 'proxy-chain';
import type { Logger } from './logger.ts';
import type { ProxyConfig } from './types.ts';
import { parseListenAddress } from './types.ts';
import { createRulesMatcher } from './rules.ts';

/**
 * Create and start the proxy server
 */
export async function startProxyServer(
  config: ProxyConfig,
  logger: Logger,
  signal: AbortSignal,
  onStopped?: () => void,
): Promise<Server> {
  if (signal.aborted) {
    throw new Error('Proxy server startup aborted');
  }

  const { host, port } = parseListenAddress(config.listen);
  const upstreamProxyUrl =
    config.upstream === 'direct' ? null : config.upstream;

  // Create direct matcher if direct file is specified
  const directMatcher = config.directFile
    ? createRulesMatcher(config.directFile)
    : null;
  const blockMatcher = config.blockFile
    ? createRulesMatcher(config.blockFile)
    : null;

  logger.info(`Starting HTTP proxy server on ${host}:${port}`);
  logger.info(`Upstream: ${config.upstream}`);
  if (config.directFile) {
    logger.info(`Direct file: ${config.directFile}`);
  }
  if (config.blockFile) {
    logger.info(`Block file: ${config.blockFile}`);
  }

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
      const shouldBlock = blockMatcher ? blockMatcher(hostname) : false;
      if (shouldBlock) {
        logger.info(`→ [block] ${hostname}:${port}`);
        throw new RequestError(`Blocked by pproxy-ts: ${hostname}`, 403);
      }

      // Check if this hostname should bypass the proxy
      const shouldBypass = directMatcher ? directMatcher(hostname) : false;
      const effectiveUpstream = shouldBypass ? null : upstreamProxyUrl;

      // Log the domain being accessed
      const routeInfo = shouldBypass
        ? '[direct]'
        : effectiveUpstream
          ? '[proxy]'
          : '[direct]';
      logger.info(`→ ${routeInfo} ${hostname}:${port}`);

      return {
        requestAuthentication: false,
        upstreamProxyUrl: effectiveUpstream,
      };
    },
  });
  let stopPromise: Promise<void> | undefined;
  const stop = () => {
    stopPromise ??= stopProxyServer(server, logger);
    return stopPromise;
  };

  signal.addEventListener(
    'abort',
    () => {
      void stop().then(onStopped);
    },
    { once: true },
  );

  await server.listen();

  if (signal.aborted) {
    await stop();
    throw new Error('Proxy server startup aborted');
  }

  logger.info(`✓ Proxy server listening on ${host}:${port}`);

  return server;
}

/**
 * Stop the proxy server gracefully
 */
async function stopProxyServer(server: Server, logger: Logger): Promise<void> {
  logger.info('Stopping proxy server...');
  await server.close(true);
  logger.info('✓ Proxy server stopped');
}
