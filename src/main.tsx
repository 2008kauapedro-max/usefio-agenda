import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { I18nProvider } from './i18n';
import './styles.css';

if(import.meta.env.PROD&&'serviceWorker' in navigator){
 const hadController=Boolean(navigator.serviceWorker.controller);
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/sw.js').then(registration=>{
   void registration.update();
   let reloaded=false;
   navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(hadController&&!reloaded){reloaded=true;window.location.reload();}
   });
  }).catch(()=>undefined);
 });
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider><BrowserRouter><App/></BrowserRouter></I18nProvider></React.StrictMode>);

