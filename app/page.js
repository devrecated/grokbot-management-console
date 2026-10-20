import { sql, ensure, ensureMessages } from "@/lib/db";
import Runs from "./runs";
import Chat from "./chat";
export const dynamic="force-dynamic";
const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"})+" ET":"never";
export default async function Page(){
  const q=sql(); await ensure(q); await ensureMessages(q);
  const reg=await q`select * from routines order by name`;
  const runs=(await q`select * from runs order by ts desc limit 1000`).map(r=>({...r,ts:String(r.ts),when:fmt(r.ts)}));
  const last={}; for(const r of runs) last[r.routine_id]??=r;
  const byBot={}; for(const r of reg)(byBot[r.bot]??=[]).push(r);
  for(const r of runs) if(!reg.some(x=>x.routine_id===r.routine_id)&&!(byBot[r.bot]??=[]).some(x=>x.routine_id===r.routine_id)) byBot[r.bot].push({routine_id:r.routine_id,name:"(unregistered)"});
  const names=Object.fromEntries(reg.map(r=>[r.routine_id,r.name]));
  const routines=reg.map(r=>({bot:r.bot,routine_id:r.routine_id,name:r.name}));
  return <><header><b>Routines &amp; runs</b><span className="muted">Updated {fmt(new Date())}</span></header>
  <main><h2>Chat with Grok Bot</h2><Chat routines={routines}/>
  <h2>Routines by bot</h2>
  {Object.keys(byBot).sort().map(b=><div className="bot" key={b}><h3>{b}</h3><table><thead><tr><th>Routine</th><th>Schedule/trigger</th><th>Purpose</th><th>Last run</th></tr></thead><tbody>
   {byBot[b].map(r=>{const l=last[r.routine_id];return <tr key={r.routine_id}><td>{r.name}<div className="muted">{r.routine_id}</div></td><td>{r.schedule_or_trigger}</td><td>{r.purpose}</td>
   <td>{l?<><span className={l.status}>{l.status}</span> {l.when}</>:<span className="muted">never</span>}</td></tr>})}</tbody></table></div>)}
  {!reg.length&&<p className="muted">No routines registered yet.</p>}
  <h2>Runs</h2><Runs runs={runs} names={names}/></main></>;
}
