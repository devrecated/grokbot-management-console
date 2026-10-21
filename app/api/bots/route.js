// Bot profiles + content-free activity events from the box (bearer ROUTINE_LOG_TOKEN + bypass). Body {bots?, events}, gzip allowed.
// Events carry only ts, bot key, kind, tool/event name and optional target bot name. 7-day retention, 50k row cap.
import { sql, authed, ensureBots, heartbeat } from "@/lib/db";
import { gunzipSync } from "zlib";
export const dynamic="force-dynamic";
const KEEP_DAYS=7, MAX_ROWS=50000;
const s=(v,n)=>v==null?null:String(v).replace(/\u0000/g,"").slice(0,n);
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  let b; try{ const buf=Buffer.from(await req.arrayBuffer()); b=JSON.parse((buf[0]===0x1f?gunzipSync(buf,{maxOutputLength:20e6}):buf).toString("utf8")); }
  catch{ return Response.json({error:"bad body"},{status:400}); }
  const q=sql(); await ensureBots(q); await heartbeat(q,b.instance);
  if(Array.isArray(b.bots)){ const L=b.bots.slice(0,500);
    await q`insert into bots(key,name,title,description,color,updated_at) select *, now() from unnest(${L.map(x=>s(x.key,40))}::text[],${L.map(x=>s(x.name,80))}::text[],${L.map(x=>s(x.title,120))}::text[],${L.map(x=>s(x.description,400))}::text[],${L.map(x=>s(x.color,20))}::text[])
      on conflict(key) do update set name=excluded.name,title=excluded.title,description=excluded.description,color=excluded.color,updated_at=now()`;
    await q`delete from bots where not (key = any(${L.map(x=>s(x.key,40))}::text[]))`; }
  const E=(Array.isArray(b.events)?b.events:[]).slice(0,5000).filter(e=>e&&e.bot).map(e=>({ts:isNaN(new Date(e.ts))?new Date().toISOString():new Date(e.ts).toISOString(),bot:s(e.bot,40),kind:s(e.kind,20),tool:s(e.tool,40),target:s(e.target,80)}));
  if(E.length) await q`insert into bot_events(ts,bot,kind,tool,target) select * from unnest(${E.map(e=>e.ts)}::timestamptz[],${E.map(e=>e.bot)}::text[],${E.map(e=>e.kind)}::text[],${E.map(e=>e.tool)}::text[],${E.map(e=>e.target)}::text[])`;
  const T=(Array.isArray(b.tokens)?b.tokens:[]).slice(0,2000).filter(t=>t&&t.bot&&!isNaN(new Date(t.minute))).map(t=>({m:new Date(t.minute).toISOString(),bot:s(t.bot,40),model:s(t.model||"unknown",60),
    c:Math.max(0,Math.min(1e6,parseInt(t.calls)||0)),i:Math.max(0,Math.min(1e12,parseInt(t.input)||0)),o:Math.max(0,Math.min(1e12,parseInt(t.output)||0))}));
  if(T.length){ await q`insert into token_usage(minute,bot,model,calls,input,output) select * from unnest(${T.map(t=>t.m)}::timestamptz[],${T.map(t=>t.bot)}::text[],${T.map(t=>t.model)}::text[],${T.map(t=>t.c)}::int[],${T.map(t=>t.i)}::bigint[],${T.map(t=>t.o)}::bigint[])
      on conflict(minute,bot,model) do update set calls=token_usage.calls+excluded.calls, input=token_usage.input+excluded.input, output=token_usage.output+excluded.output`;
    if(Math.random()<0.05) await q`delete from token_usage where minute < now() - interval '90 days'`; }
  await q`delete from bot_events where ts < now() - make_interval(days => ${KEEP_DAYS})`;
  await q`delete from bot_events where id <= (select id from bot_events order by id desc offset ${MAX_ROWS} limit 1)`;
  return Response.json({ok:true,events:E.length,tokens:T.length});
}
