import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowUp,Plus,Sparkles,SlidersHorizontal,X,RefreshCw} from 'lucide-react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';
type Proposal={id:string;token:string;action:string;target:string;targetName:string;planId:string|null;planName?:string|null;expiresAt:string};
type Answer={requestId:string;message:string;tools:string[];proposals:Proposal[]};
function InlineMarkdown({text}:{text:string}){const parts:ReactNode[]=[];const re=/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;let last=0,m:RegExpExecArray|null,i=0;while((m=re.exec(text))){if(m.index>last)parts.push(text.slice(last,m.index));const t=m[0];parts.push(t.startsWith('**')?<strong key={i++}>{t.slice(2,-2)}</strong>:<code key={i++}>{t.slice(1,-1)}</code>);last=m.index+t.length;}if(last<text.length)parts.push(text.slice(last));return <>{parts}</>;}
function SafeMarkdown({text}:{text:string}){return <div className="pc-markdown">{text.split(/\n{2,}/).map((b,i)=><p key={i}>{b.split('\n').map((l,j,a)=><span key={j}><InlineMarkdown text={l}/>{j<a.length-1&&<br/>}</span>)}</p>)}</div>;}

const actionLabels:Record<string,string>={suspend_shop:'Suspender barbearia',reactivate_shop:'Reativar barbearia',change_plan:'Alterar plano SaaS',resolve_alert:'Encerrar alerta'};
const toolLabels:Record<string,string>={get_platform_summary:'Resumo da plataforma',get_platform_alerts:'Alertas',list_barbershops:'Barbearias',get_barbershop_summary:'Resumo da barbearia',get_barbershop_health:'Estado operacional',get_saas_subscriptions:'Assinaturas',get_saas_revenue:'Receita confirmada',get_recent_activity:'Atividade recente',get_user_activity:'Atividade do usuário',get_ai_usage:'Uso da IA',propose_admin_action:'Proposta para revisão'};
export function ProposalCard({proposal,done}:{proposal:Proposal;done?:()=>void}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState('');
 async function decide(confirm:boolean){setBusy(true);setError('');try{await api('/platform/ai/decision',undefined,{id:proposal.id,token:proposal.token,confirm});setResult(confirm?'Ação executada e registrada.':'Proposta cancelada.');done?.();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="pc-proposal" aria-label="Proposta administrativa"><strong>{actionLabels[proposal.action]}</strong><p>{proposal.targetName}</p><small>Alvo: {proposal.target}</small>{proposal.planId&&<small>Novo plano: {proposal.planName??proposal.planId}</small>}<p>{proposal.action==='suspend_shop'?'O acesso operacional da equipe e dos clientes será suspenso.':proposal.action==='change_plan'?'Altera o plano administrativo. Não gera cobrança.':proposal.action==='resolve_alert'?'Encerra este registro após sua revisão. Isso não corrige a causa nem altera as respostas da IA.':'Restaura o acesso operacional da barbearia.'}</p><small>Motivo: proposta solicitada para revisão administrativa. Válida até {new Date(proposal.expiresAt).toLocaleTimeString('pt-BR')}.</small>{result?<p role="status">{result}</p>:<div className="pc-actions"><button disabled={busy} onClick={()=>void decide(false)}>Cancelar</button><button disabled={busy} onClick={()=>void decide(true)}>{busy?'Processando…':'Confirmar ação'}</button></div>}{error&&<p role="alert">{error}</p>}</section>;
}
export function PlatformCopilot() {
  const [value, setValue] = useState('');
  const [items, setItems] = useState<{ question: string; answer: Answer | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'end',
    });
  }, [items, busy]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;

    const question = value.trim();
    const history = items
      .filter(item => item.answer)
      .flatMap(item => [
        { role: 'user' as const, content: item.question },
        { role: 'assistant' as const, content: item.answer!.message },
      ])
      .slice(-12);

    setValue('');
    setError('');
    setBusy(true);
    setItems(previous => [...previous, { question, answer: null }]);

    try {
      const answer = await api<Answer>('/platform/ai', undefined, {
        message: question,
        history,
      });

      setItems(previous => {
        const next = [...previous];
        next[next.length - 1] = { question, answer };
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
      setItems(previous => previous.slice(0, -1));
      setValue(question);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    'Quantas barbearias estão ativas?',
    'Quais alertas críticos existem?',
    'Existe receita SaaS confirmada?',
  ];

  return (
    <div className="pc-page">
      <header className="pc-chat-header">
        <div>
          <h1>Copiloto FIO</h1>
          <span className="pc-online"><i /> Online</span>
          <p>Seu assistente para entender e administrar o FIO.</p>
        </div>

        <button
          className="pc-new"
          type="button"
          aria-label="Nova conversa"
          title="Nova conversa"
          onClick={() => {
            setItems([]);
            setValue('');
            setError('');
          }}
        >
          <Plus size={17} />
          <span>Nova conversa</span>
        </button>
      </header>

      <div className="pc-thread" aria-live="polite">
        {!items.length && (
          <div className="pc-welcome">
            <span className="pc-avatar"><Sparkles size={19} /></span>
            <div>
              <strong>Olá! Eu sou o Copiloto FIO.</strong>
              <p>
                Posso conversar com você normalmente, consultar os dados autorizados da plataforma
                quando necessário e preparar ações administrativas para sua confirmação.
              </p>
              <div className="pc-suggestions">
                {suggestions.map(suggestion => (
                  <button key={suggestion} type="button" onClick={() => setValue(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {items.map(({ question, answer }, index) => (
          <div className="pc-turn" key={answer?.requestId ?? `pending-${index}`}>
            <div className="pc-user-message">{question}</div>

            {answer && (
              <div className="pc-assistant-row">
                <span className="pc-avatar"><Sparkles size={18} /></span>
                <div className="pc-assistant-message">
                  <SafeMarkdown text={answer.message}/>

                  {answer.tools.length > 0 && (
                    <small>
                      Consultado: {Array.from(new Set(answer.tools))
                        .map(name => toolLabels[name] ?? 'Consulta autorizada')
                        .join(' · ')}
                    </small>
                  )}

                  {answer.proposals.map(proposal => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="pc-assistant-row pc-loading-row">
            <span className="pc-avatar"><Sparkles size={18} /></span>
            <div className="pc-typing">
              <span aria-label="Copiloto digitando">•••</span>
            </div>
          </div>
        )}

        <div ref={end} />
      </div>

      <div className="pc-composer-area">
        {error && (
          <p className="pc-error" role="alert">
            {error} Sua mensagem foi mantida para tentar novamente.
          </p>
        )}

        <form className="pc-composer" onSubmit={submit}>
          <textarea
            aria-label="Mensagem para o Copiloto FIO"
            rows={1}
            maxLength={2000}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (value.trim() && !busy) e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Digite sua mensagem aqui…"
          />
          <button aria-label="Enviar mensagem" disabled={busy || !value.trim()}>
            <ArrowUp size={20} />
          </button>
        </form>

        <small>Ações administrativas só são executadas pelo botão de confirmação.</small>
      </div>
    </div>
  );
}

type Alert={id:string;title:string;description:string;severity:string;status:string;created_at:string;barbershop_id:string|null};
export function PlatformAlerts(){
 const [severity,setSeverity]=useState(''),[status,setStatus]=useState('open'),[draftSeverity,setDraftSeverity]=useState(''),[draftStatus,setDraftStatus]=useState('open'),[filtersOpen,setFiltersOpen]=useState(false),[page,setPage]=useState(1),[version,setVersion]=useState(0),[data,setData]=useState<{items:Alert[];total:number}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[proposal,setProposal]=useState<Proposal|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);setError('');api<{items:Alert[];total:number}>(`/platform/alerts?page=${page}&limit=10&status=${status}${severity?'&severity='+severity:''}`).then(r=>{if(active)setData(r);}).catch(e=>{if(active){setError((e as Error).message);setData(null);}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[severity,status,page,version]);
 async function resolve(id:string){setBusy(true);setError('');try{setProposal(await api(`/platform/alerts/${id}/resolve-proposal`,undefined,{}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const severityLabel=severity==='critical'?'Críticos':severity==='warning'?'Atenção':severity==='info'?'Informativos':'Todas as gravidades';
 const apply=()=>{setSeverity(draftSeverity);setStatus(draftStatus);setPage(1);setFiltersOpen(false);};
 const clear=()=>{setDraftSeverity('');setDraftStatus('open');setSeverity('');setStatus('open');setPage(1);setFiltersOpen(false);};
 return <>
  <header className="pf-heading pf-alert-heading"><div><h1>Alertas</h1><p>{data?`${data.total} ${status==='open'?'pendência'+(data.total===1?'':'s')+' aberta'+(data.total===1?'':'s'):'alerta'+(data.total===1?'':'s')+' resolvido'+(data.total===1?'':'s')}`:'O que precisa da sua atenção na plataforma.'}</p></div></header>
  <div className="pf-list-toolbar"><div><strong>{status==='open'?'Pendências abertas':'Histórico resolvido'}</strong><small>{severityLabel}</small></div><div className="pf-toolbar-actions"><button type="button" aria-label="Atualizar alertas" onClick={()=>setVersion(v=>v+1)}><RefreshCw size={16}/></button><button type="button" onClick={()=>{setDraftSeverity(severity);setDraftStatus(status);setFiltersOpen(true);}}><SlidersHorizontal size={17}/>Filtrar</button></div></div>
  {error?<div className="pf-state" role="alert"><p>{error}</p><button onClick={()=>setVersion(v=>v+1)}>Tentar novamente</button></div>:loading?<p className="pf-state" role="status">Carregando alertas…</p>:data?.items.length?<>
   <div className="pc-alert-list">{data.items.map(a=><article className={`pc-alert severity-${a.severity}`} key={a.id}><div><div className="pc-alert-meta"><span className="pc-alert-badge">{a.severity==='critical'?'Crítico':a.severity==='warning'?'Atenção':'Informativo'}</span><time>{new Date(a.created_at).toLocaleString('pt-BR')}</time></div><strong>{a.title}</strong><details><summary>Ver o que aconteceu</summary><p>{a.description}</p>{a.barbershop_id&&<Link className="pc-alert-shop-link" to={`/platform/barbearias/${a.barbershop_id}`}>Abrir barbearia relacionada</Link>}</details></div>{a.status==='open'&&<button disabled={busy} onClick={()=>void resolve(a.id)}>Encerrar alerta</button>}</article>)}</div>
   {data.total>10&&<div className="pf-pager"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Anterior</button><small>Página {page}</small><button disabled={loading||page*10>=data.total} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>}
  </>:<div className="pf-empty-friendly"><strong>Nada pedindo sua atenção.</strong><span>{status==='open'?'Não há alertas abertos com este filtro.':'Não há alertas resolvidos com este filtro.'}</span></div>}
  {proposal&&<ProposalCard key={proposal.id} proposal={proposal} done={()=>setVersion(v=>v+1)}/>}
  {filtersOpen&&<div className="pf-filter-overlay" onClick={()=>setFiltersOpen(false)}><section className="pf-filter-sheet" role="dialog" aria-modal="true" aria-label="Filtrar alertas" onClick={e=>e.stopPropagation()}><header><div><strong>Filtrar alertas</strong><small>Escolha somente o que quer acompanhar.</small></div><button type="button" aria-label="Fechar filtros" onClick={()=>setFiltersOpen(false)}><X size={18}/></button></header><div className="pf-filter-grid"><label>Gravidade<select value={draftSeverity} onChange={e=>setDraftSeverity(e.target.value)}><option value="">Todas</option><option value="critical">Crítica</option><option value="warning">Atenção</option><option value="info">Informativa</option></select></label><label>Status<select value={draftStatus} onChange={e=>setDraftStatus(e.target.value)}><option value="open">Abertos</option><option value="resolved">Resolvidos</option></select></label></div><footer><button type="button" onClick={clear}>Limpar</button><button className="pf-primary" type="button" onClick={apply}>Aplicar filtros</button></footer></section></div>}
 </>;
}

export function PlatformPush(){
 const [config,setConfig]=useState<{configured:boolean;publicKey:string|null}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[critical,setCritical]=useState(true),[warning,setWarning]=useState(false),[info,setInfo]=useState(false);
 const [subscribed,setSubscribed]=useState(false);
 const supported=typeof Notification!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window;
 async function load(){try{setConfig(await api('/platform/push/config'));if(supported){const registration=await navigator.serviceWorker.getRegistration(),sub=await registration?.pushManager.getSubscription();setSubscribed(Boolean(sub));if(sub){const preferences=await api<{endpoint:string;critical:boolean;warning:boolean;info:boolean}[]>('/platform/push/subscriptions');const own=preferences.find(p=>p.endpoint===sub.endpoint);if(own){setCritical(own.critical);setWarning(own.warning);setInfo(own.info);}}}setError('');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function enable(){setBusy(true);setError('');try{
  if(!config?.configured||!config.publicKey)throw Error('VAPID ainda não foi configurado no servidor.');
  if(await Notification.requestPermission()!=='granted')throw Error('Permissão não concedida. Você pode alterar nas configurações do navegador.');
  const registration=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
  const existing=await registration.pushManager.getSubscription();
  const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const sub=existing??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  try{await api('/platform/push/subscriptions',undefined,{optIn:true,subscription:sub.toJSON(),preferences:{critical,warning,info}});}catch(e){if(!existing)await sub.unsubscribe();throw e;}
  setSubscribed(true);setMessage('Notificações ativadas neste dispositivo.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function disable(){setBusy(true);setError('');try{const registration=await navigator.serviceWorker.getRegistration(),sub=await registration?.pushManager.getSubscription();if(sub){await api('/platform/push/subscriptions',undefined,{endpoint:sub.endpoint},'DELETE');await sub.unsubscribe();}setSubscribed(false);setMessage('Notificações desativadas neste dispositivo.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="pf-panel pc-push"><h2>Notificações da plataforma</h2><p>Ative neste dispositivo para receber alertas críticos. Nenhuma permissão é solicitada automaticamente.</p><label><input type="checkbox" checked={critical} onChange={e=>setCritical(e.target.checked)}/>Receber alertas críticos</label><label><input type="checkbox" checked={warning} onChange={e=>setWarning(e.target.checked)}/>Receber também avisos de atenção</label><label><input type="checkbox" checked={info} onChange={e=>setInfo(e.target.checked)}/>Receber informações</label>{!supported?<p>Este navegador não oferece Web Push. No iOS, use o aplicativo instalado.</p>:<div className="pc-actions"><button disabled={busy||!config?.configured} onClick={()=>void enable()}>Ativar / salvar preferências</button><button disabled={busy||!subscribed} onClick={()=>void disable()}>Desativar neste dispositivo</button></div>}{config&&!config.configured&&<p>Notificações neste dispositivo ainda não foram configuradas pela administração. Os alertas continuam disponíveis na aba Alertas.</p>}{!config&&!error&&<p role="status">Verificando configuração…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error} <button onClick={()=>void load()}>Tentar novamente</button></p>}</section>;
}
