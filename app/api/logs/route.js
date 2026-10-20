// Box log ingest. Bearer ROUTINE_LOG_TOKEN (+ Vercel bypass header). Body: JSON array, optionally gzip (content-encoding: gzip).
// Keeps Neon tiny: 7-day retention and a hard row cap, pruned on every ingest.
import { sql, authed, ensureLogs } from "@/lib/db";
import { gunzipSync } from "zlib";
export const dynamic="force-dynamic";
const KEEP_DAYS=7, MAX_ROWS=50000, MAX_BATCH=5000;
const LEVELS=["debug","info","warn","error"];
export async function POST(req){
  if(!authed(req)) return Response.json({error:"unauthorized"},{status:401});
  let rows;
  try{ const buf=Buffer.from(await req.arrayBuffer());
    const raw=(req.headers.get("content-encoding")||"").includes("gzip")||buf[0]===0x1f?gunzipSync(buf,{maxOutputLength:20e6}):buf;
    rows=JSON.parse(raw.toString("utf8")); }catch{ return Response.json({error:"bad body"},{status:400}); }
  if(!Array.isArray(rows)) return Response.json({error:"array required"},{status:400});
  rows=rows.slice(0,MAX_BATCH).filter(r=>r&&r.message).map(r=>{ const d=new Date(r.ts); return {
    ts:isNaN(d)?new Date().toISOString():d.toISOString(), source:String(r.source||"unknown").slice(0,80),
    level:LEVELS.includes(r.level)?r.level:"info", message:String(r.message).slice(0,2000)}; });
  const q=sql(); await ensureLogs(q);
  if(rows.length) await q`insert into logs(ts,source,level,message) select * from unnest(${rows.map(r=>r.ts)}::timestamptz[],${rows.map(r=>r.source)}::text[],${rows.map(r=>r.level)}::text[],${rows.map(r=>r.message)}::text[])`;
  await q`delete from logs where ts < now() - make_interval(days => ${KEEP_DAYS})`;
  await q`delete from logs where id <= (select id from logs order by id desc offset ${MAX_ROWS} limit 1)`;
  return Response.json({ok:true,inserted:rows.length});
}
