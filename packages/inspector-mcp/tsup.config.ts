import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'build',
  clean: true,
  splitting: false,
  treeshake: true,
  dts: false,
  sourcemap: true,
  minify: false,
});
