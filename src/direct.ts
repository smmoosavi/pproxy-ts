/**
 * Direct proxy bypass list module
 * Handles parsing and matching of domains that should bypass the proxy
 */

import { readFileSync, existsSync } from 'fs';
import { z } from 'zod';

/**
 * Pattern types for direct matching
 */
export type PatternType =
  | { type: 'exact'; domain: string }
  | { type: 'wildcard-subdomain'; domain: string }
  | { type: 'wildcard-tld'; tld: string }
  | { type: 'partial'; keyword: string };

/**
 * Schema for validating a pattern line
 */
const PatternLineSchema = z.string().trim().min(1);

/**
 * Parse a single pattern line into a structured pattern
 */
export function parsePattern(line: string): PatternType | null {
  const trimmed = line.trim();

  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  // Wildcard subdomain: *.example.com
  if (trimmed.startsWith('*.') && trimmed.includes('.')) {
    const domain = trimmed.slice(2); // Remove '*.'
    return { type: 'wildcard-subdomain', domain };
  }

  // Wildcard TLD: *.net
  if (trimmed.startsWith('*.') && !trimmed.slice(2).includes('.')) {
    const tld = trimmed.slice(2); // Remove '*.'
    return { type: 'wildcard-tld', tld };
  }

  // Check if it's a valid domain format (contains at least one dot)
  if (trimmed.includes('.')) {
    return { type: 'exact', domain: trimmed };
  }

  // Otherwise, it's a partial match keyword
  return { type: 'partial', keyword: trimmed };
}

/**
 * Parse the entire direct file into an array of patterns
 */
export function parseDirectFile(filePath: string): PatternType[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const patterns: PatternType[] = [];

    for (const line of lines) {
      const pattern = parsePattern(line);
      if (pattern !== null) {
        patterns.push(pattern);
      }
    }

    return patterns;
  } catch (error) {
    throw new Error(
      `Failed to read direct file ${filePath}: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

/**
 * Check if a hostname matches a specific pattern
 */
export function matchesPattern(
  hostname: string,
  pattern: PatternType,
): boolean {
  const lowerHostname = hostname.toLowerCase();

  switch (pattern.type) {
    case 'exact':
      // Exact domain match
      return lowerHostname === pattern.domain.toLowerCase();

    case 'wildcard-subdomain':
      // Matches any subdomain of the specified domain
      // e.g., *.example.com matches foo.example.com, bar.example.com
      const lowerDomain = pattern.domain.toLowerCase();
      return (
        lowerHostname === lowerDomain ||
        lowerHostname.endsWith('.' + lowerDomain)
      );

    case 'wildcard-tld':
      // Matches any domain with the specified TLD
      // e.g., *.net matches foo.net, bar.baz.net
      const lowerTld = pattern.tld.toLowerCase();
      return lowerHostname.endsWith('.' + lowerTld);

    case 'partial':
      // Partial keyword match anywhere in hostname
      // e.g., "localhost" matches localhost, "foobar" matches foobar
      return lowerHostname.includes(pattern.keyword.toLowerCase());

    default:
      return false;
  }
}

/**
 * Check if a hostname should be sent direct (bypass proxy)
 */
export function shouldSendDirect(
  hostname: string,
  patterns: PatternType[],
): boolean {
  for (const pattern of patterns) {
    if (matchesPattern(hostname, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Load and create a direct matcher function
 */
export function createDirectMatcher(
  filePath: string,
): (hostname: string) => boolean {
  const patterns = parseDirectFile(filePath);
  return (hostname: string) => shouldSendDirect(hostname, patterns);
}
