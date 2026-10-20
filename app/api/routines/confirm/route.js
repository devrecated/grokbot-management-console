// Grok Bot confirms (or rejects) a pending routine change. Bearer ROUTINE_LOG_TOKEN + Vercel bypass header.
import { sql, ensure, ensureMessages, authed } from "@/lib/db";
import { forward } from "@/lib/webhook";
import { getSettings } from "@/lib/settings";
export const dynamic="force-dynamic";
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const b=await req.json(); const q=sql(); await ensure(q); await ensureMessages(q);
  const [r]=await q`select * from routines where routine_id=${b.routine_id||""}`;
  if(!r) return Response.json({error:"unknown routine"},{status:404});
  const ok=b.ok===true;
  const status=["active","paused"].includes(b.status)?b.status:null;
  const sched=typeof b.schedule_or_trigger==="string"&&b.schedule_or_trigger.trim()?b.schedule_or_trigger.trim().slice(0,300):null;
  if(ok) await q`update routines set status=coalesce(${status},status), schedule_or_trigger=coalesce(${sched},schedule_or_trigger), pending_action=null, pending_since=null, updated_at=now() where routine_id=${r.routine_id}`;
  else await q`update routines set pending_action=null, pending_since=null where routine_id=${r.routine_id}`;
  const note=String(b.note||"").slice(0,2000);
  const text=ok?`Done: ${r.name}${status?` is now ${status}`:""}${sched?`; schedule/trigger: ${sched}`:""}.${note?` ${note}`:""}`:`Could not apply change to ${r.name}.${note?` ${note}`:""}`;
  const [m]=await q`insert into messages(thread_id,role,text,bot,routine_id) values(${`routine:${r.routine_id}`},'grokbot',${text},${r.bot},${r.routine_id}) returning id`;
  // Mirror the confirmation to Grok Bot chat when the setting is on (notify only; the receiver must not reply to the dashboard).
  let mirrored=null; if(b.mirrored!==true&&(await getSettings(q)).always_reply_in_chat){ mirrored=(await forward(q,{kind:"notify",also_chat:true,no_dashboard_reply:true,routine_id:r.routine_id,bot:r.bot,thread_id:`routine:${r.routine_id}`,text})).delivered; }
  return Response.json({ok:true, applied:ok, message_id:String(m.id), mirrored});
}
