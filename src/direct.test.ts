import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'bun:test';
import { createDirectMatcher, parseDirectFile } from './direct.ts';

describe('parseDirectFile', () => {
  it('throws when the direct file does not exist', () => {
    expect(() => parseDirectFile('/tmp/pproxy-ts-missing-direct-file')).toThrow(
      'Direct file does not exist: /tmp/pproxy-ts-missing-direct-file',
    );
  });

  it('parses existing direct files', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pproxy-ts-'));
    const directFile = join(tempDir, 'direct');

    try {
      writeFileSync(directFile, '# comment\nexample.com\n*.local\nlocalhost\n');

      expect(parseDirectFile(directFile)).toEqual([
        { type: 'exact', domain: 'example.com' },
        { type: 'wildcard-subdomain', domain: 'local' },
        { type: 'partial', keyword: 'localhost' },
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('createDirectMatcher', () => {
  it('reloads patterns when the direct file changes', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pproxy-ts-'));
    const directFile = join(tempDir, 'direct');

    try {
      writeFileSync(directFile, 'first.example.com\n');
      const matcher = createDirectMatcher(directFile);

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
