// Cost & usage. Grok Bot reports no prices or tokens to the box, so this shows what the dashboard can count
// (runs, run minutes when log-run.sh gets a duration, bot actions) and an ESTIMATE from your own rates in Settings.
import { sql, ensure, ensureBots } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import Nav from "../nav";
import UsageTable from "./table";
export const dynamic="force-dynamic";
const RANGES={"7":7,"30":30,"90":90};
function TokCells({t,fmtT,money,anyPrice,bold}){
  const W=bold?"b":"span";
  if(!t) return <><td className="muted">-</td><td className="muted">-</td>{anyPrice&&<td className="muted">-</td>}</>;
  return <><td><W>{t.calls}</W></td><td><W>{fmtT(t.input)} / {fmtT(t.output)}</W></td>{anyPrice&&<td title="estimated from transcripts">{t.cost!=null&&(t.priced!==false)?<W>~{money(t.cost)}</W>:<span className="muted">no price</span>}</td>}</>;
}
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
  // Tokens estimated on the box from transcript size, per bot and model. Cost only for models you priced in Settings.
  const tok=await q`select coalesce(b.name, t.bot) bot, t.model, sum(t.calls)::int calls, sum(t.input)::bigint input, sum(t.output)::bigint output
      from token_usage t left join bots b on b.key=t.bot where t.minute > now() - make_interval(days => ${days}) group by 1,2`;
  // Per routine: the bot's tokens inside each run's window (duration if logged, else the 10 minutes before the run was logged).
  const rtok=await q`select r.routine_id, sum(t.input)::bigint input, sum(t.output)::bigint output, sum(t.calls)::int calls, array_agg(distinct t.model) models
      from runs r join bots b on b.name=r.bot join token_usage t on t.bot=b.key
       and t.minute between r.ts - make_interval(secs => coalesce(r.duration_s,600)) - interval '1 minute' and r.ts
      where r.ts > now() - make_interval(days => ${days}) group by 1`;
  const price=Object.fromEntries((s.token_prices||[]).map(p=>[p.model,p]));
  const tcost=(model,i,o)=>price[model]?(Number(i)*price[model].input+Number(o)*price[model].output)/1e6:null;
  const T={}; for(const t of tok){ const x=T[t.bot]??={calls:0,input:0,output:0,cost:0,priced:true,models:[]}; x.calls+=t.calls; x.input+=Number(t.input); x.output+=Number(t.output); x.models.push(t.model);
    const c=tcost(t.model,t.input,t.output); if(c==null) x.priced=false; else x.cost+=c; }
  const RT=Object.fromEntries(rtok.map(r=>{ const m=r.models.length===1?r.models[0]:null; return [r.routine_id,{...r,input:Number(r.input),output:Number(r.output),cost:m?tcost(m,r.input,r.output):null}]; }));
  const fmtT=n=>n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(0)+"k":String(n);
  const anyTok=tok.length>0, anyPrice=(s.token_prices||[]).length>0;
  const bots={}; for(const r of runs){ const b=bots[r.bot]??={bot:r.bot,n:0,err:0,timed:0,secs:0,routines:[]}; b.n+=r.n; b.err+=r.err; b.timed+=r.timed; b.secs+=r.secs; b.routines.push(r); }
  for(const a of acts) bots[a.bot]??={bot:a.bot,n:0,err:0,timed:0,secs:0,routines:[]};
  for(const b of Object.keys(T)) bots[b]??={bot:b,n:0,err:0,timed:0,secs:0,routines:[]};
  const est=(n,secs,a)=>n*s.cost_per_run+secs/60*s.cost_per_run_minute+a*s.cost_per_action;
  const list=Object.values(bots).sort((a,b)=>b.n-a.n), total=list.reduce((t,b)=>t+est(b.n,b.secs,A[b.bot]||0),0);
  const tk=t=>t?{calls:{v:t.calls,t:String(t.calls)},tok:{v:t.input+t.output,t:`${fmtT(t.input)} / ${fmtT(t.output)}`},tcost:{v:t.cost??0,t:t.cost!=null&&t.priced!==false?"~"+money(t.cost):"no price"}}:{calls:"-",tok:"-",tcost:"-"};
  const row=(id,name,n,err,secs,timed,acts,est,t,subRows)=>({id,name,n,err:err||"",mins:{v:secs,t:mins(secs,timed,n)},acts,est:{v:est,t:"~"+money(est)},...tk(t),subRows});
  const mins=(secs,timed,n)=>timed?`${(secs/60).toFixed(1)}${timed<n?` (${timed}/${n} runs timed)`:""}`:"-";
  const rows=list.map(b=>row(b.bot,b.bot,b.n,b.err,b.secs,b.timed,A[b.bot]??0,est(b.n,b.secs,A[b.bot]||0),T[b.bot],
    b.routines.map(r=>row(r.routine_id,r.name,r.n,r.err,r.secs,r.timed,"-",est(r.n,r.secs,0),RT[r.routine_id]))));
  return <><Nav active="usage"/><main style={{maxWidth:1400}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Cost &amp; usage</h2>
      <span className="tabs-mini">{Object.keys(RANGES).map(d=><a key={d} href={`/usage?days=${d}`} className={Number(d)===days?"on":""}>{d} days</a>)}</span></div>
    <div className="warnbox" style={{background:"#eef4ff",borderColor:"#a8c3f0"}}><b>Where these numbers come from.</b> Grok Bot does not tell the box what a run costs or how many tokens it used, so there is no real bill here.
      Counted: <b>runs</b> (from log-run.sh), <b>run minutes</b> (only when log-run.sh gets the optional 5th argument, seconds), and <b>actions</b> (bot activity, kept 7 days).
      {rated?<> The <b>estimate</b> column multiplies those by your rates in <a href="/settings">Settings</a>: {money(s.cost_per_run)}/run, {money(s.cost_per_run_minute)}/run minute, {money(s.cost_per_action)}/action.</>:<> Set rates in <a href="/settings">Settings</a> to see an estimate.</>}</div>
    <UsageTable rows={rows} rated={rated} anyTok={anyTok} anyPrice={anyPrice} total={money(total)} days={days}/>
    <p className="muted" style={{fontSize:12}}>Estimate only. Check your real bill with your provider.</p>
    <div className="muted" style={{fontSize:12}}><b>Tokens are estimated from transcripts.</b> The box counts transcript bytes (about {3.9} bytes per token, measured against the o200k tokenizer) for each model call:
      input = system prompt + everything earlier in the conversation, output = the reply. It ignores prompt caching and hidden tool context, so treat it as a rough size, not a bill.
      Per routine = that bot's tokens during the run (its logged duration, else the 10 minutes before it finished). {anyTok&&!anyPrice&&<>Set prices per model in <a href="/settings">Settings</a> to see a cost.</>}</div></main></>;
}
