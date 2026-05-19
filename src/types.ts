/**
 * Type definitions and validation schemas
 */

import { z } from 'zod';

/**
 * Supported upstream proxy types
 */
export type ProxyType = 'direct' | 'http' | 'socks5';

/**
 * Schema for listen address
 */
export const ListenAddressSchema = z
  .string()
  .regex(
    /^(\d{1,5}|[\d.]+:\d{1,5})$/,
    'Listen address must be PORT or HOST:PORT format',
  );

/**
 * Schema for upstream server URI
 */
export const UpstreamServerSchema = z
  .string()
  .regex(
    /^(direct|https?:\/\/.+|socks5:\/\/.+)$/,
    'Upstream server must be direct, http://..., or socks5://...',
  );

/**
 * Configuration for the proxy server
 */
export interface ProxyConfig {
  /** Listen address (e.g., "3080" or "0.0.0.0:3080") */
  listen: string;
  /** Upstream server URI (e.g., "direct", "http://127.0.0.1:4080", "socks5://127.0.0.1:1080") */
  upstream: string;
  /** Path to direct file with domains to bypass proxy (optional) */
  directFile?: string;
}

/**
 * Parsed listen address
 */
export interface ParsedListen {
  host: string;
  port: number;
}

/**
 * Parse listen address string into host and port
 */
export function parseListenAddress(listen: string): ParsedListen {
  if (listen.includes(':')) {
    const [host, portStr] = listen.split(':');
    const port = parseInt(portStr!, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port number: ${portStr}`);
    }
    return { host: host!, port };
  } else {
    const port = parseInt(listen, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port number: ${listen}`);
    }
    return { host: '0.0.0.0', port };
  }
}
