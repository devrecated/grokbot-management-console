// Bot profiles + content-free activity events from the box (bearer ROUTINE_LOG_TOKEN + bypass). Body {bots?, events}, gzip allowed.
// Events carry only ts, bot key, kind, tool/event name and optional target bot name. 7-day retention, 50k row cap.
import { sql, authed, ensureBots } from "@/lib/db";
import { gunzipSync } from "zlib";
export const dynamic="force-dynamic";
const KEEP_DAYS=7, MAX_ROWS=50000;
const s=(v,n)=>v==null?null:String(v).slice(0,n);
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  let b; try{ const buf=Buffer.from(await req.arrayBuffer()); b=JSON.parse((buf[0]===0x1f?gunzipSync(buf,{maxOutputLength:20e6}):buf).toString("utf8")); }
  catch{ return Response.json({error:"bad body"},{status:400}); }
  const q=sql(); await ensureBots(q);
  if(Array.isArray(b.bots)){ const L=b.bots.slice(0,500);
    await q`insert into bots(key,name,title,description,color,updated_at) select *, now() from unnest(${L.map(x=>s(x.key,40))}::text[],${L.map(x=>s(x.name,80))}::text[],${L.map(x=>s(x.title,120))}::text[],${L.map(x=>s(x.description,400))}::text[],${L.map(x=>s(x.color,20))}::text[])
      on conflict(key) do update set name=excluded.name,title=excluded.title,description=excluded.description,color=excluded.color,updated_at=now()`;
    await q`delete from bots where not (key = any(${L.map(x=>s(x.key,40))}::text[]))`; }
  const E=(Array.isArray(b.events)?b.events:[]).slice(0,5000).filter(e=>e&&e.bot).map(e=>({ts:isNaN(new Date(e.ts))?new Date().toISOString():new Date(e.ts).toISOString(),bot:s(e.bot,40),kind:s(e.kind,20),tool:s(e.tool,40),target:s(e.target,80)}));
  if(E.length) await q`insert into bot_events(ts,bot,kind,tool,target) select * from unnest(${E.map(e=>e.ts)}::timestamptz[],${E.map(e=>e.bot)}::text[],${E.map(e=>e.kind)}::text[],${E.map(e=>e.tool)}::text[],${E.map(e=>e.target)}::text[])`;
  await q`delete from bot_events where ts < now() - make_interval(days => ${KEEP_DAYS})`;
  await q`delete from bot_events where id <= (select id from bot_events order by id desc offset ${MAX_ROWS} limit 1)`;
  return Response.json({ok:true,events:E.length});
}
