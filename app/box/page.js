// Box runtime log: one session per boot (instance_id). Start = boot time, end = last heartbeat.
// Bots per session come from bot activity inside that time window. CPU/memory are heartbeat samples, bucketed to ~100 points.
import { sql, ensureHeartbeats, ensureBots } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { tzLabel, SHORT } from "@/lib/tz";
import Nav from "../nav";
export const dynamic="force-dynamic";
const dur=s=>{ s=Math.max(0,Math.round(s/60)); return s<60?`${s}m`:s<1440?`${Math.floor(s/60)}h ${s%60}m`:`${Math.floor(s/1440)}d ${Math.floor(s%1440/60)}h`; };
function Spark({pts,max,color,w=160,h=28}){
  const v=pts.filter(p=>p!=null); if(v.length<2) return <span className="muted">-</span>;
  const d=pts.map((p,i)=>p==null?null:`${(i/(pts.length-1)*w).toFixed(1)},${(h-1-(Math.min(p,max)/max)*(h-2)).toFixed(1)}`).filter(Boolean).join(" ");
  return <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}><rect width={w} height={h} fill="#f6f7f9" rx="3"/><polyline points={d} fill="none" stroke={color} strokeWidth="1.5"/></svg>;
}
export default async function Box(){
  const q=sql(); await ensureHeartbeats(q); await ensureBots(q); const st=await getSettings(q), tz=st.timezone, tzl=tzLabel(tz);
  const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,...SHORT}):"?";
  const ses=await q`select instance_id, machine_id, hostname, version, os_info, coalesce(boot_time, first_seen) started, first_seen, last_ping from heartbeats order by last_ping desc limit 20`;
  const ids=ses.map(s=>s.instance_id);
  const samples=ids.length?await q`select s.instance_id, floor(extract(epoch from s.ts - h.first_seen)/greatest(60, extract(epoch from h.last_ping - h.first_seen)/100))::int b,
      avg(s.cpu)::real cpu, avg(s.mem_used_mb)::int mem, max(s.mem_total_mb) tot from box_samples s join heartbeats h using(instance_id) where s.instance_id = any(${ids}::text[]) group by 1,2 order by 1,2`:[];
  const stats=ids.length?await q`select instance_id, count(*)::int n, avg(cpu)::real cpu_avg, max(cpu)::real cpu_max, avg(mem_used_mb)::int mem_avg, max(mem_used_mb) mem_max, max(load1)::real load_max from box_samples where instance_id = any(${ids}::text[]) group by 1`:[];
  const bots=ids.length?await q`select h.instance_id, e.bot, min(e.ts) first_at, max(e.ts) last_at, count(*)::int n from heartbeats h join bot_events e on e.ts between coalesce(h.boot_time,h.first_seen) and h.last_ping + interval '2 minutes'
      where h.instance_id = any(${ids}::text[]) group by 1,2 order by 1, min(e.ts)`:[];
  const by=(rows)=>rows.reduce((m,r)=>((m[r.instance_id]??=[]).push(r),m),{});
  const S=by(samples), B=by(bots), T=Object.fromEntries(stats.map(r=>[r.instance_id,r]));
  const fresh=ses[0]&&Date.now()-new Date(ses[0].last_ping)<st.stale_box_minutes*60e3;
  return <><Nav active="box"/><main><h2>Box runtime</h2>
    <p className="muted" style={{marginTop:0}}>One row per boot. Start is boot time, end is the last heartbeat (every {st.heartbeat_interval_s<60?`${st.heartbeat_interval_s}s`:`${st.heartbeat_interval_s/60} min`}, change it in <a href="/settings">Settings</a>). Times in {tzl}. Samples kept 14 days, sessions 30 days.</p>
    {!ses.length&&<p className="muted">No heartbeat yet. Install the box scripts and start the log loop.</p>}
    <table><thead><tr><th>Session</th><th>Start → end</th><th>Up</th><th>OS</th><th>Bots on the box</th><th>CPU %</th><th>Memory</th></tr></thead><tbody>
    {ses.map((s,i)=>{ const o=s.os_info||{}, t=T[s.instance_id], sm=S[s.instance_id]||[], live=i===0&&fresh;
      return <tr key={s.instance_id}>
        <td><b>{s.hostname}</b>{live&&<span className="pill info" style={{marginLeft:6}}>live</span>}<div className="muted" title="instance id (per boot) · machine id">inst {s.instance_id.slice(0,8)} · mach {(s.machine_id||"").slice(0,8)}</div><div className="muted">{s.version}</div></td>
        <td style={{whiteSpace:"nowrap"}}>{fmt(s.started)}<div className="muted">→ {live?"now":fmt(s.last_ping)}</div></td>
        <td>{dur((new Date(s.last_ping)-new Date(s.started))/1000)}</td>
        <td style={{fontSize:13}}>{o.distro?<div className="kv"><span className="muted">distro</span><span>{o.distro}</span><span className="muted">kernel</span><span>{o.kernel} {o.arch}</span><span className="muted">cpu</span><span>{o.cores} cores</span><span className="muted">ram</span><span>{(o.ram_mb/1024).toFixed(1)} GB</span></div>:<span className="muted">not reported</span>}</td>
        <td style={{fontSize:13}}>{(B[s.instance_id]||[]).length?<ul className="recent">{B[s.instance_id].map(b=><li key={b.bot}><b>{b.bot}</b> <span className="muted">{fmt(b.first_at)} – {fmt(b.last_at)} · {b.n} actions</span></li>)}</ul>:<span className="muted">none</span>}</td>
        <td><Spark pts={sm.map(x=>x.cpu)} max={100} color="#c5221f"/>{t&&<div className="muted">avg {t.cpu_avg?.toFixed(0)} · max {t.cpu_max?.toFixed(0)} · load {t.load_max}</div>}</td>
        <td><Spark pts={sm.map(x=>x.mem)} max={sm[0]?.tot||o.ram_mb||1} color="#1a73e8"/>{t&&<div className="muted">avg {(t.mem_avg/1024).toFixed(1)} · max {(t.mem_max/1024).toFixed(1)} GB · {t.n} samples</div>}</td></tr>; })}
    </tbody></table></main></>;
}
