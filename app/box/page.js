// Box page: current session at the top, CPU and memory charts over a real time window (all sessions on one axis,
// a break between sessions and wherever no heartbeat came), then a small sessions table.
// A session = one run of the box: a boot, or a wake after the VM was paused. grugbox gives each its own instance id.
// Filters: ?r=1h|6h|24h|7d|14d (window ending now), or ?from=YYYY-MM-DD&to=YYYY-MM-DD (days in the Settings zone); ?i=<instance id>.
import { sql, ensureHeartbeats, ensureBots, liveUntil } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { tzLabel, SHORT } from "@/lib/tz";
import Nav from "../nav";
import Charts from "./charts";
import Sessions, { Filters } from "./sessions";
export const dynamic="force-dynamic";
const RANGES={"1h":1,"6h":6,"24h":24,"7d":168,"14d":336};
const dur=s=>{ s=Math.max(0,Math.round(s/60)); return s<60?`${s}m`:s<1440?`${Math.floor(s/60)}h ${s%60}m`:`${Math.floor(s/1440)}d ${Math.floor(s%1440/60)}h`; };
// midnight of a YYYY-MM-DD day in zone tz, as epoch ms
const dayStart=(d,tz)=>{ const u=Date.parse(d+"T00:00:00Z"); if(isNaN(u)) return null;
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(new Date(u)).map(x=>[x.type,x.value]));
  return u-(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)-u); };
export default async function Box({searchParams}){
  const sp=await searchParams||{}, q=sql(); await ensureHeartbeats(q); await ensureBots(q); const st=await getSettings(q), tz=st.timezone;
  const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,...SHORT}):"?";
  const hb=st.heartbeat_interval_s, all=await q`select instance_id, hostname, version, os_info, coalesce(boot_time, first_seen) started, first_seen, last_ping from heartbeats order by last_ping desc limit 200`;
  const cur=all[0], fresh=cur&&Date.now()-new Date(cur.last_ping)<st.stale_box_minutes*60e3;
  const inst=all.some(s=>s.instance_id===sp.i)?sp.i:"";
  const f=sp.from&&dayStart(sp.from,tz), t=sp.to&&dayStart(sp.to,tz);
  const custom=!!(f||t), r=custom?"":RANGES[sp.r]?sp.r:"24h";
  const to=t?t+86400e3:Date.now(), from=f||(custom?to-7*86400e3:to-RANGES[r]*3600e3);
  const bw=Math.max(hb, Math.round((to-from)/1000/1500));
  const pts=await q`select floor(extract(epoch from ts)/${bw})*${bw} t, instance_id, avg(cpu)::real cpu, max(cpu)::real cpu_max, avg(100.0*mem_used_mb/nullif(mem_total_mb,0))::real mem
    from box_samples where ts >= to_timestamp(${from/1000}) and ts <= to_timestamp(${to/1000}) and (${inst}='' or instance_id=${inst}) group by 1,2 order by 1,2`;
  const ids=all.map(s=>s.instance_id);
  const bots=ids.length?await q`select h.instance_id, string_agg(distinct coalesce(b.name,e.bot), ', ') names, count(*)::int n from heartbeats h
      join bot_events e on e.ts between coalesce(h.boot_time,h.first_seen) and h.last_ping + interval '2 minutes' left join bots b on b.key=e.bot
      where h.instance_id = any(${ids}::text[]) group by 1`:[];
  const BT=Object.fromEntries(bots.map(b=>[b.instance_id,b]));
  const sesAll=all.map(s=>({instance_id:s.instance_id,hostname:s.hostname,started:s.started,last_ping:s.last_ping,bots:BT[s.instance_id]||null}));
  const ag=cur?(await q`select cpu, mem_used_mb, mem_total_mb, agent_cpu, agent_rss_mb from box_samples where instance_id=${cur.instance_id} order by ts desc limit 1`)[0]:null;
  const o=cur?.os_info||{}, lu=await liveUntil(q), wait=Math.min(st.ship_interval_s,hb);
  const up=cur?(new Date(cur.last_ping)-new Date(cur.started))/1000:0;
  const S=Object.fromEntries(all.map((s,i)=>[s.instance_id,i]));
  const data=[pts.map(p=>Number(p.t)),pts.map(p=>p.cpu),pts.map(p=>p.cpu_max),pts.map(p=>p.mem)], sess=pts.map(p=>S[p.instance_id]??-1);
  const qs=o=>"?"+new URLSearchParams(Object.entries({i:inst,...o}).filter(([,v])=>v)).toString();
  return <><Nav active="box"/><main>
    {!cur?<div className="card">No box has checked in yet. Run <code>install.sh</code> on the box.</div>:<>
    <div className="card boxsum">
      <div><span className={"dot "+(fresh?"ok":"off")}/> <b style={{fontSize:18}}>{cur.hostname}</b> <span className="muted">{fresh?"online":"offline"} · last ping {fmt(cur.last_ping)} · session <code>{cur.instance_id.slice(0,8)}</code></span></div>
      <div className="sumgrid">
        <div><span className="muted">up</span> {dur(up)} <span className="muted">since {fmt(cur.started)}</span></div>
        <div><span className="muted">os</span> {o.distro?`${o.distro} · ${o.kernel} · ${o.cores} cores · ${(o.ram_mb/1024).toFixed(0)} GB`:"not reported"}</div>
        <div><span className="muted">now</span> {ag?`CPU ${ag.cpu?.toFixed(0)??"-"}% · memory ${(ag.mem_used_mb/1024).toFixed(1)} / ${(ag.mem_total_mb/1024).toFixed(0)} GB`:"-"}</div>
        <div><span className="muted">grugbox</span> {ag?.agent_rss_mb!=null?`${ag.agent_cpu?.toFixed(2)??"-"}% of a core · ${ag.agent_rss_mb.toFixed(1)} MB`:"not reported"}</div>
      </div>
    </div>
    <div className="card">
      <div className="charthead"><b>CPU and memory</b>
        <span className="ranges">{Object.keys(RANGES).map(k=><a key={k} href={`/box${qs({r:k})}`} className={k===r?"on":""}>{k}</a>)}</span></div>
      <Filters sessions={all.map(x=>({instance_id:x.instance_id,started:String(x.started)}))} inst={inst} from={sp.from||""} to={sp.to||""} r={r} tz={tz}/>
      <Charts data={data} sess={sess} tz={tz} gap={2*bw} xr={[from/1000,to/1000]} bw={bw} initialUntil={lu} wait={wait}/>
      <div className="muted" style={{fontSize:12}}>Times in {tzLabel(tz)}. One point per {dur(bw)}{bw<120?` (${bw}s)`:""}, smoothed. Breaks = a new session, or no heartbeat for over {dur(2*bw)}. Faint line = peak CPU.</div>
    </div></>}
    <div className="card"><b>Sessions</b> <span className="muted">a boot, or a wake after the box slept · {fmt(from)} to {custom?fmt(to):"now"}</span>
    <Sessions sessions={JSON.parse(JSON.stringify(sesAll))} inst={inst} win={[from,to]} tz={tz} cur={cur?.instance_id} fresh={!!fresh} params={{r:custom?"":r,from:sp.from||"",to:sp.to||""}}/></div>
  </main></>;
}
