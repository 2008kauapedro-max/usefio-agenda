import { useEffect,useMemo,useRef,useState,type ChangeEvent,type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera,ImagePlus,Plus,Trash2,X } from 'lucide-react';
import type { FeedPost } from '../../shared/domain';
import { api,supabase } from '../lib/api';
import { optimizeImage } from '../lib/images';
import { Empty,Modal,PageTitle } from '../components/ui';
import type { WorkspaceProps } from './Workspace';
import {useI18n} from '../i18n';

const MAX_IMAGE_BYTES=15*1024*1024;
const ALLOWED_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const relative=(iso:string,locale:string)=>{
 const diff=Math.max(0,Date.now()-new Date(iso).getTime());
 const rtf=new Intl.RelativeTimeFormat(locale==='en'?'en-US':locale,{numeric:'auto'});
 const minutes=Math.floor(diff/60000);
 if(minutes<1)return rtf.format(0,'minute');
 if(minutes<60)return rtf.format(-minutes,'minute');
 const hours=Math.floor(minutes/60);
 if(hours<24)return rtf.format(-hours,'hour');
 const days=Math.floor(hours/24);
 return rtf.format(-days,'day');
};

export function Feed(p:WorkspaceProps){
 const {t,locale}=useI18n();
 const {data}=p,canPost=data.membership.role==='OWNER'||data.membership.role==='BARBER',navigate=useNavigate();
 const [composer,setComposer]=useState(false),[urls,setUrls]=useState<Record<string,string>>({}),[removing,setRemoving]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;
  const local:Record<string,string>={};
  const run=async()=>{
   if(p.demo){for(const post of data.posts)local[post.id]=post.image_path;if(alive)setUrls(local);return;}
   const storageClient=supabase;
   if(!storageClient)return;
   await Promise.all(data.posts.map(async post=>{
    const {data:signed}=await storageClient.storage.from('feed-posts').createSignedUrl(post.image_path,3600);
    if(signed?.signedUrl)local[post.id]=signed.signedUrl;
   }));
   if(alive)setUrls(local);
  };
  void run();return()=>{alive=false;};
 },[data.posts,p.demo]);
 const featured=useMemo(()=>data.team.filter(member=>member.role==='BARBER').slice(0,8),[data.team]);
 async function remove(post:FeedPost){
  if(!confirm(t('feed.removeConfirm')))return;
  setRemoving(post.id);
  try{
   if(p.demo){p.updateDemo(d=>({...d,posts:d.posts.filter(item=>item.id!==post.id)}));}
   else{
    await api(`/posts/${post.id}`,data.shop.id,undefined,'DELETE');
    await supabase?.storage.from('feed-posts').remove([post.image_path]);
    await p.refresh();
   }
   p.notify(t('feed.removed'));
  }catch(e){p.notify((e as Error).message);}finally{setRemoving(null);}
 }
 return <>
  <PageTitle eyebrow={t('feed.eyebrow')} title={t('feed.title')} description={t('feed.desc')} action={canPost?<button className="primary" onClick={()=>setComposer(true)}><Plus size={18}/>{t('feed.new')}</button>:undefined}/>
  {featured.length>0&&<section className="feed-team" aria-label={t('feed.professionals')}><div className="section-title"><h2>{t('feed.professionals')}</h2><span className="muted">{t('feed.recent')}</span></div><div className="feed-team-scroll">{featured.map(member=><button className="feed-team-person feed-team-button" key={member.user_id} onClick={()=>navigate(`${p.base}/equipe`)}><span className="feed-team-avatar">{member.avatar_url?<img src={member.avatar_url} alt=""/>:member.display_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><strong>{member.display_name.split(' ')[0]}</strong><small>{t('feed.contact')}</small></button>)}</div></section>}
  {data.posts.length?<section className="feed-grid">{data.posts.map(post=>{
   const canDelete=canPost&&(data.membership.role==='OWNER'||post.author_id===data.membership.user_id);
   return <article className="feed-card" key={post.id}>
    <div className="feed-image-wrap">{urls[post.id]?<img src={urls[post.id]} alt={t('feed.imageAlt',{name:post.author_name})}/>:<div className="feed-image-loading fio-pattern-dark"><Camera size={28}/></div>}{canDelete&&<button className="feed-delete" aria-label={t('feed.removeAria')} disabled={removing===post.id} onClick={()=>void remove(post)}><Trash2 size={16}/></button>}</div>
    <div className="feed-card-body"><div className="feed-author"><span className="avatar small">{post.author_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><div><strong>{post.author_name}</strong><small>{relative(post.created_at,locale)}</small></div></div>{post.caption&&<p>{post.caption}</p>}</div>
   </article>;
  })}</section>:<Empty title={t('feed.emptyTitle')}>{canPost?t('feed.emptyStaff'):t('feed.emptyClient')}</Empty>}
  {composer&&<PostComposer {...p} onClose={()=>setComposer(false)}/>}
 </>;
}

function PostComposer(p:WorkspaceProps&{onClose:()=>void}){
 const {t}=useI18n();
 const input=useRef<HTMLInputElement>(null),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[caption,setCaption]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{if(preview.startsWith('blob:'))URL.revokeObjectURL(preview);},[preview]);
 function choose(e:ChangeEvent<HTMLInputElement>){
  const next=e.target.files?.[0]??null;setError('');
  if(!next)return;
  if(!ALLOWED_TYPES.has(next.type)){setError(t('feed.invalidType'));return;}
  if(next.size>MAX_IMAGE_BYTES){setError(t('feed.tooLarge'));return;}
  if(preview.startsWith('blob:'))URL.revokeObjectURL(preview);
  setFile(next);setPreview(URL.createObjectURL(next));
 }
 async function submit(e:FormEvent){
  e.preventDefault();if(!file){setError(t('feed.chooseRequired'));return;}setBusy(true);setError('');
  let uploadedPath='';
  try{
   if(p.demo){
    p.updateDemo(d=>({...d,posts:[{id:crypto.randomUUID(),author_id:d.membership.user_id,author_name:d.membership.display_name,caption:caption.trim(),image_path:preview,created_at:new Date().toISOString()},...d.posts]}));
   }else{
    if(!supabase)throw new Error(t('feed.supabaseMissing'));
    const optimized=await optimizeImage(file,'feed');
    uploadedPath=`${p.data.shop.id}/${p.data.membership.user_id}/${crypto.randomUUID()}.webp`;
    const upload=await supabase.storage.from('feed-posts').upload(uploadedPath,optimized,{cacheControl:'31536000',contentType:'image/webp',upsert:false});
    if(upload.error)throw new Error(t('feed.uploadFailed'));
    try{await api('/posts',p.data.shop.id,{caption:caption.trim(),imagePath:uploadedPath});}
    catch(error){await supabase.storage.from('feed-posts').remove([uploadedPath]);throw error;}
    await p.refresh();
   }
   p.notify(t('feed.published'));p.onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <Modal title={t('feed.new')} onClose={p.onClose}><form className="post-composer" onSubmit={submit}>
  <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={choose}/>
  <button type="button" className={`post-picker ${preview?'has-preview':'fio-pattern-dark'}`} onClick={()=>input.current?.click()}>{preview?<><img src={preview} alt={t('feed.previewAlt')}/><span><ImagePlus size={18}/>{t('feed.changePhoto')}</span></>:<><ImagePlus size={28}/><strong>{t('feed.choosePhoto')}</strong><small>{t('feed.imageHelp')}</small></>}</button>
  <label className="field">{t('feed.caption')}<textarea value={caption} maxLength={500} rows={4} onChange={e=>setCaption(e.target.value)} placeholder={t('feed.captionPlaceholder')}/><span className="field-counter">{caption.length}/500</span></label>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="modal-actions"><button type="button" className="ghost" onClick={p.onClose} disabled={busy}><X size={17}/>{t('common.cancel')}</button><button className="primary" disabled={busy||!file}>{busy?t('feed.publishing'):t('feed.publish')}</button></div>
 </form></Modal>;
}
