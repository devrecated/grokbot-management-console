import { sql, ensureLogs } from "@/lib/db";
import Nav from "../nav";
import Info from "./info";
export const dynamic="force-dynamic";
const PER=100;
const fmt=d=>new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"})+" ET";
const RANGES={"1h":1,"6h":6,"24h":24,"7d":168};
export default async function Logs({searchParams}){
  const p=await searchParams; const q=sql(); await ensureLogs(q);
  const source=p.source||"", level=p.level||"", range=RANGES[p.range]?p.range:"24h", text=(p.q||"").slice(0,200), page=Math.max(1,parseInt(p.page)||1);
  const hours=RANGES[range];
  const rows=await q`select id,ts,source,level,message from logs where ts > now() - make_interval(hours => ${hours})
    and (${source}='' or source=${source}) and (${level}='' or level=${level}) and (${text}='' or message ilike ${"%"+text.replace(/[%_\\]/g,"\\$&")+"%"})
    order by ts desc, id desc limit ${PER+1} offset ${(page-1)*PER}`;
  const [cat]=await q`select value from config where key='log_catalog'`;
  const sources=await q`select source, count(*)::int n from logs group by source order by source`;
  const more=rows.length>PER; const shown=rows.slice(0,PER);
  const link=o=>"/logs?"+new URLSearchParams({...(source&&{source}),...(level&&{level}),range,...(text&&{q:text}),...o}).toString();
  return <><Nav/><main><h2 style={{display:"flex",alignItems:"center",gap:8}}>Box logs <Info catalog={cat?.value||null}/></h2>
    <form className="filters" method="get">
      <select name="source" defaultValue={source}><option value="">All sources</option>{sources.map(s=><option key={s.source} value={s.source}>{s.source} ({s.n})</option>)}</select>
      <select name="level" defaultValue={level}><option value="">All levels</option>{["error","warn","info","debug"].map(l=><option key={l}>{l}</option>)}</select>
      <select name="range" defaultValue={range}>{Object.keys(RANGES).map(r=><option key={r} value={r}>Last {r}</option>)}</select>
      <input name="q" defaultValue={text} placeholder="Search text"/><button>Filter</button><a className="muted" href="/logs" style={{alignSelf:"center"}}>Reset</a></form>
    <div className="bot"><table><thead><tr><th style={{width:150}}>Time</th><th>Level</th><th>Source</th><th>Message</th></tr></thead><tbody>
      {shown.map(r=><tr key={r.id}><td className="muted" style={{whiteSpace:"nowrap"}}>{fmt(r.ts)}</td><td className={r.level==="warn"?"skipped":r.level==="error"?"error":"muted"}>{r.level}</td><td style={{whiteSpace:"nowrap"}}>{r.source}</td><td className="logmsg">{r.message}</td></tr>)}
      {!shown.length&&<tr><td colSpan={4} className="muted">No log lines match.</td></tr>}</tbody></table></div>
    <div className="pager">{page>1&&<a href={link({page:String(page-1)})}>← Newer</a>}<span className="muted">Page {page}</span>{more&&<a href={link({page:String(page+1)})}>Older →</a>}
      <span className="muted">Kept 7 days, max 200k lines. Shipped from the box every minute while it is on.</span></div></main></>;
}
