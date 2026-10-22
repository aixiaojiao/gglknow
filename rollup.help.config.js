import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
export default { input: 'src/help/index.ts', output: { file: 'dist/help.js', format: 'iife' }, plugins: [nodeResolve({browser:true}), typescript({tsconfig:'./tsconfig.json', noEmit:false, allowImportingTsExtensions:false})] };
