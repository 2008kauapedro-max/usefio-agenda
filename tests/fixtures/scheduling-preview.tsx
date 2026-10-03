import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {Dashboard,Agenda,Subscriptions} from '../../src/pages/Workspace';
import {I18nProvider} from '../../src/i18n';
import {demoData} from '../../src/lib/demo';
import type {Role} from '../../shared/domain';
import '../../src/styles.css';
localStorage.setItem('fio:locale','pt-BR');
localStorage.setItem('fio:region','BR');
localStorage.setItem('fio:currency','BRL');
document.documentElement.lang='pt-BR';
function makeFixtureData(role:Role){
 const data=demoData(role);
 const index=data.appointments.findIndex(a=>['scheduled','confirmed','in_service'].includes(a.status));
 if(index>=0){
  const current=data.appointments[index];
  const start=new Date(Date.now()+60*60*1000);
  start.setMinutes(0,0,0);
  data.appointments[index]={
   ...current,
   starts_at:start.toISOString(),
   ends_at:new Date(start.getTime()+45*60*1000).toISOString()
  };
 }
 return data;
}
function Fixture(){
 const role=(new URLSearchParams(location.search).get('role')??'OWNER') as Role;
 const [data,setData]=useState(()=>makeFixtureData(role));
 const [notice,setNotice]=useState('');
 const props={data,demo:true,base:'/owner',refresh:async()=>{},notify:setNotice,updateDemo:setData};
 return <MemoryRouter initialEntries={['/owner']}><main style={{maxWidth:900,margin:'auto',padding:20}}><Routes><Route path="/owner" element={<Dashboard {...props}/>}/><Route path="/owner/agenda" element={<Agenda {...props}/>}/><Route path="/owner/assinaturas" element={<Subscriptions {...props}/>}/></Routes>{notice&&<p role="status">{notice}</p>}</main></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><Fixture/></I18nProvider>);
