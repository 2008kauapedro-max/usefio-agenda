import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const auth=vi.hoisted(()=>({getSession:vi.fn(),refreshSession:vi.fn(),signOut:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth})}));
let memory:Map<string,string>;
beforeEach(()=>{
 vi.resetModules();vi.clearAllMocks();
 vi.stubEnv('VITE_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('VITE_SUPABASE_ANON_KEY','test-public');
 memory=new Map();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)});
 auth.getSession.mockResolvedValue({data:{session:{access_token:'old-token'}}});auth.signOut.mockResolvedValue({error:null});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const response=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
describe('client navigation context',()=>{
 it('recognizes old shop-only links and retains shop across client routes',async()=>{
  const {clientContext,rememberClientShop}=await import('../src/lib/client-context');
  expect(clientContext('/login','?shop=barbearia-a')).toBe('barbearia-a');rememberClientShop('barbearia-a');
  expect(clientContext('/client/agenda','')).toBe('barbearia-a');
  expect(clientContext('/login','?audience=owner')).toBe('');
  expect(clientContext('/owner','?shop=barbearia-a')).toBe('');
  expect(clientContext('/login','?audience=client&shop=barbearia-b')).toBe('barbearia-b');
 });
 it('does not promote client without shop to owner intent',async()=>{
  const {clientContext}=await import('../src/lib/client-context');
  expect(clientContext('/client','')).toBe('');expect(clientContext('/login','?shop=https://evil.test')).toBe('');
 });
});
describe('authenticated requests',()=>{
 it('refreshes rejected token once and replays identical shop/body',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(response(401,{code:'AUTH_REQUIRED'})).mockResolvedValueOnce(response(200,{message:'OK'}));vi.stubGlobal('fetch',fetcher);
  auth.refreshSession.mockResolvedValue({data:{session:{access_token:'fresh-token'}},error:null});
  const {api}=await import('../src/lib/api');expect(await api('/assistant','shop-a',{text:'Olá'})).toEqual({message:'OK'});
  expect(auth.refreshSession).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][1]).toMatchObject({headers:{Authorization:'Bearer fresh-token','X-Barbershop-Id':'shop-a'},body:JSON.stringify({text:'Olá'})});expect(auth.signOut).not.toHaveBeenCalled();
 });
 it('ends expired session when refresh is rejected and never loops',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(401,{code:'AUTH_REQUIRED'})));
  auth.refreshSession.mockResolvedValue({data:{session:null},error:{status:400}});
  const {api}=await import('../src/lib/api');await expect(api('/bootstrap','shop')).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(auth.signOut).toHaveBeenCalledWith({scope:'local'});expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('does not log out or replay mutation on network failure',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('network')));
  const {api}=await import('../src/lib/api');await expect(api('/appointments','shop',{})).rejects.toMatchObject({code:'OFFLINE'});expect(auth.signOut).not.toHaveBeenCalled();expect(auth.refreshSession).not.toHaveBeenCalled();
 });
 it('does not replay forbidden or provider failures',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(403,{code:'FORBIDDEN',message:'Denied'})));
  const {api}=await import('../src/lib/api');await expect(api('/assistant','shop',{})).rejects.toMatchObject({code:'FORBIDDEN'});expect(auth.refreshSession).not.toHaveBeenCalled();
 });
 it('shares refresh between concurrent authentication failures',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(_url,options)=>options.headers.Authorization==='Bearer old-token'?response(401,{code:'AUTH_REQUIRED'}):response(200,{ok:true})));
  auth.refreshSession.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({data:{session:{access_token:'fresh-token'}},error:null}),20)));
  const {api}=await import('../src/lib/api');await Promise.all([api('/bootstrap','shop'),api('/assistant','shop',{text:'Olá'})]);expect(auth.refreshSession).toHaveBeenCalledTimes(1);
 });
});
