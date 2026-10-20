"use client";
// Plain React log viewer: filters, expand, copy, load more, optional Live polling (5s, only while visible).
import { useEffect, useState } from "react";
import Info from "./info";
const RANGES=["1h","6h","24h","7d"], LEVELS=["error","warn","info","debug"];
const fmt=d=>new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"});
export default function Viewer({grug}){
  const [f,setF]=useState({source:"",level:"",range:"24h",q:""}),[search,setSearch]=useState("");
  const [rows,setRows]=useState([]),[meta,setMeta]=useState({sources:[],catalog:null}),[open,setOpen]=useState(null);
  const [live,setLive]=useState(false),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[copied,setCopied]=useState(null);
  const url=o=>"/api/logs?"+new URLSearchParams({...Object.fromEntries(Object.entries(f).filter(([,v])=>v)),...o});
  async function load(){ setBusy(true); const j=await (await fetch(url({meta:"1"}),{cache:"no-store"})).json();
    setRows(j.rows); setMore(j.rows.length===100); setMeta({sources:j.sources,catalog:j.catalog}); setBusy(false); }
  async function older(){ const j=await (await fetch(url({before:String(rows.at(-1).id)}))).json(); setRows(r=>[...r,...j.rows]); setMore(j.rows.length===100); }
  useEffect(()=>{load();},[f]);
  useEffect(()=>{ if(!live) return; const i=setInterval(async()=>{
      if(document.visibilityState!=="visible") return;
      const j=await (await fetch(url(rows[0]?{after:String(rows[0].id)}:{}),{cache:"no-store"})).json();
      if(j.rows.length) setRows(r=>[...j.rows,...r].slice(0,1000)); },5000); return ()=>clearInterval(i); },[live,f,rows[0]?.id]);
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  function copy(r){ navigator.clipboard?.writeText(`${r.ts} ${r.level} ${r.source} ${r.message}`); setCopied(r.id); setTimeout(()=>setCopied(null),1200); }
  return <>
    <div className="grug-head">{grug}<div><h2 style={{margin:0,display:"flex",gap:8,alignItems:"center"}}>Box logs <Info catalog={meta.catalog}/></h2><div className="muted" style={{fontSize:12}}>one table. no framework. complexity very bad.</div></div></div>
    <div className="lv-bar">
      <select value={f.source} onChange={e=>set("source",e.target.value)}><option value="">All sources</option>{meta.sources.map(s=><option key={s.source} value={s.source}>{s.source} ({s.n})</option>)}</select>
      <select value={f.level} onChange={e=>set("level",e.target.value)}><option value="">All levels</option>{LEVELS.map(l=><option key={l}>{l}</option>)}</select>
      <span className="lv-seg">{RANGES.map(r=><button key={r} className={f.range===r?"on":""} onClick={()=>set("range",r)}>{r}</button>)}</span>
      <form onSubmit={e=>{e.preventDefault();set("q",search);}} style={{display:"flex",gap:6}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search text"/><button>Search</button></form>
      <label className="lv-live"><input type="checkbox" checked={live} onChange={e=>setLive(e.target.checked)}/>Live{live&&<span className="dot"/>}</label>
      {busy&&<span className="muted">loading…</span>}
    </div>
    <div className="lv-wrap"><table className="lv"><thead><tr><th>Time (ET)</th><th>Level</th><th>Source</th><th>Message</th><th/></tr></thead><tbody>
      {rows.map(r=><tr key={r.id} className={open===r.id?"open":""} onClick={()=>setOpen(open===r.id?null:r.id)}>
        <td className="t">{fmt(r.ts)}</td><td><span className={`pill ${r.level}`}>{r.level}</span></td><td className="s">{r.source}</td>
        <td className="m">{open===r.id?<>{r.message}<div className="muted" style={{marginTop:4}}>id {r.id} · {r.ts}</div></>:r.message.slice(0,220)}</td>
        <td><button className="ghost cp" onClick={e=>{e.stopPropagation();copy(r);}}>{copied===r.id?"copied":"copy"}</button></td></tr>)}
      {!rows.length&&!busy&&<tr><td colSpan={5} className="muted">No log lines match.</td></tr>}</tbody></table></div>
    {more&&<button className="ghost" style={{marginTop:10}} onClick={older}>Load more</button>}
  </>;
}
