/**
 * Hostname rule parsing and matching
 */

import { readFileSync, existsSync, statSync } from 'fs';

export type Rule =
  | { type: 'exact'; value: string }
  | { type: 'domain'; value: string }
  | { type: 'starts-with'; value: string }
  | { type: 'ends-with'; value: string }
  | { type: 'contains'; value: string };

/**
 * Parse a single line into a structured rule
 */
export function parseRule(line: string): Rule | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const startsWithWildcard = trimmed.startsWith('*');
  const startsWithDotWildcard = trimmed.startsWith('+.');
  const endsWithWildcard = trimmed.endsWith('*');
  const value = trimmed
    .slice(
      startsWithDotWildcard ? 2 : startsWithWildcard ? 1 : 0,
      endsWithWildcard ? -1 : undefined,
    )
    .toLowerCase();

  if (startsWithWildcard && endsWithWildcard) {
    return { type: 'contains', value };
  }

  if (startsWithDotWildcard) {
    return { type: 'domain', value };
  }

  if (startsWithWildcard) {
    return { type: 'ends-with', value };
  }

  if (endsWithWildcard) {
    return { type: 'starts-with', value };
  }

  return { type: 'exact', value };
}

/**
 * Parse a rules file
 */
export function parseRulesFile(filePath: string): Rule[] {
  if (!existsSync(filePath)) {
    throw new Error(`Rules file does not exist: ${filePath}`);
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const rules: Rule[] = [];

    for (const line of lines) {
      const rule = parseRule(line);
      if (rule !== null) {
        rules.push(rule);
      }
    }

    return rules;
  } catch (error) {
    throw new Error(
      `Failed to read rules file ${filePath}: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

/**
 * Check if a hostname matches a rule
 */
export function matchesRule(hostname: string, rule: Rule): boolean {
  const lowerHostname = hostname.toLowerCase();

  switch (rule.type) {
    case 'exact':
      return lowerHostname === rule.value;
    case 'starts-with':
      return lowerHostname.startsWith(rule.value);
    case 'ends-with':
      return lowerHostname.endsWith(rule.value);
    case 'contains':
      return lowerHostname.includes(rule.value);
    case 'domain':
      return (
        lowerHostname === rule.value || lowerHostname.endsWith(`.${rule.value}`)
      );
    default:
      return false;
  }
}

/**
 * Check if a hostname matches any rule
 */
export function matchesRules(hostname: string, rules: Rule[]): boolean {
  for (const rule of rules) {
    if (matchesRule(hostname, rule)) {
      return true;
    }
  }
  return false;
}

/**
 * Create a matcher that reloads rules when the file changes
 */
export function createRulesMatcher(
  filePath: string,
): (hostname: string) => boolean {
  let fileStats = statSync(filePath);
  let rules = parseRulesFile(filePath);

  return (hostname: string) => {
    const currentStats = statSync(filePath);
    if (
      currentStats.mtimeMs !== fileStats.mtimeMs ||
      currentStats.ctimeMs !== fileStats.ctimeMs ||
      currentStats.size !== fileStats.size ||
      currentStats.ino !== fileStats.ino
    ) {
      rules = parseRulesFile(filePath);
      fileStats = currentStats;
    }

    return matchesRules(hostname, rules);
  };
}
