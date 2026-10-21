import { sql, ensure, ensureMessages } from "@/lib/db";
import Runs from "./runs";
import Nav from "./nav";
import Refresher from "./refresher";
import { getSettings } from "@/lib/settings";
import RoutineRow from "./routine-row";
import PauseAll from "./pause-all";
import { tzLabel } from "@/lib/tz";
export const dynamic="force-dynamic";
export default async function Page(){
  const q=sql(); await ensure(q); await ensureMessages(q);
  const tz=(await getSettings(q)).timezone, tzl=tzLabel(tz);
  const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,dateStyle:"medium",timeStyle:"short"})+" "+tzl:"never";
  const reg=await q`select * from routines order by name`;
  const runs=(await q`select * from runs order by ts desc limit 1000`).map(r=>({...r,ts:String(r.ts),when:fmt(r.ts)}));
  const last={}; for(const r of runs) last[r.routine_id]??=r;
  const byBot={}; for(const r of reg)(byBot[r.bot]??=[]).push(r);
  for(const r of runs) if(!reg.some(x=>x.routine_id===r.routine_id)&&!(byBot[r.bot]??=[]).some(x=>x.routine_id===r.routine_id)) byBot[r.bot].push({routine_id:r.routine_id,name:"(unregistered)"});
  const names=Object.fromEntries(reg.map(r=>[r.routine_id,r.name]));
  const routines=reg.map(r=>({bot:r.bot,routine_id:r.routine_id,name:r.name}));
  return <><Refresher pending={reg.some(r=>r.pending_action||(r.prompt_requested_at&&Date.now()-new Date(r.prompt_requested_at)<600000))}/><Nav active="routines" right={<span className="muted">Updated {fmt(new Date())}</span>}/>
  <main>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Routines by bot</h2><PauseAll active={reg.filter(r=>r.status==="active"&&!r.pending_action).length} paused={reg.filter(r=>r.status==="paused"&&!r.pending_action).length}/></div>
  {Object.keys(byBot).sort().map(b=><div className="bot" key={b}><h3>{b}</h3><table><thead><tr><th>Routine</th><th>Schedule/trigger</th><th>Purpose</th><th>Last run</th><th>Controls</th></tr></thead><tbody>
   {byBot[b].map(r=>r.bot_id===undefined&&r.name==="(unregistered)"?<tr key={r.routine_id}><td>{r.name}<div className="muted">{r.routine_id}</div></td><td colSpan={4}/></tr>:<RoutineRow key={r.routine_id} r={{routine_id:r.routine_id,name:r.name,bot:r.bot,schedule_or_trigger:r.schedule_or_trigger,purpose:r.purpose,status:r.status,pending_action:r.pending_action,prompt_text:r.prompt_text,prompt_fetched_at:r.prompt_fetched_at?String(r.prompt_fetched_at):null,prompt_requested_at:r.prompt_requested_at?String(r.prompt_requested_at):null,tz,tzl}} last={last[r.routine_id]?{status:last[r.routine_id].status,when:last[r.routine_id].when}:null}/>)}</tbody></table></div>)}
  {!reg.length&&<p className="muted">No routines registered yet.</p>}
  <h2>Runs</h2><Runs runs={runs} names={names}/></main></>;
}
