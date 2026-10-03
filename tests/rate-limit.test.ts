import {afterEach,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import {rateLimit,clientIp} from '../server/rate-limit';
import {createApp} from '../server/app';
afterEach(()=>vi.unstubAllEnvs());
it('does not trust forged forwarding headers outside Vercel',async()=>{
 vi.stubEnv('VERCEL','');const app=express();app.use(rateLimit('test',{windowMs:600000,max:2}));app.get('/',(_q,r)=>r.sendStatus(200));
 expect((await request(app).get('/').set('X-Forwarded-For','1.1.1.1')).status).toBe(200);
 expect((await request(app).get('/').set('X-Forwarded-For','2.2.2.2')).status).toBe(200);
 expect((await request(app).get('/').set('X-Forwarded-For','3.3.3.3')).status).toBe(429);
});
it('trusts the Vercel-provided IP only within that runtime',()=>{
 const req={headers:{'x-vercel-forwarded-for':'1.2.3.4'},socket:{remoteAddress:'::ffff:127.0.0.1'}} as unknown as express.Request;
 vi.stubEnv('VERCEL','');expect(clientIp(req)).toBe('127.0.0.1');
 vi.stubEnv('VERCEL','1');expect(clientIp(req)).toBe('1.2.3.4');
});
it('maps malformed and excessive JSON to safe 400/413 responses',async()=>{
 const app=createApp();
 const bad=await request(app).post('/api/onboarding').set('Content-Type','application/json').send('{broken');expect(bad.status).toBe(400);expect(bad.body.code).toBe('INVALID_JSON');
 const big=await request(app).post('/api/onboarding').send({text:'a'.repeat(14000)});expect(big.status).toBe(413);expect(big.body.code).toBe('PAYLOAD_TOO_LARGE');
});
it('preserves an exact Retry-After and does not cache authentication failures',async()=>{
 const app=createApp();const fail=await request(app).get('/api/memberships');expect(fail.headers['cache-control']).toBe('no-store');
 for(let i=0;i<30;i++)await request(app).get('/api/health');
 const limited=await request(app).get('/api/health');expect(limited.status).toBe(429);expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
});
