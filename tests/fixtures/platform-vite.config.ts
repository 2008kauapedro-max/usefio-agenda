import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
 envDir:resolve('work/empty-env'),resolve:{preserveSymlinks:true,alias:{'../lib/api':resolve('tests/fixtures/platform-api.ts')}},
 build:{outDir:'work/platform-preview',rollupOptions:{input:resolve('tests/fixtures/platform-preview.html')}},
 server:{host:'127.0.0.1',port:4178,strictPort:true},
 plugins:[{name:'test-only-platform-entry',configureServer(server){server.middlewares.use((req,_res,next)=>{if(req.url?.split('?')[0].match(/^\/(platform(?:\/.*)?|acesso\/plataforma)$/))req.url='/tests/fixtures/platform-preview.html';next();});}}],
});
