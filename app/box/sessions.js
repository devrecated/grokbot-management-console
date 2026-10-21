"use client";
// Box filters (session + from/to days) and the sessions table. Changing a filter updates the URL right away
// (charts reload on the server) and the table filters on the same values.
import { useMemo } from "react";
import GrugTable from "../grug-table";
const dur=s=>{ s=Math.max(0,Math.round(s/60)); return s<60?`${s}m`:s<1440?`${Math.floor(s/60)}h ${s%60}m`:`${Math.floor(s/1440)}d ${Math.floor(s%1440/60)}h`; };
export function Filters({sessions,inst,from,to,r,tz}){
  const fmt=d=>new Date(d).toLocaleString("en-US",{timeZone:tz,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  const go=o=>{ const p=new URLSearchParams(Object.entries({i:inst,from,to,r:from||to?"":r,...o}).filter(([,v])=>v)); location.href="/box"+(p.toString()?"?"+p:""); };
  return <div className="filters">
    <label>Session <select value={inst} onChange={e=>go({i:e.target.value})}><option value="">all</option>{sessions.slice(0,100).map(s=><option key={s.instance_id} value={s.instance_id}>{s.instance_id.slice(0,8)} · {fmt(s.started)}</option>)}</select></label>
    <label>From <input type="date" value={from} onChange={e=>go({from:e.target.value})}/></label><label>To <input type="date" value={to} onChange={e=>go({to:e.target.value})}/></label>
    {(inst||from||to)&&<a href="/box" style={{fontSize:13}}>clear filters</a>}</div>;
}
export default function Sessions({sessions,inst,win,tz,cur,fresh,params}){
  const link=id=>"/box?"+new URLSearchParams(Object.entries({...params,i:id}).filter(([,v])=>v));
  const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"?";
  const data=useMemo(()=>sessions.filter(s=>(!inst||s.instance_id===inst)&&new Date(s.last_ping)>=win[0]&&new Date(s.started)<=win[1]),[sessions,inst,win[0],win[1]]);
  const columns=useMemo(()=>[
    {id:"id",header:"Session",accessorKey:"instance_id",size:110,cell:c=><a href={link(c.getValue())} onClick={e=>e.stopPropagation()}><code>{c.getValue().slice(0,8)}</code></a>},
    {id:"start",header:"Start",accessorFn:s=>+new Date(s.started),size:150,cell:({row})=>fmt(row.original.started)},
    {id:"end",header:"End",accessorFn:s=>+new Date(s.last_ping),size:150,cell:({row})=>row.original.instance_id===cur&&fresh?<b>now</b>:fmt(row.original.last_ping)},
    {id:"dur",header:"Duration",accessorFn:s=>new Date(s.last_ping)-new Date(s.started),size:100,cell:c=>dur(c.getValue()/1000)},
    {id:"host",header:"Host",accessorKey:"hostname",size:170},
    {id:"bots",header:"Bots",accessorFn:s=>s.bots?.n||0,size:380,cell:({row})=>row.original.bots?<>{row.original.bots.names} <span className="muted">· {row.original.bots.n} actions</span></>:<span className="muted">none</span>},
  ],[cur,fresh,tz]);
  return <GrugTable data={data} columns={columns} rowId={s=>s.instance_id} sort={[{id:"start",desc:true}]} left={["id"]} pinKey="boxPins" noun="sessions" placeholder="Search sessions"
    search={s=>`${s.instance_id} ${s.hostname} ${s.bots?.names||""}`} empty="No sessions match these filters." height="50vh"/>;
}
