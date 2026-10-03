import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({envDir:false,resolve:{alias:[{find:/^\.\.?\/lib\/api$/,replacement:resolve('tests/fixtures/experience-api.ts')}]},server:{host:'127.0.0.1',port:4186,strictPort:true},plugins:[{name:'fixture',configureServer(server){server.middlewares.use((req,_res,next)=>{if(req.url?.split('?')[0].match(/^\/(owner|barber|client|login|reset-password|confirm-email|b)(\/|$)/))req.url='/tests/fixtures/experience-preview.html';next();});}}]});

