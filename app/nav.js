import Grug from "./grug";
import BoxStatus from "./box-status";
import Wake from "./wake-button";
import { sql } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { enabledPlugins } from "@/plugins";
const TABS=[["bots","Bots","/bots"],["routines","Routines","/"],["logs","Logs","/logs"],["box","Box","/box"]];
// Plugin pages (plugins/<name>/page.js) get a tab when the plugin is on.
export default async function Nav({right,active}){
  let extra=[]; try{ extra=enabledPlugins(await getSettings(sql())).filter(p=>p.Page).map(p=>["p:"+p.name,p.title,"/p/"+p.name]); }catch{}
  return <header style={{alignItems:"center"}}>
  <a href="/" style={{color:"#fff",textDecoration:"none",display:"flex",gap:8,alignItems:"center"}}><Grug size={28}/><b>GrugBot Management Console</b></a>
  <nav className="tabs">{[...TABS,...extra].map(([k,l,h])=><a key={k} href={h} className={active===k?"on":""}>{l}</a>)}</nav>
  <span style={{display:"flex",gap:16,alignItems:"center"}}><BoxStatus/><Wake/>{right}<a href="/settings" title="Settings" style={{color:"#fff",fontSize:18,textDecoration:"none"}}>⚙</a></span></header>}
