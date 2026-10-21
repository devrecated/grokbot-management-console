// Box log ingest. Bearer ROUTINE_LOG_TOKEN (+ Vercel bypass header). Body: JSON array, optionally gzip (content-encoding: gzip).
// Body: JSON array of rows, or {rows, catalog}. catalog (what is tracked/excluded) is stored in config key log_catalog for the /logs tooltip.
// Keeps Neon small: retention from Settings (default 7 days) and a hard row cap, pruned on every ingest.
import { sql, authed, ensureLogs, heartbeat, liveUntil } from "@/lib/db";
import { gunzipSync } from "zlib";
import { getSettings } from "@/lib/settings";
export const dynamic="force-dynamic";
const MAX_ROWS=200000, MAX_BATCH=5000;
const LEVELS=["debug","info","warn","error"];
const clean=(v,n)=>String(v).replace(/\u0000/g,"").slice(0,n); // Postgres text cannot hold NUL bytes
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  let rows;
  try{ const buf=Buffer.from(await req.arrayBuffer());
    const raw=(req.headers.get("content-encoding")||"").includes("gzip")||buf[0]===0x1f?gunzipSync(buf,{maxOutputLength:20e6}):buf;
    rows=JSON.parse(raw.toString("utf8")); }catch{ return Response.json({error:"bad body"},{status:400}); }
  let catalog=null, inst=null;
  if(rows&&!Array.isArray(rows)){ inst=rows.instance||null; catalog=rows.catalog&&typeof rows.catalog==="object"?rows.catalog:null; rows=Array.isArray(rows.rows)?rows.rows:null; }
  if(!Array.isArray(rows)) return Response.json({error:"array required"},{status:400});
  rows=rows.slice(0,MAX_BATCH).filter(r=>r&&r.message).map(r=>{ const d=new Date(r.ts); return {
    ts:isNaN(d)?new Date().toISOString():d.toISOString(), source:clean(r.source||"unknown",80),
    level:LEVELS.includes(r.level)?r.level:"info", message:clean(r.message,2000)}; });
  const q=sql(); await ensureLogs(q); const iid=await heartbeat(q,inst);
  if(catalog){ const c=JSON.stringify(catalog); if(c.length<50000) await q`insert into config(key,value,updated_at) values('log_catalog',${c}::jsonb,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`; }
  if(rows.length) await q`insert into logs(ts,source,level,message,instance_id) select *, ${iid}::text from unnest(${rows.map(r=>r.ts)}::timestamptz[],${rows.map(r=>r.source)}::text[],${rows.map(r=>r.level)}::text[],${rows.map(r=>r.message)}::text[])`;
  if(rows.length){ const keep=(await getSettings(q)).log_retention_days;
  await q`delete from logs where ts < now() - make_interval(days => ${keep})`;
  await q`delete from logs where id <= (select id from logs order by id desc offset ${MAX_ROWS} limit 1)`; }
  return Response.json({ok:true,inserted:rows.length,live_until:await liveUntil(q)});
}

// Dashboard read (Vercel Authentication protects it). All filters are server-side:
// instance = comma list of instance ids; source,level = comma lists to include; xsource,xlevel = comma lists to exclude; q = contains; re = regex (Postgres ~*);
// range=1h|6h|24h|7d or from/to ISO; around=<id> (+-1 min of that row); before/after=<id> for paging and live.
const RANGES={"1h":1,"6h":6,"24h":24,"7d":168}, PER=200;
const list=v=>(v||"").split(",").map(x=>x.trim()).filter(Boolean).slice(0,50);
export async function GET(req){
  const p=new URL(req.url).searchParams, q=sql(); await ensureLogs(q);
  const inst=list(p.get("instance")), src=list(p.get("source")), lvl=list(p.get("level")), xsrc=list(p.get("xsource")), xlvl=list(p.get("xlevel"));
  const text=(p.get("q")||"").slice(0,200).replace(/[%_\\]/g,"\\$&"), re=(p.get("re")||"").slice(0,200);
  const before=parseInt(p.get("before"))||0, after=parseInt(p.get("after"))||0, around=parseInt(p.get("around"))||0;
  let from=new Date(Date.now()-(RANGES[p.get("range")]||24)*3600e3), to=new Date(Date.now()+60e3);
  if(p.get("from")&&!isNaN(new Date(p.get("from")))) from=new Date(p.get("from"));
  if(p.get("to")&&!isNaN(new Date(p.get("to")))) to=new Date(p.get("to"));
  if(around){ const [a]=await q`select ts from logs where id=${around}`; if(a){ from=new Date(new Date(a.ts)-60e3); to=new Date(+new Date(a.ts)+60e3); } }
  let rows;
  try{ rows=await q`select id,ts,source,level,message,instance_id from logs where ts >= ${from.toISOString()} and ts <= ${to.toISOString()}
    and (cardinality(${inst}::text[])=0 or instance_id = any(${inst}::text[])) and (cardinality(${src}::text[])=0 or source = any(${src}::text[])) and (cardinality(${lvl}::text[])=0 or level = any(${lvl}::text[]))
    and not (source = any(${xsrc}::text[])) and not (level = any(${xlvl}::text[]))
    and (${text}='' or message ilike ${"%"+text+"%"}) and (${re}='' or message ~* ${re})
    and (${before}=0 or id<${before}) and (${after}=0 or id>${after}) order by id desc limit ${around?2000:PER}`; }
  catch(e){ return Response.json({error:"bad filter (check the regex)"},{status:400}); }
  if(p.get("meta")!=="1") return Response.json({rows,per:PER});
  const facets=await q`select source, level, coalesce(instance_id,'') instance_id, count(*)::int n from logs where ts >= ${from.toISOString()} and ts <= ${to.toISOString()} group by source, level, instance_id`;
  const [cat]=await q`select value from config where key='log_catalog'`;
  return Response.json({rows,per:PER,facets,catalog:cat?.value||null});
}
