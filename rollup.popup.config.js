import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import { defineConfig } from 'rollup';

export default defineConfig({
  input: 'src/popup/index.ts',
  output: {
    file: 'dist/popup-script/index.js',
    format: 'iife',
    name: 'PopupScript'
  },
  plugins: [
    json(),
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