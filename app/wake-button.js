"use client";
// Top-bar Wake box: sleeping (grey) -> waking (spinner) -> awake when the next heartbeat lands.
import { useEffect, useState } from "react";
export default function Wake(){
  const [s,setS]=useState(null),[err,setErr]=useState("");
  const get=()=>fetch("/api/box/wake",{cache:"no-store"}).then(r=>r.json()).then(setS).catch(()=>{});
  useEffect(()=>{ get(); },[]);
  useEffect(()=>{ if(s?.state!=="waking") return; const i=setInterval(get,5000); return ()=>clearInterval(i); },[s?.state]);
  async function wake(){ setErr(""); setS(x=>({...x,state:"waking"})); const j=await (await fetch("/api/box/wake",{method:"POST"})).json().catch(()=>({}));
    if(j.demo){ setErr("demo"); setTimeout(()=>setS(x=>({...x,state:"awake"})),2500); return; }
    if(j.delivered===false){ setErr(j.reason||"not sent"); get(); return; } setS(j); }
  if(!s) return null;
  const st=s.state, tip=st==="waking"?"Waiting for the box to send a heartbeat":st==="awake"?"Box is up. Wake again anyway (one small routine run)":"Wake the box: fires one small Grok Bot routine run";
  return <button className={"wake "+st} disabled={st==="waking"} onClick={wake} title={tip+(err?` · ${err}`:"")}>
    {st==="waking"?<span className="spin"/>:<span className={"dot "+(st==="awake"?"green":"grey")}/>}
    {st==="waking"?"Waking…":st==="awake"?"Awake":"Wake box"}{err&&err!=="demo"?" !":""}</button>;
}
