"use client";
// uPlot charts: CPU % and memory %, synced cursor, hover shows time + value, null = break (new session or downtime).
// The x axis is the real window (xr), so 1h/6h/... show that much time even if the box was off for part of it.
// History lines are splines. Live adds a separate raw (straight) series at the right edge over a 1 h window,
// so incoming points never reshape the history curve.
import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
const spline=uPlot.paths.spline(), linear=uPlot.paths.linear();
// one x array; break (null) when the session changes or time jumps more than gap
function build(d,sess,gap){
  const out=d.map(()=>[]); for(let i=0;i<d[0].length;i++){
    if(i&&(d[0][i]-d[0][i-1]>gap||sess[i]!==sess[i-1])){ out[0].push(d[0][i-1]+1); for(let k=1;k<d.length;k++) out[k].push(null); }
    for(let k=0;k<d.length;k++) out[k].push(d[k][i]); } return out;
}
function opts(title,series,tz,w,xr){
  const fmt=new Intl.DateTimeFormat("en-US",{timeZone:tz,month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"});
  return {title,width:w,height:200,tzDate:t=>uPlot.tzDate(new Date(t*1e3),tz),cursor:{sync:{key:"box"}},
    scales:{x:{time:true,range:()=>xr.current},y:{range:[0,100]}},axes:[{},{values:(u,v)=>v.map(x=>x+"%"),size:44}],
    series:[{value:(u,t)=>t==null?"-":fmt.format(new Date(t*1e3))},...series.map(s=>({spanGaps:false,width:1.5,paths:spline,value:(u,v)=>v==null?"-":v.toFixed(1)+"%",...s}))]};
}
export default function Charts({data,sess,tz,gap,xr:range,initialUntil,wait}){
  const a=useRef(), b=useRef(), plots=useRef([]), xr=useRef(range), [until,setUntil]=useState(initialUntil||0), [live,setLive]=useState([[],[],[]]), [busy,setBusy]=useState(false), [,tick]=useState(0);
  const on=until>Date.now();
  useEffect(()=>{ const w=Math.max(320,a.current.parentElement.clientWidth-8);
    plots.current=[new uPlot(opts("CPU %",[{label:"avg",stroke:"#c5221f"},{label:"peak",stroke:"rgba(197,34,31,.3)"},{label:"live",stroke:"#c5221f",paths:linear,points:{show:false}}],tz,w,xr),[],a.current),
      new uPlot(opts("Memory % of RAM",[{label:"used",stroke:"#1a73e8",fill:"rgba(26,115,232,.08)"},{label:"live",stroke:"#1a73e8",paths:linear,points:{show:false}}],tz,w,xr),[],b.current)];
    const rs=()=>{ const w=Math.max(320,a.current.parentElement.clientWidth-8); plots.current.forEach(p=>p.setSize({width:w,height:200})); };
    window.addEventListener("resize",rs); return ()=>{ window.removeEventListener("resize",rs); plots.current.forEach(p=>p.destroy()); }; },[tz]);
  useEffect(()=>{ const [c,m]=plots.current; if(!c) return;
    let h=build(data,sess,gap), L=[[],[],[]];
    if(on){ const now=Date.now()/1000; xr.current=[now-3600,now+30]; L=live;
      const cut=L[0].length?L[0][0]:now; const keep=h[0].map(t=>t>=now-3700&&t<cut); h=h.map(s=>s.filter((_,i)=>keep[i])); }
    else xr.current=range;
    const n=h[0].length, nl=L[0].length, pad=k=>Array(k).fill(null);
    const x=[...h[0],...L[0]];
    c.setData([x,[...h[1],...pad(nl)],[...h[2],...pad(nl)],[...pad(n),...L[1]]]); m.setData([x,[...h[3],...pad(nl)],[...pad(n),...L[2]]]); },[data,sess,gap,range,live,on]);
  useEffect(()=>{ if(!on) return; let stop=false, since=Date.now()-5*60e3;
    const poll=async()=>{ if(stop||document.hidden) return; try{ const r=await (await fetch(`/api/box/live?since=${since}`)).json();
      if(r.rows?.length){ since=r.rows.at(-1).t; setLive(([t,c,m])=>{ const T=[...t],C=[...c],M=[...m]; for(const x of r.rows){ T.push(x.t/1000); C.push(x.cpu); M.push(x.tot?100*x.mem/x.tot:null); }
        const k=Math.max(0,T.findIndex(x=>x>Date.now()/1000-3600)); return [T.slice(k),C.slice(k),M.slice(k)]; }); }
      if(typeof r.live_until==="number") setUntil(r.live_until); }catch{} tick(n=>n+1); };
    poll(); const id=setInterval(poll,2000); return ()=>{ stop=true; clearInterval(id); }; },[on]);
  const toggle=async()=>{ setBusy(true); try{ const r=await (await fetch("/api/box/live",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({on:!on})})).json(); setUntil(r.live_until||0); setLive([[],[],[]]); }finally{ setBusy(false); } };
  const last=live[0].length?{cpu:live[1].at(-1),mem:live[2].at(-1)}:null;
  return <div>
    <div className="liverow"><button disabled={busy} className={on?"ghost":""} onClick={toggle}>{on?"Stop live":"Go live"}</button>
      <span className="muted">{on?(last?<><span className="dot ok"/> live every 2 s (last hour shown) · CPU <b>{last.cpu?.toFixed(0)??"-"}%</b> · memory <b>{last.mem?.toFixed(0)}%</b> · stops in {Math.max(0,Math.ceil((until-Date.now())/60e3))} min</>
        :`waiting for the box to check in (up to ~${wait}s)`):"Live streams a sample every 2 s for a few minutes. Nothing extra runs on the box when off."}</span></div>
    <div ref={a}/><div ref={b}/>
  </div>;
}
