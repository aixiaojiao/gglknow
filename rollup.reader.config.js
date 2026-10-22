import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
export default { input: 'src/reader/index.ts', output: { file: 'dist/reader.js', format: 'iife' }, plugins: [nodeResolve({ browser: true }), commonjs(), typescript({ tsconfig: './tsconfig.json', noEmit: false, allowImportingTsExtensions: false })] };
