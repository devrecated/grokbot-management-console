import { sql, ensure, authed } from "@/lib/db";
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const r=await req.json(); if(!r.routine_id) return Response.json({error:"routine_id required"},{status:400});
  const q=sql(); await ensure(q);
  await q`insert into routines values(${r.routine_id},${r.bot},${r.bot_id},${r.name},${r.schedule_or_trigger},${(r.purpose||"").slice(0,300)},${r.updated_at||new Date().toISOString()})
    on conflict(routine_id) do update set bot=excluded.bot,bot_id=excluded.bot_id,name=excluded.name,schedule_or_trigger=excluded.schedule_or_trigger,purpose=excluded.purpose,updated_at=excluded.updated_at`;
  return Response.json({ok:true});
}
