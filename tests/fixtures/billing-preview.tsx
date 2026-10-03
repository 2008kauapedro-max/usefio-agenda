import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FioPlans} from '../../src/pages/FioPlans';
import {I18nProvider} from '../../src/i18n';
import {demoData} from '../../src/lib/demo';
import '../../src/styles.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
localStorage.setItem('fio:locale','pt-BR');
localStorage.setItem('fio:region','BR');
localStorage.setItem('fio:currency','BRL');
document.documentElement.lang='pt-BR';
const params=new URLSearchParams(location.search);
document.documentElement.dataset.theme=params.get('theme')??'dark';
function Fixture(){
 const [data,setData]=useState(()=>{
  const value=demoData('OWNER');value.plan='FREE';value.fioSubscription={plan:'FREE',status:'active'};
  if(params.get('scenario')==='trial'){value.plan='PRO';value.fioSubscription={plan:'PRO',status:'trialing',trial_ends_at:new Date(Date.now()+86400000).toISOString()};}
  return value;
 });
 const [notice,setNotice]=useState('');
 return <main style={{maxWidth:1200,margin:'auto',padding:24}}><p>TESTE LOCAL · SEM COBRANÇAS REAIS</p><FioPlans data={data} demo={false} base="/owner" refresh={async()=>{}} notify={setNotice} updateDemo={setData}/>{notice&&<p role="status">{notice}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><Fixture/></I18nProvider>);
