import { defineConfig } from 'vitest/config';
export default defineConfig({resolve:{preserveSymlinks:true},test:{include:['tests/*.test.ts'],pool:'threads',maxWorkers:1,fileParallelism:false,testTimeout:15000,hookTimeout:60000}});
