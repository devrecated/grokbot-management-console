// Dashboard routine actions (Vercel Authentication protects this route). Stores pending_action, posts to the routine thread, forwards to Grok Bot.
import { sql, ensure, ensureMessages } from "@/lib/db";
import { forward } from "@/lib/webhook";
import { getSettings } from "@/lib/settings";
export const dynamic="force-dynamic";
const ACTIONS=["pause","resume","set_schedule","change_trigger"];
export async function POST(req){
  const b=await req.json(); const q=sql(); await ensure(q); await ensureMessages(q);
  const [r]=await q`select * from routines where routine_id=${b.routine_id||""}`;
  if(!r) return Response.json({error:"unknown routine"},{status:404});
  const thread_id=`routine:${r.routine_id}`;
  if(b.action==="cancel"){
    await q`update routines set pending_action=null, pending_since=null where routine_id=${r.routine_id}`;
    await q`insert into messages(thread_id,role,text,bot,routine_id) values(${thread_id},'user',${"Cancelled pending change (dashboard only; Grok Bot was not notified)."},${r.bot},${r.routine_id})`;
    return Response.json({ok:true,cancelled:true});
  }
  if(!ACTIONS.includes(b.action)) return Response.json({error:"bad action"},{status:400});
  const also=b.also_chat===true||(await getSettings(q)).always_reply_in_chat;
  const pending={action:b.action, schedule:b.schedule||null, timing:b.timing||null, human:String(b.human||b.action).slice(0,300), trigger_request:b.trigger_request?String(b.trigger_request).slice(0,2000):null};
  if(b.action==="set_schedule"&&!/^\S+ \S+ \S+ \S+ \S+$/.test(pending.schedule||"")) return Response.json({error:"schedule must be a 5-field cron"},{status:400});
  if(b.action==="change_trigger"&&!pending.trigger_request) return Response.json({error:"trigger_request required"},{status:400});
  await q`update routines set pending_action=${JSON.stringify(pending)}::jsonb, pending_since=now() where routine_id=${r.routine_id}`;
  const text=`Request: ${b.action.replace("_"," ")} "${r.name}" (${r.routine_id}). ${pending.human}${pending.trigger_request?`\nTrigger change: ${pending.trigger_request}`:""}`;
  const [m]=await q`insert into messages(thread_id,role,text,bot,routine_id,also_chat) values(${thread_id},'user',${text},${r.bot},${r.routine_id},${also}) returning id`;
  const origin=new URL(req.url).origin;
  const res=await forward(q,{kind:"action", action:b.action, routine_id:r.routine_id, bot:r.bot, bot_id:r.bot_id, schedule:pending.schedule, timing:pending.timing, human:pending.human,
    trigger_request:pending.trigger_request, current_schedule_or_trigger:r.schedule_or_trigger, current_status:r.status, message_id:String(m.id), thread_id, also_chat:also,
    text, dashboard_url:`${origin}/?thread=${encodeURIComponent(thread_id)}`});
  await q`update messages set delivered=${res.delivered} where id=${m.id}`;
  return Response.json({ok:true, thread_id, pending, ...res});
}
