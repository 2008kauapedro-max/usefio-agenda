import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Scissors} from 'lucide-react';
import {useI18n} from '../i18n';
export function ShopIdentity({slug}:{slug:string}){
 const {t}=useI18n();
 const [shop,setShop]=useState<{name:string;public_title?:string;logo_url?:string}|null>(null);
 useEffect(()=>{
  const controller=new AbortController();let active=true;setShop(null);
  fetch(`/api/public/shop/${encodeURIComponent(slug)}`,{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error();return r.json();})
   .then(data=>{if(active)setShop(data.shop);}).catch(()=>undefined);
  return()=>{active=false;controller.abort();};
 },[slug]);
 return <Link className="client-auth-brand" to={`/${encodeURIComponent(slug)}`}>
  {shop?.logo_url?<img src={shop.logo_url} alt=""/>:<Scissors aria-hidden="true"/>}
  <span><strong>{shop?.public_title||shop?.name||t('shopIdentity.default')}</strong><small>{t('shopIdentity.clientArea')}</small></span>
 </Link>;
}
