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
  )
  .refine((listen) => {
    const portText = listen.includes(':') ? listen.split(':')[1] : listen;
    const port = Number(portText);
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }, 'Listen port must be between 1 and 65535');

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
 * Schema for byte size values such as 1024, 512K, or 6M
 */
export const ByteSizeSchema = z
  .string()
  .regex(
    /^\d+(?:\.\d+)?[KMGT]?$/i,
    'Byte size must be a positive number with optional K, M, G, or T suffix',
  )
  .transform((value) => {
    const match = /^(\d+(?:\.\d+)?)([KMGT]?)$/i.exec(value)!;
    const number = Number(match[1]);
    const suffix = match[2]?.toUpperCase() ?? '';
    const multiplier =
      suffix === 'K'
        ? 1024
        : suffix === 'M'
          ? 1024 ** 2
          : suffix === 'G'
            ? 1024 ** 3
            : suffix === 'T'
              ? 1024 ** 4
              : 1;

    return Math.floor(number * multiplier);
  })
  .refine((value) => value > 0, 'Byte size must be greater than 0');

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
  /** Path to block file with domains to reject (optional) */
  blockFile?: string;
  /** Maximum bytes per second used to scale the usage graph */
  peakBytes: number;
  /** Whether to show the live usage footer */
  showFooter: boolean;
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
