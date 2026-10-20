import { sql, ensure, ensureBots } from "@/lib/db";
import Nav from "../nav";
import BotsTable from "./table";
export const dynamic="force-dynamic";
export default async function Bots(){
  const q=sql(); await ensure(q); await ensureBots(q);
  const bots=await q`select b.key,b.name,b.title,b.description,b.color, (select max(ts) from bot_events e where e.bot=b.key) last_at from bots b`;
  const counts=await q`select bot, tool, count(*)::int n from bot_events where ts > now() - interval '7 days' group by bot, tool order by n desc`;
  const recent=await q`select * from (select bot, ts, tool, target, row_number() over (partition by bot order by ts desc, id desc) rn from bot_events) x where rn<=10`;
  const routines=await q`select routine_id, name, bot, schedule_or_trigger, status from routines order by name`;
  const by=(rows,k)=>rows.reduce((m,r)=>((m[r[k]]??=[]).push(r),m),{});
  const C=by(counts,"bot"), R=by(recent,"bot"), RT=by(routines,"bot");
  const data=bots.map(b=>({...b, last_at:b.last_at?String(b.last_at):null, actions:(C[b.key]||[]).reduce((a,x)=>a+x.n,0), top:(C[b.key]||[])[0]?.tool||"",
    tools:(C[b.key]||[]).slice(0,8), recent:(R[b.key]||[]).map(e=>({ts:String(e.ts),tool:e.tool,target:e.target})), routines:RT[b.name]||[]}));
  return <><Nav active="bots"/><main><h2>Bots</h2>
    <p className="muted" style={{marginTop:0}}>Activity shows only what kind of action happened and when. No commands, messages or results leave the box.</p>
    <BotsTable data={data}/></main></>;
}
