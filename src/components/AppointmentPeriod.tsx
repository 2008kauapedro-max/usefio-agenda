import {useEffect,useState} from 'react';
import type {Appointment} from '../../shared/domain';
import type {WorkspaceProps} from '../pages/Workspace';
import {dayKey} from '../pages/Workspace';
import {api} from '../lib/api';
import {Field} from './ui';
import {useI18n} from '../i18n';

type Period={
 total:number;
 completed:number;
 cancelled:number;
 noShow:number;
 items:Appointment[]
};



export function AppointmentPeriod(
 p:WorkspaceProps&{
  professional:string;
  onSelect:(a:Appointment)=>void
 }
){

 const {t,formatDate}=useI18n();
 const zone=p.data.shop.timezone;

 const [month,setMonth]=
  useState(
   dayKey(
    new Date().toISOString(),
    zone
   ).slice(0,7)
  );

 const [value,setValue]=
  useState<Period|null>(null);

 const [error,setError]=useState('');

 useEffect(()=>{

  let alive=true;

  setError('');
  setValue(null);

  if(!/^\d{4}-\d{2}$/.test(month))
   return;

  const from=month+'-01';

  const to=
   new Date(
    Date.UTC(
     Number(month.slice(0,4)),
     Number(month.slice(5,7)),
     0
    )
   )
   .toISOString()
   .slice(0,10);

  const items=
   p.data.appointments.filter(a=>
    dayKey(a.starts_at,zone)
     .startsWith(month)&&
    (
     !p.professional||
     a.barber_id===p.professional
    )
   );

  const request=
   p.demo
    ?Promise.resolve({
      total:items.length,
      completed:
       items.filter(
        a=>a.status==='completed'
       ).length,
      cancelled:
       items.filter(
        a=>a.status==='cancelled'
       ).length,
      noShow:
       items.filter(
        a=>a.status==='no_show'
       ).length,
      items
     })
    :api<Period>(
      `/appointments/period?from=${from}&to=${to}${
       p.professional
        ?`&barberId=${p.professional}`
        :''
      }`,
      p.data.shop.id
     );

  void request
   .then(v=>{
    if(alive)setValue(v);
   })
   .catch(e=>{
    if(alive)setError(e.message);
   });

  return()=>{alive=false};

 },[
  month,
  p.professional,
  p.demo,
  p.data.appointments,
  p.data.shop.id,
  zone
 ]);

 return <section className="period-summary">

  <div className="section-title">

   <div>
    <h2>{t('period.title')}</h2>
    <small className="muted">
     {t('period.desc')}
    </small>
   </div>

   <Field label={t('period.label')}>
    <input
     type="month"
     value={month}
     onChange={e=>setMonth(e.target.value)}
    />
   </Field>

  </div>

  {error?

   <p role="alert">{error}</p>

   :!value?

   <p role="status">
    {t('period.loading')}
   </p>

   :<>

    <dl className="period-counts">

     {[
      [t('period.total'),value.total],
      [t('period.completed'),value.completed],
      [t('period.cancelled'),value.cancelled],
      [t('period.noShow'),value.noShow]
     ].map(([label,count])=>

      <div key={label}>
       <dt>{label}</dt>
       <dd>{count}</dd>
      </div>

     )}

    </dl>

    <details>

     <summary>
      {t('period.history')}
     </summary>

     {value.total>value.items.length&&
      <p>
       {t('period.showing',{shown:value.items.length,total:value.total})}
      </p>
     }

     <div className="period-list">

      {value.items.map(a=>{

       const customer=
        p.data.customers.find(
         c=>c.id===a.client_id
        );

       const member=
        customer?.user_id
         ?p.data.team.find(
           t=>t.user_id===customer.user_id
          )
         :undefined;

       const name=
        customer?.name??t('period.client');

       return <button
        key={a.id}
        className={
         `period-appointment period-${a.status}`
        }
        onClick={()=>p.onSelect(a)}
       >

        <span className="avatar period-client-avatar">

         {member?.avatar_url
          ?<img
            src={member.avatar_url}
            alt=""
           />
          :name
            .split(' ')
            .map((x:string)=>x[0])
            .slice(0,2)
            .join('')
         }

        </span>

        <span className="period-appointment-copy">

         <strong>
          {name.trim().split(/\s+/)[0]}
          {' · '}
          {formatDate(a.starts_at,{timeZone:zone,dateStyle:'short',timeStyle:'short'})}
         </strong>

         <small>
          {p.data.services.find(
           s=>s.id===a.service_id
          )?.name??t('period.service')}

          {' · '}

          {p.data.team.find(
           t=>t.user_id===a.barber_id
          )?.display_name??t('period.professional')}
         </small>

        </span>

        <span className={`status ${a.status}`}>
         {t(`status.${a.status}`)}
        </span>

       </button>;

      })}

      {!value.total&&
       <p>
        {t('period.empty')}
       </p>
      }

     </div>

    </details>

   </>
  }

 </section>;
}
