// Grok Bot-facing API (bearer ROUTINE_LOG_TOKEN + Vercel bypass header).
import { sql, ensureMessages, authed } from "@/lib/db";
export const dynamic="force-dynamic";
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const b=await req.json(); const text=String(b.text||"").trim().slice(0,8000);
  if(!b.thread_id||!text) return Response.json({error:"thread_id and text required"},{status:400});
  const role=b.role==="user"?"user":"grokbot";
  const q=sql(); await ensureMessages(q);
  const [f]=await q`select bot,routine_id from messages where thread_id=${b.thread_id} order by created_at limit 1`;
  const [m]=await q`insert into messages(thread_id,role,text,bot,routine_id) values(${b.thread_id},${role},${text},${b.bot??f?.bot??null},${b.routine_id??f?.routine_id??null}) returning id`;
  return Response.json({ok:true,message_id:String(m.id)});
}
export async function GET(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const tid=new URL(req.url).searchParams.get("thread_id");
  const q=sql(); await ensureMessages(q);
  const rows=tid?await q`select * from messages where thread_id=${tid} order by created_at,id`:await q`select * from messages order by created_at desc limit 200`;
  return Response.json({messages:rows});
}
