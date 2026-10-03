// Browser fixture: never connects to a real account or auth provider.
const listeners=new Set<(event:string,session:unknown)=>void>();
const session=()=>sessionStorage.getItem('test-signed-in')?{access_token:'fixture-token',user:{id:'client-test',email:'client@example.test',created_at:'2020-01-01',app_metadata:{}}}:null;
export function createClient(){return {auth:{
 getSession:async()=>({data:{session:session()}}),
 getUser:async()=>({data:{user:session()?.user}}),
 onAuthStateChange:(fn:(event:string,s:unknown)=>void)=>{listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};},
 signInWithPassword:async()=>{sessionStorage.setItem('test-signed-in','1');listeners.forEach(fn=>fn('SIGNED_IN',session()));return {data:{session:session()},error:null};},
 signInWithOAuth:async(options:unknown)=>{sessionStorage.setItem('test-oauth',JSON.stringify(options));return {error:null};},
 signUp:async(options:unknown)=>{sessionStorage.setItem('test-signup',JSON.stringify(options));return {data:{user:{id:'new-client',identities:[{}]},session:null},error:null};},
 signOut:async()=>{sessionStorage.removeItem('test-signed-in');listeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null};},
 refreshSession:async()=>({data:{session:session()},error:null})
}};}
