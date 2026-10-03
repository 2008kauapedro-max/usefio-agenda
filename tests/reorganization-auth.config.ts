import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'client-access.spec.ts',workers:1,reporter:'list',outputDir:'work/auth-results',use:{baseURL:'http://127.0.0.1:4184',channel:'msedge'},projects:[360,390,430,1440].map(width=>({name:`${width}`,use:{viewport:{width,height:width===1440?1000:844}}}))});
