import { describe,it,expect,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { createApp } from '../server/app';
import { assistantSchema,bookingSchema,actionSchema,allowedActions } from '../shared/domain';
import { assistantContext } from '../server/context';
import { demoData } from '../src/lib/demo';
describe('limites da API',()=>{
 it('nega acesso sem Bearer token em todas as operações protegidas',async()=>{const app=createApp();for(const path of ['/bootstrap','/memberships','/conversations'])expect((await request(app).get(`/api${path}`)).status).toBe(401);for(const path of ['/assistant','/appointments','/services','/payments','/invitations','/onboarding'])expect((await request(app).post(`/api${path}`).send({})).status).toBe(401);});
 it('health não revela configuração ou segredos',async()=>{const r=await request(createApp()).get('/api/health');expect(r.status).toBe(200);expect(r.body).toEqual({status:'ok'});expect(r.headers['cache-control']).toContain('no-store');expect(r.headers['x-request-id']).toBeTruthy();});
 it('limita consultas públicas repetidas por origem',async()=>{const app=createApp();for(let i=0;i<30;i++)await request(app).get('/api/public/manifest/loja-teste');const r=await request(app).get('/api/public/manifest/loja-teste');expect(r.status).toBe(429);expect(r.headers['retry-after']).toBeTruthy();});
 it('token enviado é validado com Auth e um JWT forjado é negado',async()=>{
  vi.stubEnv('SUPABASE_URL','https://test.supabase.co');vi.stubEnv('SUPABASE_ANON_KEY','public-test-key');
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'Invalid JWT',code:'bad_jwt'}),{status:401,headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetchMock);
  try{const r=await request(createApp()).get('/api/bootstrap').set('Authorization','Bearer forged.jwt.token');expect(r.status).toBe(401);expect(fetchMock).toHaveBeenCalled();}finally{vi.unstubAllGlobals();vi.unstubAllEnvs();}
 });
 it('rotas administrativas recusam BARBER antes de qualquer mutação',async()=>{
  const member=demoData('BARBER').membership;
  const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:member,error:null})};
  const db={from:()=>chain} as unknown as SupabaseClient;
  const app=createApp(async()=>({db,userId:member.user_id}));
  expect((await request(app).post('/api/payments').set('X-Barbershop-Id',member.barbershop_id).send({})).status).toBe(404);
  for(const path of ['/services','/customers','/invitations','/subscriptions']){const r=await request(app).post(`/api${path}`).set('X-Barbershop-Id',member.barbershop_id).send({});expect(r.status).toBe(403);}
 });
 it('CLIENT não consegue publicar no feed pela API',async()=>{const member=demoData('CLIENT').membership;const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:member,error:null})};const db={from:()=>chain} as unknown as SupabaseClient;const app=createApp(async()=>({db,userId:member.user_id}));const r=await request(app).post('/api/posts').set('X-Barbershop-Id',member.barbershop_id).send({caption:'fraude',imagePath:`${member.barbershop_id}/${member.user_id}/x.jpg`});expect(r.status).toBe(403);});
 it('rejeita injeção de role, tenant e preços nos contratos',()=>{expect(assistantSchema.safeParse({message:'oi',role:'OWNER',barbershop_id:'foreign'}).success).toBe(false);expect(bookingSchema.safeParse({serviceId:crypto.randomUUID(),clientId:crypto.randomUUID(),barberId:crypto.randomUUID(),startsAt:new Date().toISOString(),price_cents:1}).success).toBe(false);});
 it('mensagens vazias e payloads extensos são rejeitados',()=>{expect(assistantSchema.safeParse({message:'  '}).success).toBe(false);expect(assistantSchema.safeParse({message:'x'.repeat(2001)}).success).toBe(false);});
 it('não há ações destrutivas no contrato da IA',()=>{for(const type of ['cancel','charge','renew','delete','disable'])expect(actionSchema.safeParse({type,label:'Executar'}).success).toBe(false);expect(allowedActions.BARBER).not.toContain('open_report');expect(allowedActions.CLIENT).not.toContain('open_clients');});
 it('contexto BARBER não contém faturamento, assinaturas ou IDs privados',()=>{const context=assistantContext(demoData('BARBER'));expect(context).not.toHaveProperty('received_this_week_cents');expect(context).not.toHaveProperty('subscriptions');expect(JSON.stringify(context)).not.toContain('user_id');expect(JSON.stringify(context)).not.toContain('barbershop_id');});
 it('contexto CLIENT contém apenas sua agenda e assinatura',()=>{const d=demoData('CLIENT'),context=assistantContext(d);expect(context.appointments).toHaveLength(1);expect(context).not.toHaveProperty('customers');expect(context).not.toHaveProperty('received_this_week_cents');expect(context).toHaveProperty('subscriptions');});
});
