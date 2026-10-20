// Top-bar box status: latest instance, last ping, dot colour; hover lists recent instances (hashed ids only).
import { sql, ensureHeartbeats } from "@/lib/db";
const ago=d=>{ const m=Math.round((Date.now()-new Date(d))/60000); return m<1?"just now":m<60?`${m}m ago`:m<1440?`${Math.round(m/60)}h ago`:`${Math.round(m/1440)}d ago`; };
const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" ET":"?";
export default async function BoxStatus(){
  let hb=[]; try{ const q=sql(); await ensureHeartbeats(q); hb=await q`select * from heartbeats order by last_ping desc limit 8`; }catch{}
  if(!hb.length) return <span className="box-st"><span className="dot grey"/>box: no ping yet</span>;
  const b=hb[0], m=(Date.now()-new Date(b.last_ping))/60000, c=m<2?"green":m<10?"amber":"grey";
  return <span className="box-st" tabIndex={0}><span className={"dot "+c}/>box: {b.hostname} · {b.instance_id.slice(0,6)} · last ping {ago(b.last_ping)}
    <span className="tip box-tip"><b>Recent instances</b><table><tbody>{hb.map(h=><tr key={h.instance_id}><td>{h.hostname}</td>
      <td title="instance (per boot)">inst {h.instance_id.slice(0,8)}</td><td title="machine (stable)">mach {(h.machine_id||"").slice(0,8)}</td>
      <td>boot {fmt(h.boot_time)}</td><td>{ago(h.last_ping)}</td><td>{h.version}</td></tr>)}</tbody></table></span></span>;
}
