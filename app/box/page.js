// Box page: current box at the top, CPU and memory charts (all sessions on one time axis), then a small sessions table.
// A session = one boot (instance_id). The box VM can also be paused and resumed without a reboot; those show up as
// "sleeps": gaps in heartbeats longer than 2x the heartbeat interval inside one session (grugbox also reports how long
// the clock jumped, from /proc/stat btime drift).
import { sql, ensureHeartbeats, ensureBots, liveUntil } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { tzLabel, SHORT } from "@/lib/tz";
import Nav from "../nav";
import Charts from "./charts";
export const dynamic="force-dynamic";
const RANGES={"6h":6,"24h":24,"7d":168,"14d":336};
const dur=s=>{ s=Math.max(0,Math.round(s/60)); return s<60?`${s}m`:s<1440?`${Math.floor(s/60)}h ${s%60}m`:`${Math.floor(s/1440)}d ${Math.floor(s%1440/60)}h`; };
export default async function Box({searchParams}){
  const sp=await searchParams, r=RANGES[sp?.r]?sp.r:"24h";
  const q=sql(); await ensureHeartbeats(q); await ensureBots(q); const st=await getSettings(q), tz=st.timezone;
  const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,...SHORT}):"?";
  const hb=st.heartbeat_interval_s, gap=2*hb;
  const ses=await q`select instance_id, hostname, version, os_info, coalesce(boot_time, first_seen) started, first_seen, last_ping from heartbeats order by last_ping desc limit 20`;
  const cur=ses[0], fresh=cur&&Date.now()-new Date(cur.last_ping)<st.stale_box_minutes*60e3;
  // chart data: buckets of max(heartbeat, span/1500) over the range, all sessions
  const hours=RANGES[r], bw=Math.max(hb, Math.round(hours*3600/1500));
  const pts=await q`select floor(extract(epoch from ts)/${bw})*${bw} t, avg(cpu)::real cpu, max(cpu)::real cpu_max, avg(100.0*mem_used_mb/nullif(mem_total_mb,0))::real mem, max(mem_total_mb) tot
    from box_samples where ts > now() - make_interval(hours => ${hours}) group by 1 order by 1`;
  // sleeps: heartbeat gaps > 2x interval inside a session
  const sl=await q`select instance_id, count(*)::int n, sum(g)::real secs, max(slept)::real slept from (
      select instance_id, extract(epoch from ts - lag(ts) over (partition by instance_id order by ts)) g, slept_s slept from box_samples) x
    where g > ${gap} group by 1`;
  const SL=Object.fromEntries(sl.map(x=>[x.instance_id,x]));
  const ids=ses.map(s=>s.instance_id);
  const bots=ids.length?await q`select h.instance_id, string_agg(distinct coalesce(b.name,e.bot), ', ') names, count(*)::int n from heartbeats h
      join bot_events e on e.ts between coalesce(h.boot_time,h.first_seen) and h.last_ping + interval '2 minutes' left join bots b on b.key=e.bot
      where h.instance_id = any(${ids}::text[]) group by 1`:[];
  const BT=Object.fromEntries(bots.map(b=>[b.instance_id,b]));
  const ag=cur?(await q`select cpu, mem_used_mb, mem_total_mb, agent_cpu, agent_rss_mb from box_samples where instance_id=${cur.instance_id} order by ts desc limit 1`)[0]:null;
  const o=cur?.os_info||{}, lu=await liveUntil(q), wait=Math.min(st.ship_interval_s,hb);
  const up=cur?(new Date(cur.last_ping)-new Date(cur.started))/1000:0, s0=cur&&SL[cur.instance_id];
  const data=[pts.map(p=>Number(p.t)),pts.map(p=>p.cpu),pts.map(p=>p.cpu_max),pts.map(p=>p.mem)];
  return <><Nav/><main>
    {!cur?<div className="card">No box has checked in yet. Run <code>install.sh</code> on the box.</div>:<>
    <div className="card boxsum">
      <div><span className={"dot "+(fresh?"ok":"off")}/> <b style={{fontSize:18}}>{cur.hostname}</b> <span className="muted">{fresh?"online":"offline"} · last ping {fmt(cur.last_ping)}</span></div>
      <div className="sumgrid">
        <div><span className="muted">up</span> {dur(up)} <span className="muted">since boot {fmt(cur.started)}{s0?` · slept ${s0.n}× (${dur(s0.secs)})`:""}</span></div>
        <div><span className="muted">os</span> {o.distro?`${o.distro} · ${o.kernel} · ${o.cores} cores · ${(o.ram_mb/1024).toFixed(0)} GB`:"not reported"}</div>
        <div><span className="muted">now</span> {ag?`CPU ${ag.cpu?.toFixed(0)??"-"}% · memory ${(ag.mem_used_mb/1024).toFixed(1)} / ${(ag.mem_total_mb/1024).toFixed(0)} GB`:"-"}</div>
        <div><span className="muted">grugbox</span> {ag?.agent_rss_mb!=null?`${ag.agent_cpu?.toFixed(2)??"-"}% of a core · ${ag.agent_rss_mb.toFixed(1)} MB`:"not reported"}</div>
      </div>
    </div>
    <div className="card">
      <div className="charthead"><b>CPU and memory</b>
        <span className="ranges">{Object.keys(RANGES).map(k=><a key={k} href={`/box?r=${k}`} className={k===r?"on":""}>{k}</a>)}</span></div>
      <Charts data={data} tz={tz} gap={Math.max(gap,2*bw)} initialUntil={lu} wait={wait}/>
      <div className="muted" style={{fontSize:12}}>Times in {tzLabel(tz)}. Breaks = no heartbeat for over {dur(Math.max(gap,2*bw))} (box off, asleep, or loop stopped). Faint line = peak CPU.</div>
    </div></>}
    <div className="card"><b>Sessions</b> <span className="muted">one per boot</span>
    <table className="compact"><thead><tr><th>Start</th><th>End</th><th>Duration</th><th>Sleeps</th><th>Bots</th></tr></thead><tbody>
      {ses.map((s,i)=>{ const x=SL[s.instance_id], b=BT[s.instance_id];
        return <tr key={s.instance_id}><td>{fmt(s.started)}</td><td>{i===0&&fresh?"now":fmt(s.last_ping)}</td><td>{dur((new Date(s.last_ping)-new Date(s.started))/1000)}</td>
          <td>{x?`${x.n} (${dur(x.secs)})`:<span className="muted">none</span>}</td><td style={{fontSize:13}}>{b?<>{b.names} <span className="muted">· {b.n} actions</span></>:<span className="muted">none</span>}</td></tr>; })}
    </tbody></table></div>
  </main></>;
}
