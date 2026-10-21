// Live CPU/memory. Dashboard: POST {on:true|false} sets config live_until (now + Settings live_minutes); GET ?since=ms returns samples.
// Box (Bearer token): PUT {instance_id, samples:[{t,cpu,mem,tot}]} from grugbox live; reply carries live_until so it knows when to stop.
// Nothing runs on the box unless Live is on; samples older than 15 minutes are pruned.
import { sql, authed, ensureHeartbeats, ensureLogs, liveUntil } from "@/lib/db";
import { getSettings } from "@/lib/settings";
export const dynamic="force-dynamic";
const setUntil=(q,v)=>q`insert into config(key,value,updated_at) values('live_until',${JSON.stringify(v)}::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`;
export async function POST(req){
  const b=await req.json().catch(()=>({})), q=sql(); await ensureLogs(q);
  const mins=(await getSettings(q)).live_minutes||5, until=b.on?Date.now()+mins*60e3:0;
  await setUntil(q,until); return Response.json({ok:true,live_until:until});
}
export async function GET(req){
  const q=sql(); await ensureLogs(q); await ensureHeartbeats(q);
  const since=Number(new URL(req.url).searchParams.get("since"))||Date.now()-5*60e3;
  const rows=await q`select instance_id, extract(epoch from ts)*1000 t, cpu, mem_used_mb mem, mem_total_mb tot from live_samples where ts > to_timestamp(${since/1000}) order by ts limit 1000`;
  return Response.json({live_until:await liveUntil(q),rows:rows.map(r=>({...r,t:Number(r.t)}))});
}
export async function PUT(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  const b=await req.json().catch(()=>null); if(!b||!/^[0-9a-f]{8,64}$/.test(b.instance_id||"")) return Response.json({error:"bad body"},{status:400});
  const n=(v,m)=>{ const x=Number(v); return Number.isFinite(x)&&x>=0&&x<=m?x:null; };
  const S=(Array.isArray(b.samples)?b.samples:[]).slice(0,60).filter(s=>Math.abs(Number(s.t)-Date.now())<3600e3);
  const q=sql(); await ensureLogs(q); await ensureHeartbeats(q);
  if(S.length) await q`insert into live_samples(instance_id,ts,cpu,mem_used_mb,mem_total_mb) select ${b.instance_id}::text, * from unnest(${S.map(s=>new Date(Number(s.t)).toISOString())}::timestamptz[],${S.map(s=>n(s.cpu,100))}::real[],${S.map(s=>n(s.mem,1e7))}::int[],${S.map(s=>n(s.tot,1e7))}::int[]) on conflict do nothing`;
  await q`delete from live_samples where ts < now() - interval '15 minutes'`;
  return Response.json({ok:true,until:Math.floor(await liveUntil(q)/1000)});
}
