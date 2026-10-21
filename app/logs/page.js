import Nav from "../nav";
import Grug from "../grug";
import Viewer from "./viewer";
import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
export const dynamic="force-dynamic";
export default async function Logs(){
  const s=await getSettings(sql());
  const ship=s.ship_interval_s<60?`every ${s.ship_interval_s}s`:s.ship_interval_s===60?"every minute":`every ${s.ship_interval_s/60} min`;
  return <><Nav active="logs"/><main>
    <Viewer grug={<Grug/>} tz={s.timezone}/>
    <footer className="muted" style={{fontSize:12,margin:"24px 0"}}>Kept {s.log_retention_days} day{s.log_retention_days===1?"":"s"}, max 200k lines, shipped from the box {ship} while it is on. Built the <a href="https://grugbrain.dev" target="_blank" rel="noreferrer">grug brain</a> way.</footer>
  </main></>;
}
