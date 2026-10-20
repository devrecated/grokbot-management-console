import Grug from "./grug";
const TABS=[["bots","Bots","/bots"],["routines","Routines","/"],["logs","Logs","/logs"]];
export default function Nav({right,active}){return <header style={{alignItems:"center"}}>
  <a href="/" style={{color:"#fff",textDecoration:"none",display:"flex",gap:8,alignItems:"center"}}><Grug size={28}/><b>GrugBot Management Console</b></a>
  <nav className="tabs">{TABS.map(([k,l,h])=><a key={k} href={h} className={active===k?"on":""}>{l}</a>)}</nav>
  <span style={{display:"flex",gap:16,alignItems:"center"}}>{right}<a href="/settings" title="Settings" style={{color:"#fff",fontSize:18,textDecoration:"none"}}>⚙</a></span></header>}
