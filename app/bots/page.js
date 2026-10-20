import { sql, ensure, ensureBots } from "@/lib/db";
import Nav from "../nav";
export const dynamic="force-dynamic";
const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" ET":"never";
export default async function Bots(){
  const q=sql(); await ensure(q); await ensureBots(q);
  const bots=await q`select b.*, (select max(ts) from bot_events e where e.bot=b.key) last_at,
      (select count(*)::int from routines r where r.bot=b.name) routines from bots b order by last_at desc nulls last, name`;
  const counts=await q`select bot, tool, count(*)::int n from bot_events where ts > now() - interval '7 days' group by bot, tool order by n desc`;
  const recent=await q`select * from (select bot, ts, tool, target, row_number() over (partition by bot order by ts desc, id desc) rn from bot_events) x where rn<=8`;
  const by=(rows,k)=>rows.reduce((m,r)=>((m[r[k]]??=[]).push(r),m),{});
  const C=by(counts,"bot"), R=by(recent,"bot");
  return <><Nav active="bots"/><main><h2>Bots</h2>
    <p className="muted" style={{marginTop:0}}>Activity shows only what kind of action happened and when. No commands, messages or results leave the box.</p>
    <div className="cards">{bots.map(b=>{ const c=C[b.key]||[], total=c.reduce((a,x)=>a+x.n,0);
      return <div className="card" key={b.key}>
        <div style={{display:"flex",gap:10,alignItems:"center"}}><span className="av" style={{background:b.color||"#1d2330"}}>{(b.name||"?")[0]}</span>
          <div><b>{b.name}</b><div className="muted" style={{fontSize:12}}>{b.title}</div></div></div>
        <p className="desc">{b.description}</p>
        <div className="stats"><span>Last active <b>{fmt(b.last_at)}</b></span><span><b>{total}</b> actions (7d)</span><span><b>{b.routines}</b> routines</span></div>
        {c.length>0&&<div className="tools">{c.slice(0,6).map(x=><span key={x.tool} className="chip">{x.tool} {x.n}</span>)}</div>}
        {(R[b.key]||[]).length>0&&<ul className="recent">{R[b.key].map((e,i)=><li key={i}><span className="muted">{fmt(e.ts)}</span> {e.tool}{e.target?<> → <b>{e.target}</b></>:null}</li>)}</ul>}
      </div>; })}</div>
    {!bots.length&&<p className="muted">No bots synced yet.</p>}</main></>;
}
