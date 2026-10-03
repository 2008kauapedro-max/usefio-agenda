import {fileURLToPath} from 'node:url';
import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',testMatch:['billing.spec.ts','scheduling.spec.ts'],workers:1,reporter:'list',
 use:{baseURL:'http://127.0.0.1:4182',screenshot:'only-on-failure',launchOptions:process.env.FIO_BROWSER_EXECUTABLE_PATH?{executablePath:process.env.FIO_BROWSER_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:process.env.FIO_BROWSER_CHANNEL?{channel:process.env.FIO_BROWSER_CHANNEL}:{}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:{cwd:fileURLToPath(new URL('../',import.meta.url)),command:'node node_modules/vite/bin/vite.js --config tests/fixtures/billing-vite.config.ts',url:'http://127.0.0.1:4182/tests/fixtures/billing-preview.html',reuseExistingServer:!process.env.CI,timeout:60000},
});
