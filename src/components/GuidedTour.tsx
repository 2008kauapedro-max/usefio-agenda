import { useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Role } from '../../shared/domain';
import './guided-tour.css';
import {useI18n} from '../i18n';

type Step={target:string;title:string;text:string;route?:string;menu?:boolean};
type Position={top:number;left:number};

export function GuidedTour({userId,shopId,role,base,openMenu}:{userId:string;shopId:string;role:Role;base:string;openMenu:(open:boolean)=>void}){
 const {t}=useI18n();
 const key=`fio-tour:v2:${userId}:${shopId}:${role}`;
 const pendingKey=`fio-tour:new-account:${userId}`;
 const navigate=useNavigate(),dialog=useRef<HTMLDivElement>(null);
 const [index,setIndex]=useState<number|null>(null),[rect,setRect]=useState<DOMRect|null>(null),[position,setPosition]=useState<Position>({top:12,left:12});
 const steps=useMemo<Step[]>(()=>[
  {target:'overview',title:t('tour.overviewTitle'),text:role==='OWNER'?t('tour.overviewOwner'):role==='BARBER'?t('tour.overviewBarber'):t('tour.overviewClient'),route:base},
  {target:'nav-agenda',title:t('tour.agendaTitle'),text:t('tour.agendaText'),menu:true},
  {target:'nav-configuracoes',title:t('tour.settingsTitle'),text:t('tour.settingsText'),menu:true},
  {target:'nav-suporte',title:t('tour.supportTitle'),text:t('tour.supportText'),menu:true},
  {target:'feedback',title:t('tour.feedbackTitle'),text:t('tour.feedbackText'),route:`${base}/suporte`},
  {target:'feedback-message',title:t('tour.messageTitle'),text:t('tour.messageText'),route:`${base}/suporte`},
  {target:'feedback-send',title:t('tour.sendTitle'),text:t('tour.sendText'),route:`${base}/suporte`}
 ],[role,base,t]);

 useEffect(()=>{
  const restart=()=>setIndex(0);
  window.addEventListener('fio-tour-restart',restart);
  try{
   if(localStorage.getItem(pendingKey)==='pending'){
    localStorage.removeItem(pendingKey);
    setIndex(0);
   }
  }catch{}
  return()=>window.removeEventListener('fio-tour-restart',restart);
 },[pendingKey]);

 const step=index===null?null:steps[index];
 useEffect(()=>{
  if(!step)return;
  setRect(null);openMenu(Boolean(step.menu));
  if(step.route)navigate(step.route);
  let scrolled=false;
  const locate=()=>{
   if(step.target==='feedback'&&!document.querySelector('[data-tour="feedback"]'))document.querySelector<HTMLButtonElement>('[data-tour="support-back"]')?.click();
   if(step.target==='feedback-message'&&!document.querySelector('[data-tour="feedback-message"]'))document.querySelector<HTMLButtonElement>('[data-tour="feedback"]')?.click();
   const target=document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
   if(target){
    const r=target.getBoundingClientRect();
    if(r.width&&r.height){
     setRect(current=>current&&Math.abs(current.top-r.top)<1&&Math.abs(current.left-r.left)<1&&Math.abs(current.width-r.width)<1&&Math.abs(current.height-r.height)<1?current:r);
     if(!scrolled){target.scrollIntoView({block:'center',behavior:'instant'});scrolled=true;}
    }
   }
  };
  const timer=window.setInterval(locate,200);locate();dialog.current?.focus();
  return()=>window.clearInterval(timer);
 },[step,navigate,openMenu]);

 useLayoutEffect(()=>{
  if(!step||!dialog.current)return;
  const place=()=>{
   const card=dialog.current;if(!card)return;
   const margin=12,gap=14,vh=window.innerHeight,vw=window.innerWidth;
   const cardBox=card.getBoundingClientRect();
   const left=rect?Math.max(margin,Math.min(vw-cardBox.width-margin,rect.left+rect.width/2-cardBox.width/2)):(vw-cardBox.width)/2;
   const below=rect?rect.bottom+gap:margin;
   const above=rect?rect.top-cardBox.height-gap:vh-cardBox.height-margin;
   const roomBelow=vh-below-margin,roomAbove=rect?above:0;
   let top:number;
   if(!rect)top=margin;
   else if(roomBelow>=cardBox.height||roomBelow>=roomAbove)top=Math.max(margin,Math.min(vh-cardBox.height-margin,below));
   else top=Math.max(margin,Math.min(vh-cardBox.height-margin,above));
   setPosition(current=>current.top===top&&current.left===left?current:{top,left});
  };
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[step,rect]);

 function finish(){try{localStorage.setItem(key,'done');}catch{}setIndex(null);openMenu(false);}
 if(index===null||!step)return null;
 const left=rect?Math.max(0,rect.left-5):0,top=rect?Math.max(0,rect.top-5):0;
 const width=rect?Math.min(rect.width+10,window.innerWidth-left):0,height=rect?Math.min(rect.height+10,window.innerHeight-top):0;
 return <div className="fio-tour-layer">
  <svg className="fio-tour-shade" aria-hidden="true"><defs><mask id="fio-tour-hole"><rect width="100%" height="100%" fill="white"/>{rect&&<rect x={left} y={top} width={width} height={height} rx="10" fill="black"/>}</mask></defs><rect width="100%" height="100%" fill="rgba(0,0,0,.54)" mask="url(#fio-tour-hole)"/>{rect&&<rect x={left} y={top} width={width} height={height} rx="10" fill="none" stroke="white" strokeWidth="2"/>}</svg>
  <div ref={dialog} tabIndex={-1} className="fio-tour-card" role="dialog" aria-modal="true" aria-labelledby="fio-tour-title" style={{top:position.top,left:position.left}} onKeyDown={e=>{if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
   <small>{t('tour.kicker',{current:index+1,total:steps.length})}</small><h2 id="fio-tour-title">{step.title}</h2><p>{step.text}</p>
   <div className="fio-tour-actions"><button onClick={finish}>{t('tour.skip')}</button><span/><button disabled={index===0} onClick={()=>setIndex(index-1)}>{t('tour.previous')}</button><button className="primary" onClick={()=>index===steps.length-1?finish():setIndex(index+1)}>{index===steps.length-1?t('tour.finish'):t('tour.next')}</button></div>
  </div>
 </div>;
}
