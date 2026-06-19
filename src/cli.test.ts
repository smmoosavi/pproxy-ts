import { describe, expect, it } from 'bun:test';
import { parseCliArgs } from './cli.ts';

describe('parseCliArgs', () => {
  it('accepts valid listen ports', () => {
    expect(
      parseCliArgs(['node', 'pproxy-ts', '--listen', '65535']),
    ).toMatchObject({
      listen: '65535',
    });

    expect(
      parseCliArgs(['node', 'pproxy-ts', '--listen', '127.0.0.1:3099']),
    ).toMatchObject({
      listen: '127.0.0.1:3099',
    });
  });

  it('rejects out-of-range listen ports', () => {
    expect(() => parseCliArgs(['node', 'pproxy-ts', '--listen', '0'])).toThrow(
      'Invalid listen address: 0',
    );

    expect(() =>
      parseCliArgs(['node', 'pproxy-ts', '--listen', '127.0.0.1:99999']),
    ).toThrow('Invalid listen address: 127.0.0.1:99999');
  });
});
