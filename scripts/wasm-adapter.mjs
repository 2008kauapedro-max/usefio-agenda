import {wasm} from './wasm-esbuild.mjs';
export const {transform,transformSync,build,buildSync,initialize,stop,context,formatMessages,formatMessagesSync,analyzeMetafile,analyzeMetafileSync,version}=wasm;
export default wasm;
