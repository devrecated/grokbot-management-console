// /p/worker-tasks: pick a task the box listed, fill its args, confirm, watch output, see history.
import { DEMO } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { ensure } from "./api.js";
import Runner from "./runner.js";
export default async function Tasks({q}){
  await ensure(q); const st=await getSettings(q);
  const cat=(await q`select value from config where key='task_catalog'`)[0]?.value||{tasks:[]};
  const runs=await q`select id, task, args, state, exit_code, note, created_at, started_at, finished_at from task_runs order by id desc limit 50`;
  return <Runner catalog={cat} runs={JSON.parse(JSON.stringify(runs))} tz={st.timezone} wait={Math.min(st.ship_interval_s,st.heartbeat_interval_s)} signing={!!process.env.TASK_KEY||DEMO} demo={DEMO}/>;
}
