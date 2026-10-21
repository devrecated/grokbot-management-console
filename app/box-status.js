// Top-bar box status: latest instance, last ping, dot colour; hover lists recent instances (hashed ids only).
import { sql, ensureHeartbeats } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { tzLabel } from "@/lib/tz";
const ago=d=>{ const m=Math.round((Date.now()-new Date(d))/60000); return m<1?"just now":m<60?`${m}m ago`:m<1440?`${Math.round(m/60)}h ago`:`${Math.round(m/1440)}d ago`; };
export default async function BoxStatus(){
  let hb=[], st={timezone:"America/New_York",stale_box_minutes:10,heartbeat_interval_s:60}; try{ const q=sql(); await ensureHeartbeats(q); hb=await q`select * from heartbeats order by last_ping desc limit 8`; st=await getSettings(q); }catch{}
  const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:st.timezone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" "+tzLabel(st.timezone):"?";
  if(!hb.length) return <span className="box-st"><span className="dot grey"/>box: no ping yet</span>;
  const b=hb[0], m=(Date.now()-new Date(b.last_ping))/60000, c=m<Math.max(2,2*st.heartbeat_interval_s/60)?"green":m<st.stale_box_minutes?"amber":"grey";
  return <a href="/box" className="box-st" tabIndex={0} style={{color:"inherit",textDecoration:"none"}}><span className={"dot "+c}/>box: {b.hostname} · {b.instance_id.slice(0,6)} · last ping {ago(b.last_ping)}
    <span className="tip box-tip"><b>Recent instances</b><table><tbody>{hb.map(h=><tr key={h.instance_id}><td>{h.hostname}</td>
      <td title="instance (per boot)">inst {h.instance_id.slice(0,8)}</td><td title="machine (stable)">mach {(h.machine_id||"").slice(0,8)}</td>
      <td>boot {fmt(h.boot_time)}</td><td>{ago(h.last_ping)}</td><td>{h.version}</td></tr>)}</tbody></table></span></a>;
}
