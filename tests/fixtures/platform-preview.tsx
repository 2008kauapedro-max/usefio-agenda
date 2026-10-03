// Isolated browser fixture: never imported by the production entry point.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PlatformApp,PlatformLogin } from '../../src/pages/Platform';
import {PublicPortal} from '../../src/pages/PublicPortal';
import '../../src/styles.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
const session={user:{id:'10000000-0000-4000-8000-000000000099'}} as Parameters<typeof PlatformApp>[0]['session'];
if(location.pathname.startsWith('/b/')){
 const testBrowser=new URLSearchParams(location.search).get('fixture-browser');
 if(testBrowser==='instagram')Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 14) Chrome/122 Instagram 320',configurable:true});
 const original=window.fetch;
 window.fetch=async(input,init)=>String(input).startsWith('/api/public/shop/')?new Response(JSON.stringify({shop:{id:'test',name:'Studio de Teste',slug:'studio-teste'},services:[{id:'service',name:'Corte',duration_minutes:30,price_cents:3500}],team:[]})):original(input,init);
}
createRoot(document.getElementById('root')!).render(<BrowserRouter>{location.pathname.startsWith('/b/')?<PublicPortal/>:location.pathname==='/acesso/plataforma'?<PlatformLogin session={null} ready/>:<PlatformApp session={session} ready/>}</BrowserRouter>);

