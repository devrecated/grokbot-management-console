// Wake box. The box is a VM that gets paused; a Grok Bot routine run resumes it. POST fires the inbox webhook with
// kind "wake" (the routine only runs grugbox ensure-running). GET: sleeping | waking | awake, from the last heartbeat.
// Costs one small routine run, so a second press while waking (5 min) does nothing.
import { sql, ensureHeartbeats, ensureLogs } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { forward } from "@/lib/webhook";
export const dynamic="force-dynamic";
const WAIT=5*60e3;
async function state(q){
  await ensureLogs(q); await ensureHeartbeats(q); const st=await getSettings(q);
  const [h]=await q`select last_ping from heartbeats order by last_ping desc limit 1`;
  const w=(await q`select value from config where key='wake_request'`)[0]?.value||{};
  const ping=h?+new Date(h.last_ping):0, at=Number(w.at)||0, awake=Date.now()-ping<Math.max(3*60e3,3*st.heartbeat_interval_s*1e3);
  const s=at&&ping>at?"awake":at&&Date.now()-at<WAIT?"waking":awake?"awake":"sleeping";
  return {state:s,last_ping:ping||null,requested_at:at||null,woke_in_s:at&&ping>at?Math.round((ping-at)/1000):null,reason:w.reason||null};
}
export async function GET(){ return Response.json(await state(sql())); }
export async function POST(){
  const q=sql(), s=await state(q); if(s.state==="waking") return Response.json({...s,note:"already waking"});
  const at=Date.now(), r=await forward(q,{kind:"wake",thread_id:"box:wake",text:"Wake the box: run grugbox ensure-running. No reply needed."});
  await q`insert into config(key,value,updated_at) values('wake_request',${JSON.stringify({at:r.delivered?at:0,reason:r.reason})}::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`;
  return Response.json({...(await state(q)),delivered:r.delivered,reason:r.reason});
}
