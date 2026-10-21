"use client";
// uPlot charts: CPU % and memory %, synced cursor, hover shows time + value, null = break (downtime).
// Live: streams the box's 2 s samples into the same charts for a few minutes.
import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
function withGaps(d,gap){ // insert a null after any jump bigger than gap, so uPlot breaks the line there
  const out=d.map(()=>[]); for(let i=0;i<d[0].length;i++){ if(i&&d[0][i]-d[0][i-1]>gap){ out[0].push(d[0][i-1]+1); for(let k=1;k<d.length;k++) out[k].push(null); } for(let k=0;k<d.length;k++) out[k].push(d[k][i]); } return out;
}
function opts(title,series,tz,w){
  const fmt=new Intl.DateTimeFormat("en-US",{timeZone:tz,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  return {title,width:w,height:200,tzDate:t=>uPlot.tzDate(new Date(t*1e3),tz),cursor:{sync:{key:"box"}},
    scales:{y:{range:[0,100]}},axes:[{},{values:(u,v)=>v.map(x=>x+"%"),size:44}],
    series:[{value:(u,t)=>t==null?"-":fmt.format(new Date(t*1e3))},...series.map(s=>({spanGaps:false,width:1.5,value:(u,v)=>v==null?"-":v.toFixed(1)+"%",...s}))]};
}
export default function Charts({data,tz,gap,initialUntil,wait}){
  const a=useRef(), b=useRef(), plots=useRef([]), [until,setUntil]=useState(initialUntil||0), [live,setLive]=useState([[],[],[]]), [busy,setBusy]=useState(false), [,tick]=useState(0);
  const on=until>Date.now();
  useEffect(()=>{ const w=Math.max(320,a.current.parentElement.clientWidth-8);
    plots.current=[new uPlot(opts("CPU %",[{label:"avg",stroke:"#c5221f"},{label:"peak",stroke:"rgba(197,34,31,.3)"}],tz,w),[],a.current),
      new uPlot(opts("Memory % of RAM",[{label:"used",stroke:"#1a73e8",fill:"rgba(26,115,232,.08)"}],tz,w),[],b.current)];
    const rs=()=>{ const w=Math.max(320,a.current.parentElement.clientWidth-8); plots.current.forEach(p=>p.setSize({width:w,height:200})); };
    window.addEventListener("resize",rs); return ()=>{ window.removeEventListener("resize",rs); plots.current.forEach(p=>p.destroy()); }; },[tz]);
  useEffect(()=>{ const [c,m]=plots.current; if(!c) return;
    const d=on&&live[0].length>1?withGaps([live[0],live[1],live[1].map(()=>null),live[2]],30):withGaps(data,gap);
    c.setData([d[0],d[1],d[2]]); m.setData([d[0],d[3]]); },[data,gap,live,on]);
  useEffect(()=>{ if(!on) return; let stop=false, since=Date.now()-5*60e3;
    const poll=async()=>{ if(stop||document.hidden) return; try{ const r=await (await fetch(`/api/box/live?since=${since}`)).json();
      if(r.rows?.length){ since=r.rows.at(-1).t; setLive(([t,c,m])=>{ const T=[...t],C=[...c],M=[...m]; for(const x of r.rows){ T.push(x.t/1000); C.push(x.cpu); M.push(x.tot?100*x.mem/x.tot:null); }
        const k=T.findIndex(x=>x>Date.now()/1000-600); return [T.slice(k),C.slice(k),M.slice(k)]; }); }
      if(typeof r.live_until==="number") setUntil(r.live_until); }catch{} tick(n=>n+1); };
    poll(); const id=setInterval(poll,2000); return ()=>{ stop=true; clearInterval(id); }; },[on]);
  const toggle=async()=>{ setBusy(true); try{ const r=await (await fetch("/api/box/live",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({on:!on})})).json(); setUntil(r.live_until||0); setLive([[],[],[]]); }finally{ setBusy(false); } };
  const last=live[0].length?{cpu:live[1].at(-1),mem:live[2].at(-1)}:null;
  return <div>
    <div className="liverow"><button disabled={busy} className={on?"ghost":""} onClick={toggle}>{on?"Stop live":"Go live"}</button>
      <span className="muted">{on?(last?<><span className="dot ok"/> live every 2 s · CPU <b>{last.cpu?.toFixed(0)??"-"}%</b> · memory <b>{last.mem?.toFixed(0)}%</b> · stops in {Math.max(0,Math.ceil((until-Date.now())/60e3))} min</>
        :`waiting for the box to check in (up to ~${wait}s)`):"Live streams a sample every 2 s for a few minutes. Nothing extra runs on the box when off."}</span></div>
    <div ref={a}/><div ref={b}/>
  </div>;
}
