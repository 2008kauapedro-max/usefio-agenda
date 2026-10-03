import {afterEach,describe,it,expect,vi} from 'vitest';
import type {TenantContext} from '../server/context';
vi.mock('../server/context',()=>({bootstrap:vi.fn(async()=>({})),assistantContext:()=>({appointments:[]})}));
import {askAssistant} from '../server/assistant';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('falhas reais do contrato do provedor',()=>{
 for(const status of [401,200])it(`não persiste resposta simulada após HTTP ${status}${status===200?' com conteúdo inválido':''}`,async()=>{
  for(const [key,value] of Object.entries({AI_API_URL:'https://provider.example/chat',AI_API_KEY:'test-key',AI_MODEL:'test-model',SUPABASE_SERVICE_ROLE_KEY:'test-service'}))vi.stubEnv(key,value);
  const tables:string[]=[],from=vi.fn((table:string)=>{tables.push(table);const data=table==='saas_subscriptions'?{plan:'PRO',status:'active',expires_at:null}:table==='plan_features'?{ai_enabled:true}:table==='assistant_conversations'?{id:'00000000-0000-4000-8000-000000000001'}:[];const chain:any={select:()=>chain,eq:()=>chain,insert:()=>chain,order:()=>chain,limit:async()=>({data,error:null}),single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null})};return chain;});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[]}),{status})));const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
  const ctx={db:{from,rpc:async()=>({data:null,error:null})},shopId:'shop',userId:'user',member:{role:'CLIENT'}} as unknown as TenantContext;
  await expect(askAssistant(ctx,{message:'Quando é meu próximo agendamento?'})).rejects.toMatchObject({status:503,code:'AI_PROVIDER_UNAVAILABLE'});
  expect(tables.filter(t=>t==='assistant_messages')).toHaveLength(1); // history read only
  expect(warn).toHaveBeenCalledWith('fio.assistant.provider_failed',expect.any(Object));
 });
});
