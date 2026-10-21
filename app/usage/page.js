// Cost & usage. Grok Bot reports no prices or tokens to the box, so this shows what the dashboard can count
// (runs, run minutes when log-run.sh gets a duration, bot actions) and an ESTIMATE from your own rates in Settings.
import { sql, ensure, ensureBots } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import Nav from "../nav";
export const dynamic="force-dynamic";
const RANGES={"7":7,"30":30,"90":90};
export default async function Usage({searchParams}){
  const days=RANGES[(await searchParams)?.days]||30;
  const q=sql(); await ensure(q); await ensureBots(q); const s=await getSettings(q);
  const money=v=>new Intl.NumberFormat("en-US",{style:"currency",currency:s.currency,maximumFractionDigits:v<1?4:2}).format(v);
  const rated=s.cost_per_run>0||s.cost_per_run_minute>0||s.cost_per_action>0;
  const runs=await q`select r.bot, r.routine_id, coalesce(max(rt.name), r.routine_id) name, count(*)::int n, count(*) filter (where r.status='error')::int err,
      count(r.duration_s)::int timed, coalesce(sum(r.duration_s),0)::int secs from runs r left join routines rt using(routine_id)
      where r.ts > now() - make_interval(days => ${days}) group by 1,2 order by 1, n desc`;
  const acts=await q`select coalesce(b.name, e.bot) bot, count(*)::int n, min(e.ts) since from bot_events e left join bots b on b.key=e.bot where e.ts > now() - make_interval(days => ${days}) group by 1`;
  const A=Object.fromEntries(acts.map(a=>[a.bot,a.n]));
  const bots={}; for(const r of runs){ const b=bots[r.bot]??={bot:r.bot,n:0,err:0,timed:0,secs:0,routines:[]}; b.n+=r.n; b.err+=r.err; b.timed+=r.timed; b.secs+=r.secs; b.routines.push(r); }
  for(const a of acts) bots[a.bot]??={bot:a.bot,n:0,err:0,timed:0,secs:0,routines:[]};
  const est=(n,secs,a)=>n*s.cost_per_run+secs/60*s.cost_per_run_minute+a*s.cost_per_action;
  const list=Object.values(bots).sort((a,b)=>b.n-a.n), total=list.reduce((t,b)=>t+est(b.n,b.secs,A[b.bot]||0),0);
  const mins=(secs,timed,n)=>timed?`${(secs/60).toFixed(1)}${timed<n?` (${timed}/${n} runs timed)`:""}`:"-";
  return <><Nav active="usage"/><main><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Cost &amp; usage</h2>
      <span className="tabs-mini">{Object.keys(RANGES).map(d=><a key={d} href={`/usage?days=${d}`} className={Number(d)===days?"on":""}>{d} days</a>)}</span></div>
    <div className="warnbox" style={{background:"#eef4ff",borderColor:"#a8c3f0"}}><b>Where these numbers come from.</b> Grok Bot does not tell the box what a run costs or how many tokens it used, so there is no real bill here.
      Counted: <b>runs</b> (from log-run.sh), <b>run minutes</b> (only when log-run.sh gets the optional 5th argument, seconds), and <b>actions</b> (bot activity, kept 7 days).
      {rated?<> The <b>estimate</b> column multiplies those by your rates in <a href="/settings">Settings</a>: {money(s.cost_per_run)}/run, {money(s.cost_per_run_minute)}/run minute, {money(s.cost_per_action)}/action.</>:<> Set rates in <a href="/settings">Settings</a> to see an estimate.</>}</div>
    {!list.length&&<p className="muted">No runs or actions in the last {days} days.</p>}
    {list.length>0&&<table><thead><tr><th>Bot / routine</th><th>Runs</th><th>Failed</th><th>Run minutes</th><th>Actions</th>{rated&&<th>Estimate</th>}</tr></thead><tbody>
      {list.map(b=>[<tr key={b.bot} style={{background:"#f6f7f9"}}><td><b>{b.bot}</b></td><td><b>{b.n}</b></td><td>{b.err||""}</td><td>{mins(b.secs,b.timed,b.n)}</td><td>{A[b.bot]??0}</td>{rated&&<td><b>~{money(est(b.n,b.secs,A[b.bot]||0))}</b></td>}</tr>,
        ...b.routines.map(r=><tr key={b.bot+r.routine_id}><td style={{paddingLeft:24}}>{r.name}<div className="muted">{r.routine_id}</div></td><td>{r.n}</td><td>{r.err||""}</td><td>{mins(r.secs,r.timed,r.n)}</td><td className="muted" title="Actions are counted per bot, not per routine">-</td>{rated&&<td>~{money(est(r.n,r.secs,0))}</td>}</tr>)])}
      {rated&&<tr><td colSpan={5} style={{textAlign:"right"}}><b>Total estimate, last {days} days</b></td><td><b>~{money(total)}</b></td></tr>}</tbody></table>}
    <p className="muted" style={{fontSize:12}}>Estimate only. Check your real bill with your provider.</p></main></>;
}
