// UI-facing chat routes. Protected by Vercel Authentication (team login), so no bearer token here.
import { sql, ensureMessages } from "@/lib/db";
import { randomUUID } from "crypto";
export const dynamic="force-dynamic";
export async function GET(req){
  const q=sql(); await ensureMessages(q);
  const tid=new URL(req.url).searchParams.get("thread_id");
  const threads=await q`select thread_id, max(created_at) last_at, (array_agg(text order by created_at))[1] first_text, (array_agg(bot order by created_at))[1] bot, (array_agg(routine_id order by created_at))[1] routine_id from messages group by thread_id order by last_at desc limit 100`;
  const messages=tid?await q`select * from messages where thread_id=${tid} order by created_at, id`:[];
  return Response.json({threads,messages});
}
export async function POST(req){
  const b=await req.json(); const text=String(b.text||"").trim().slice(0,8000);
  if(!text) return Response.json({error:"text required"},{status:400});
  const q=sql(); await ensureMessages(q);
  const tid=b.thread_id||randomUUID();
  let bot=b.bot||null, rid=b.routine_id||null;
  if(b.thread_id){ const [f]=await q`select bot,routine_id from messages where thread_id=${tid} order by created_at limit 1`; if(f){bot??=f.bot;rid??=f.routine_id;} }
  const [m]=await q`insert into messages(thread_id,role,text,bot,routine_id) values(${tid},'user',${text},${bot},${rid}) returning id`;
  const url=(process.env.GROKBOT_WEBHOOK_URL||"").trim(), key=(process.env.GROKBOT_WEBHOOK_KEY||"").replace(/[\r\n]/g,"").trim();
  let delivered=false, reason=null;
  if(!url||!key) reason="webhook not configured";
  else try{
    const origin=new URL(req.url).origin;
    const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${key}`},
      body:JSON.stringify({message_id:String(m.id),thread_id:tid,text,bot,routine_id:rid,dashboard_url:`${origin}/?thread=${tid}`}),signal:AbortSignal.timeout(10000)});
    delivered=r.ok; if(!r.ok) reason=`webhook ${r.status}`;
  }catch(e){ reason="webhook unreachable"; }
  await q`update messages set delivered=${delivered} where id=${m.id}`;
  return Response.json({ok:true,message_id:String(m.id),thread_id:tid,delivered,reason});
}
