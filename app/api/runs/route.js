import { sql, ensure, authed } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { alertRun } from "@/lib/alerts";
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const r=await req.json();
  if(!["ok","error","skipped"].includes(r.status)||!r.routine_id) return Response.json({error:"bad run"},{status:400});
  const q=sql(); await ensure(q);
  const dur=Number.isInteger(r.duration_s)&&r.duration_s>=0&&r.duration_s<1e6?r.duration_s:null;
  const [row]=await q`insert into runs(ts,bot,routine_id,status,summary,duration_s) values(${r.ts||new Date().toISOString()},${r.bot},${r.routine_id},${r.status},${(r.summary||"").slice(0,200)},${dur}) on conflict do nothing returning *`;
  // A duplicate POST of the same run hits the conflict and returns nothing, so it never alerts twice.
  const alert=row?await alertRun(q,await getSettings(q),row,new URL(req.url).origin).catch(()=>null):null;
  return Response.json({ok:true,...(alert?{alert}:{})});
}
