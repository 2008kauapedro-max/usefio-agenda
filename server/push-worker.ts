import {createClient} from '@supabase/supabase-js';
import {dispatchPlatformPush} from './platform-push.js';
import {dispatchAppointmentPush} from './appointment-push.js';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Configure Supabase no servidor para o dispatcher.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
Promise.all([dispatchPlatformPush(db),dispatchAppointmentPush(db)]).then(([platform,appointments])=>console.log(JSON.stringify({platform,appointments}))).catch(()=>{console.error('Push dispatcher failed; inspect configuration and database availability.');process.exitCode=1;});
