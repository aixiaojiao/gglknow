import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

export default defineConfig({
  input: 'src/background/index.ts',
  output: {
    file: 'dist/background/index.js',
    format: 'iife',
    name: 'BackgroundScript'
  },
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
      noEmit: false,
      allowImportingTsExtensions: false
    })
  ]
}); 