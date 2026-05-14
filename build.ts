#!/usr/bin/env bun

/**
 * Build script for pproxy-ts
 * Bundles the application into a single executable JavaScript file
 */

import { existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';

const distDir = './dist';
const outputFile = join(distDir, 'pproxy-ts');

// Create dist directory if it doesn't exist
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

console.log('🔨 Building pproxy-ts...');

try {
  // Bundle with Bun
  const result = await Bun.build({
    entrypoints: ['./src/index.ts'],
    outdir: distDir,
    target: 'node',
    format: 'esm',
    minify: false,
    sourcemap: 'none',
    splitting: false,
    naming: {
      entry: 'pproxy-ts',
    },
    external: [],
  });

  if (!result.success) {
    console.error('❌ Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Read the bundled file and add shebang
  const bundledContent = await Bun.file(outputFile).text();

  // Write with shebang
  const finalContent = `#!/usr/bin/env node\n${bundledContent}`;
  await Bun.write(outputFile, finalContent);

  // Make executable
  chmodSync(outputFile, 0o755);

  console.log('✅ Build successful!');
  console.log(`📦 Output: ${outputFile}`);
  console.log('🚀 You can now copy this file to any machine with Node.js');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
