import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'copilot.spec.ts',workers:1,reporter:'list',use:{baseURL:'http://127.0.0.1:4186',launchOptions:{channel:'msedge'},screenshot:'only-on-failure'}});
