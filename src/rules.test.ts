import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'bun:test';
import { createRulesMatcher, parseRulesFile } from './rules.ts';

describe('parseRulesFile', () => {
  it('throws when the rules file does not exist', () => {
    expect(() => parseRulesFile('/tmp/pproxy-ts-missing-rules-file')).toThrow(
      'Rules file does not exist: /tmp/pproxy-ts-missing-rules-file',
    );
  });

  it('parses existing direct files', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pproxy-ts-'));
    const directFile = join(tempDir, 'direct');

    try {
      writeFileSync(
        directFile,
        'example.com\n*.example.com\n+.example.org\n*contains*\nprefix*\n*suffix\n# ignore\n',
      );

      expect(parseRulesFile(directFile)).toEqual([
        { type: 'exact', value: 'example.com' },
        { type: 'ends-with', value: '.example.com' },
        { type: 'domain', value: 'example.org' },
        { type: 'contains', value: 'contains' },
        { type: 'starts-with', value: 'prefix' },
        { type: 'ends-with', value: 'suffix' },
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('distinguishes subdomains from domain and subdomains', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pproxy-ts-'));
    const subdomainsFile = join(tempDir, 'subdomains');
    const domainFile = join(tempDir, 'domain');

    try {
      writeFileSync(subdomainsFile, '*.example.com\n');
      writeFileSync(domainFile, '+.example.com\n');
      const subdomainsMatcher = createRulesMatcher(subdomainsFile);
      const domainMatcher = createRulesMatcher(domainFile);

      expect(subdomainsMatcher('sub.example.com')).toBe(true);
      expect(subdomainsMatcher('deep.sub.example.com')).toBe(true);
      expect(subdomainsMatcher('example.com')).toBe(false);
      expect(subdomainsMatcher('notexample.com')).toBe(false);

      expect(domainMatcher('sub.example.com')).toBe(true);
      expect(domainMatcher('deep.sub.example.com')).toBe(true);
      expect(domainMatcher('example.com')).toBe(true);
      expect(domainMatcher('notexample.com')).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('createRulesMatcher', () => {
  it('reloads rules when the file changes', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pproxy-ts-'));
    const directFile = join(tempDir, 'direct');

    try {
      writeFileSync(directFile, 'first.example.com\n');
      const matcher = createRulesMatcher(directFile);

      expect(matcher('first.example.com')).toBe(true);
      expect(matcher('second.example.com')).toBe(false);

      writeFileSync(directFile, 'second.example.com\n');

      expect(matcher('first.example.com')).toBe(false);
      expect(matcher('second.example.com')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
