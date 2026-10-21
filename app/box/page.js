// Box runtime log: one session per boot (instance_id). Start = boot time, end = last heartbeat.
// Bots per session come from bot activity inside that time window. CPU/memory are heartbeat samples (CPU = average since the previous sample), bucketed by time.
import { sql, ensureHeartbeats, ensureBots } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { tzLabel, SHORT } from "@/lib/tz";
import Nav from "../nav";
import Live from "./live";
import { liveUntil } from "@/lib/db";
export const dynamic="force-dynamic";
const dur=s=>{ s=Math.max(0,Math.round(s/60)); return s<60?`${s}m`:s<1440?`${Math.floor(s/60)}h ${s%60}m`:`${Math.floor(s/1440)}d ${Math.floor(s%1440/60)}h`; };
// Time-based chart: x = sample time, gaps (box off / loop stopped) break the line, faint line = max per bucket.
function Chart({pts,t0,t1,max,color,unit,fmt,w=220,h=44}){
  const v=pts.filter(p=>p.avg!=null); if(!v.length||t1<=t0) return <span className="muted">-</span>;
  const X=t=>((t-t0)/(t1-t0)*(w-2)+1).toFixed(1), Y=p=>(h-12-(Math.min(p,max)/max)*(h-14)+1).toFixed(1);
  const step=(t1-t0)/120, segs=[]; let cur=[], last=null;
  for(const p of v){ if(last!=null&&p.t-last>Math.max(3*step,600)){ segs.push(cur); cur=[]; } cur.push(p); last=p.t; } segs.push(cur);
  const line=(k)=>segs.map((sg,i)=>sg.length===1?<circle key={k+i} cx={X(sg[0].t)} cy={Y(sg[0][k])} r="1.5" fill={color}/>:
    <polyline key={k+i} points={sg.map(p=>`${X(p.t)},${Y(p[k])}`).join(" ")} fill="none" stroke={color} strokeWidth={k==="avg"?1.5:1} opacity={k==="avg"?1:.35}/>);
  return <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}><rect width={w} height={h-10} fill="#f6f7f9" rx="3"/>
    {v.some(p=>p.max!=null)&&line("max")}{line("avg")}
    <text x="2" y="9" fontSize="8" fill="#888">{max}{unit}</text><text x="1" y={h-1} fontSize="8" fill="#888">{fmt(t0)}</text><text x={w-1} y={h-1} fontSize="8" fill="#888" textAnchor="end">{fmt(t1)}</text></svg>;
}
export default async function Box(){
  const q=sql(); await ensureHeartbeats(q); await ensureBots(q); const st=await getSettings(q), tz=st.timezone, tzl=tzLabel(tz);
  const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,...SHORT}):"?";
  const hm=t=>new Date(t).toLocaleString("en-US",{timeZone:tz,month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit"});
  const lu=await liveUntil(q), wait=Math.min(st.ship_interval_s,st.heartbeat_interval_s);
  const ses=await q`select instance_id, machine_id, hostname, version, os_info, coalesce(boot_time, first_seen) started, first_seen, last_ping from heartbeats order by last_ping desc limit 20`;
  const ids=ses.map(s=>s.instance_id);
  // Buckets span the samples themselves (not the heartbeat row's first_seen), ~120 per session, keeping avg and max.
  const samples=ids.length?await q`with r as (select instance_id, min(ts) a, max(ts) z from box_samples where instance_id = any(${ids}::text[]) group by 1)
      select s.instance_id, extract(epoch from r.a + make_interval(secs => floor(extract(epoch from s.ts - r.a)/greatest(30, extract(epoch from r.z - r.a)/120)) * greatest(30, extract(epoch from r.z - r.a)/120)))*1000 t,
      avg(s.cpu)::real cpu, max(s.cpu)::real cpu_max, avg(s.mem_used_mb)::int mem, max(s.mem_used_mb) mem_max, max(s.mem_total_mb) tot
      from box_samples s join r using(instance_id) group by 1,2 order by 1,2`:[];
  const stats=ids.length?await q`select instance_id, count(*)::int n, avg(cpu)::real cpu_avg, max(cpu)::real cpu_max, avg(mem_used_mb)::int mem_avg, max(mem_used_mb) mem_max, max(load1)::real load_max, avg(agent_cpu)::real ag_cpu, max(agent_cpu)::real ag_cpu_max, max(agent_rss_mb)::real ag_rss, avg(agent_pass_ms)::int ag_ms, count(agent_cpu)::int ag_n from box_samples where instance_id = any(${ids}::text[]) group by 1`:[];
  const bots=ids.length?await q`select h.instance_id, e.bot, min(e.ts) first_at, max(e.ts) last_at, count(*)::int n from heartbeats h join bot_events e on e.ts between coalesce(h.boot_time,h.first_seen) and h.last_ping + interval '2 minutes'
      where h.instance_id = any(${ids}::text[]) group by 1,2 order by 1, min(e.ts)`:[];
  const by=(rows)=>rows.reduce((m,r)=>((m[r.instance_id]??=[]).push(r),m),{});
  const S=by(samples), B=by(bots), T=Object.fromEntries(stats.map(r=>[r.instance_id,r]));
  const fresh=ses[0]&&Date.now()-new Date(ses[0].last_ping)<st.stale_box_minutes*60e3;
  return <><Nav active="box"/><main><h2>Box runtime</h2>
    <p className="muted" style={{marginTop:0}}>One row per boot. Start is boot time, end is the last heartbeat (every {st.heartbeat_interval_s<60?`${st.heartbeat_interval_s}s`:`${st.heartbeat_interval_s/60} min`}, change it in <a href="/settings">Settings</a>). Times in {tzl}. Samples kept 14 days, sessions 30 days.</p>
    {!ses.length&&<p className="muted">No heartbeat yet. Install the box scripts and start the log loop.</p>}
    <Live initialUntil={lu} wait={wait}/>
    <table><thead><tr><th>Session</th><th>Start → end</th><th>Up</th><th>OS</th><th>Bots on the box</th><th>CPU % <span className="muted">(avg, faint = peak)</span></th><th>Memory % of RAM</th><th>Console agent <span className="muted">(grugbox itself)</span></th></tr></thead><tbody>
    {ses.map((s,i)=>{ const o=s.os_info||{}, t=T[s.instance_id], sm=S[s.instance_id]||[], live=i===0&&fresh;
      return <tr key={s.instance_id}>
        <td><b>{s.hostname}</b>{live&&<span className="pill info" style={{marginLeft:6}}>live</span>}<div className="muted" title="instance id (per boot) · machine id">inst {s.instance_id.slice(0,8)} · mach {(s.machine_id||"").slice(0,8)}</div><div className="muted">{s.version}</div></td>
        <td style={{whiteSpace:"nowrap"}}>{fmt(s.started)}<div className="muted">→ {live?"now":fmt(s.last_ping)}</div></td>
        <td>{dur((new Date(s.last_ping)-new Date(s.started))/1000)}</td>
        <td style={{fontSize:13}}>{o.distro?<div className="kv"><span className="muted">distro</span><span>{o.distro}</span><span className="muted">kernel</span><span>{o.kernel} {o.arch}</span><span className="muted">cpu</span><span>{o.cores} cores</span><span className="muted">ram</span><span>{(o.ram_mb/1024).toFixed(1)} GB</span></div>:<span className="muted">not reported</span>}</td>
        <td style={{fontSize:13}}>{(B[s.instance_id]||[]).length?<ul className="recent">{B[s.instance_id].map(b=><li key={b.bot}><b>{b.bot}</b> <span className="muted">{fmt(b.first_at)} – {fmt(b.last_at)} · {b.n} actions</span></li>)}</ul>:<span className="muted">none</span>}</td>
        <td><Chart pts={sm.map(x=>({t:Number(x.t),avg:x.cpu,max:x.cpu_max}))} t0={Number(sm[0]?.t)} t1={Number(sm.at(-1)?.t)} max={100} unit="%" fmt={hm} color="#c5221f"/>{t&&<div className="muted">avg {t.cpu_avg?.toFixed(0)}% · peak {t.cpu_max?.toFixed(0)}% · load {t.load_max}</div>}</td>
        <td><Chart pts={sm.map(x=>({t:Number(x.t),avg:x.tot?100*x.mem/x.tot:null,max:x.tot?100*x.mem_max/x.tot:null}))} t0={Number(sm[0]?.t)} t1={Number(sm.at(-1)?.t)} max={100} unit="%" fmt={hm} color="#1a73e8"/>{t&&<div className="muted">avg {(t.mem_avg/1024).toFixed(1)} · peak {(t.mem_max/1024).toFixed(1)} of {((sm[0]?.tot||o.ram_mb||0)/1024).toFixed(0)} GB · {t.n} samples</div>}</td>
        <td style={{fontSize:13}}>{t?.ag_n?<div className="kv"><span className="muted">cpu</span><span>{t.ag_cpu?.toFixed(2)}% of a core <span className="muted">(peak {t.ag_cpu_max?.toFixed(2)})</span></span><span className="muted">memory</span><span>{t.ag_rss?.toFixed(1)} MB peak</span><span className="muted">pass</span><span>{t.ag_ms} ms avg</span></div>:<span className="muted">not reported (older agent)</span>}</td></tr>; })}
    </tbody></table></main></>;
}
