import { build } from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
await build({
  configFile: false,
  plugins: [react()],
  resolve: {
    alias: {
      'next/link': path.resolve('frontend/next-link.tsx'),
      'next/navigation': path.resolve('frontend/next-navigation.ts'),
    },
  },
  build: { outDir: 'dist/client' },
});
// Vite SSR bundle keeps Node dependencies external and replaces Cloudflare adapters at source.
await build({
  configFile: false,
  publicDir: false,
  build: {
    ssr: 'server/api-entry.ts',
    outDir: 'dist/api',
    rollupOptions: { output: { entryFileNames: 'api.mjs' } },
  },
});
await mkdir('dist/shared', { recursive: true });
await writeFile(
  'dist/shared/domain.mjs',
  ts.transpileModule(await readFile('lib/domain.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);
