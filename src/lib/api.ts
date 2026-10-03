import { clientContext,rememberClientShop } from './client-context';
import { createClient } from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;

type AuthSpace='platform'|'owner'|'staff'|'client'|'main';

function currentAuthSpace():AuthSpace{
 if(typeof window==='undefined')return 'main';
 const path=window.location.pathname;
 const params=new URLSearchParams(window.location.search);
 const audience=params.get('audience');
 const shop=clientContext(path,window.location.search);
 if(shop){rememberClientShop(shop);return 'client';}
 if(path.startsWith('/platform')||path==='/acesso/plataforma'||audience==='platform')return 'platform';
 if(path.startsWith('/owner')||path==='/acesso/gestao'||audience==='owner')return 'owner';
 if(path.startsWith('/barber')||path==='/acesso/equipe'||audience==='staff')return 'staff';
 if(path.startsWith('/client')||audience==='client')return 'client';
 return 'owner';
}

const authSpace=currentAuthSpace();
const storageKey=`fio-auth-${authSpace}-v1`;
const rememberKey=`fio-remember-${authSpace}-v1`;

function rememberEnabled(){return typeof window==='undefined'||localStorage.getItem(rememberKey)!=='0';}
const sessionStorageAdapter={
 getItem(keyName:string){if(typeof window==='undefined')return null;return localStorage.getItem(keyName)??sessionStorage.getItem(keyName);},
 setItem(keyName:string,value:string){if(typeof window==='undefined')return;if(rememberEnabled()){localStorage.setItem(keyName,value);sessionStorage.removeItem(keyName);}else{sessionStorage.setItem(keyName,value);localStorage.removeItem(keyName);}},
 removeItem(keyName:string){if(typeof window==='undefined')return;localStorage.removeItem(keyName);sessionStorage.removeItem(keyName);}
};

export function setRememberSession(remember:boolean){
 if(typeof window==='undefined')return;
 localStorage.setItem(rememberKey,remember?'1':'0');
 if(!remember){const existing=localStorage.getItem(storageKey);if(existing)sessionStorage.setItem(storageKey,existing);localStorage.removeItem(storageKey);}
 else {const existing=sessionStorage.getItem(storageKey);if(existing)localStorage.setItem(storageKey,existing);sessionStorage.removeItem(storageKey);}
}
export function getRememberSession(){return rememberEnabled();}

// Cada PWA usa a própria sessão no mesmo domínio. O usuário também pode escolher
// se ela deve sobreviver ao fechamento do navegador ou ficar apenas na sessão atual.
export const supabase=url&&key?createClient(url,key,{auth:{
 persistSession:true,
 autoRefreshToken:true,
 detectSessionInUrl:true,
 storage:sessionStorageAdapter,
 storageKey
}}):null;

export class RequestError extends Error { constructor(public code:string,message:string){super(message);} }
// Concurrent 401s share one refresh, never a retry loop.
let refreshInFlight:Promise<string|null>|null=null;
async function renewedToken(rejectedToken:string){
 if(!supabase)return null;
 const {data:{session}}=await supabase.auth.getSession();
 if(session?.access_token&&session.access_token!==rejectedToken)return session.access_token;
 if(!refreshInFlight){
  refreshInFlight=supabase.auth.refreshSession().then(({data,error})=>{
   if(error)throw error;
   return data.session?.access_token??null;
  }).finally(()=>{refreshInFlight=null;});
 }
 return refreshInFlight;
}
export async function api<T>(path:string,shopId?:string,body?:unknown,method?:string):Promise<T> {
 if(!supabase) throw new RequestError('SETUP_REQUIRED','A conexão com a barbearia ainda não está configurada.');
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new RequestError('AUTH_REQUIRED','Entre para continuar.');
 const send=async(token:string)=>{
  try{return await fetch(`/api${path}`,{method:method??(body?'POST':'GET'),headers:{Authorization:`Bearer ${token}`,...(shopId?{'X-Barbershop-Id':shopId}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(40000)});}
  catch{throw new RequestError('OFFLINE','Não foi possível conectar. Confira sua conexão e tente novamente.');}
 };
 let response=await send(session.access_token);
 let data=await response.json().catch(()=>({code:'INVALID_RESPONSE',message:'Não foi possível concluir agora. Tente novamente.'}));
 // Only authentication rejection before the handler may replay a request.
 if(response.status===401&&data.code==='AUTH_REQUIRED'){
  let token:string|null=null;
  try{token=await renewedToken(session.access_token);}catch(e){
   const status=(e as {status?:number}).status;
   if(!status||status>=500)throw new RequestError('OFFLINE','Não foi possível renovar sua conexão. Tente novamente.');
  }
  if(token){response=await send(token);data=await response.json().catch(()=>({code:'INVALID_RESPONSE'}));}
  if(!token||(response.status===401&&data.code==='AUTH_REQUIRED')){
   // End local UI polling and require a fresh login without revoking other devices.
   await supabase.auth.signOut({scope:'local'});
   throw new RequestError('AUTH_REQUIRED','Sua sessão expirou. Entre novamente.');
  }
 }
 if(!response.ok)throw new RequestError(String(data.code??'REQUEST_FAILED'),String(data.message??'Não foi possível concluir agora. Tente novamente.'));
 return data as T;
}
