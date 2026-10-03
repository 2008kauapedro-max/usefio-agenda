import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({
 envDir:false,
 optimizeDeps:{entries:['tests/fixtures/billing-preview.html','tests/fixtures/scheduling-preview.html']},
 resolve:{alias:{'../lib/api':resolve('tests/fixtures/billing-api.ts')}},
 server:{host:'127.0.0.1',port:4182,strictPort:true},
});
