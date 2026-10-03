// Optional compatibility path for restricted Windows hosts that deny child-process pipes.
// Uses esbuild's official WebAssembly implementation in the current process.
import {createRequire,registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
globalThis.self=globalThis;
export const wasm=require('esbuild-wasm/lib/browser.js');
await wasm.initialize({wasmModule:await WebAssembly.compile(readFileSync(require.resolve('esbuild-wasm/esbuild.wasm'))),worker:false});
registerHooks({resolve(specifier,context,next){return next(specifier==='esbuild'?new URL('./wasm-adapter.mjs',import.meta.url).href:specifier,context);}});
