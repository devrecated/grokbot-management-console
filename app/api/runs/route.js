import { sql, ensure, authed } from "@/lib/db";
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const r=await req.json();
  if(!["ok","error","skipped"].includes(r.status)||!r.routine_id) return Response.json({error:"bad run"},{status:400});
  const q=sql(); await ensure(q);
  await q`insert into runs(ts,bot,routine_id,status,summary) values(${r.ts||new Date().toISOString()},${r.bot},${r.routine_id},${r.status},${(r.summary||"").slice(0,200)}) on conflict do nothing`;
  return Response.json({ok:true});
}
