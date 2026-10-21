"use client";
// Plugin on/off. Changes are staged, then Save asks you to trust each newly enabled plugin (it runs with full
// access to the server and database), saves, and offers a rebuild: plugins are bundled at build time.
import { useState } from "react";
import { saveSettings } from "./save";
export const OFFICIAL_LABEL="GrugBot official plugin - Adam Siwiec";
const onOf=(p,s)=>(s.plugins||{})[p.name]??p.enabled;
export default function PluginsCard({initial,plugins,hook}){
  const [s,setS]=useState(initial),[pend,setPend]=useState({}),[note,setNote]=useState("");
  const want=p=>pend[p.name]??onOf(p,s), changed=plugins.filter(p=>want(p)!==onOf(p,s));
  async function save(){
    const next={...(s.plugins||{})};
    for(const p of changed){
      if(want(p)&&!window.confirm(`Turn on "${p.title}" (${p.name})?\n\n${p.official?OFFICIAL_LABEL:`By ${p.author}. Third-party plugin: not reviewed by the console maintainers.`}\n\nDo you trust this plugin? It runs with full access to your server and database.`)) continue;
      next[p.name]=want(p); }
    setPend({}); setNote("Saving…"); const j=await saveSettings({plugins:next}); if(j._error) return setNote(j._error); setS(j);
    const stale=plugins.filter(p=>onOf(p,j)!==p.bundled);
    if(!stale.length) return setNote("Saved.");
    const what=stale.map(p=>`${onOf(p,j)?"add":"remove"} ${p.title}`).join(", ");
    if(!window.confirm(`Saved. The running build does not match yet (${what}). Plugins are bundled at build time.\n\n${hook?"Redeploy now?":"Show how to redeploy or restart?"}`)) return setNote(`Saved. Rebuild later to ${what}.`);
    const r=await (await fetch("/api/deploy",{method:"POST"})).json().catch(()=>({}));
    setNote(r.triggered?"Redeploy started. Reload in a minute or two.":(r.how||"Redeploy or rebuild and restart to apply.")); }
  return <div className="bot"><h3>Plugins</h3>
    <div className="muted" style={{marginBottom:8}}>Each folder in <code>plugins/</code> is a plugin. Only plugins that are on get built into the app. Off = no tab, its API answers 404 and the box gets nothing from it.</div>
    {plugins.map(p=><label key={p.name} className="srow"><input type="checkbox" checked={want(p)} onChange={e=>setPend({...pend,[p.name]:e.target.checked})}/>
      <span><b>{p.title}</b> <code>{p.name}</code> {p.official?<span className="muted">· {OFFICIAL_LABEL}</span>:<span className="badge-paused">third-party · {p.author}</span>}
        {onOf(p,s)!==p.bundled&&<span className="muted"> · {p.bundled?"still in this build until you redeploy":"needs a redeploy to load"}</span>}
        <div className="muted">{p.description}</div></span></label>)}
    {!plugins.length&&<div className="muted">No plugins installed.</div>}
    <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}><button disabled={!changed.length} onClick={save}>Save plugins</button>
      {note&&<span className="muted">{note}</span>}</div>
    <div className="muted" style={{marginTop:6}}>A plugin's own settings show below while it is on. Install third-party plugins from a pinned commit or tag you have read, never a moving branch.</div></div>;
}
