"use client";
// Box log viewer. Server does the real filtering (scales); TanStack Table handles columns, pinning, resizing,
// visibility, sorting, expand and a quick search over the loaded window; TanStack Virtual renders only visible rows.
// Filters live in the URL so a view can be shared. Pinned rows persist in localStorage. Live polls 5s only while on + visible.
import { useEffect, useMemo, useRef, useState } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getExpandedRowModel, flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import Info from "./info";
const RANGES=["15m","1h","6h","24h","7d"], LEVELS=["error","warn","info","debug"];
const EMPTY={source:[],level:[],xsource:[],xlevel:[],q:"",re:"",range:"24h",from:"",to:"",around:""};
const LISTS=["source","level","xsource","xlevel"];
const fmt=d=>new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"});
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function fromUrl(){ const p=new URLSearchParams(location.search), f={...EMPTY};
  for(const k of Object.keys(EMPTY)) if(p.has(k)) f[k]=LISTS.includes(k)?p.get(k).split(",").filter(Boolean):p.get(k); return f; }
function toQuery(f,extra={}){ const o={};
  for(const [k,v] of Object.entries(f)) if(Array.isArray(v)?v.length:v) o[k]=Array.isArray(v)?v.join(","):v;
  if(o.range==="15m"){ delete o.range; if(!o.from) o.from=new Date(Date.now()-15*60e3).toISOString(); }
  return new URLSearchParams({...o,...extra}).toString(); }
function Mark({text,terms}){ // highlight search terms
  const t=terms.filter(Boolean); if(!t.length) return text;
  let rx; try{ rx=new RegExp(`(${t.map(x=>x.re?x.v:esc(x.v)).join("|")})`,"gi"); }catch{ return text; }
  return text.split(rx).map((p,i)=>i%2?<mark key={i}>{p}</mark>:p); }
function Multi({label,values,inc,exc,onChange}){ // multi-select with counts and include/exclude
  return <details className="ms"><summary>{label}{inc.length?` (${inc.length})`:""}{exc.length?` −${exc.length}`:""}</summary><div className="ms-pop">
    {values.map(([v,n])=><div key={v} className="ms-row">
      <label><input type="checkbox" checked={inc.includes(v)} onChange={e=>onChange(e.target.checked?[...inc,v]:inc.filter(x=>x!==v),exc.filter(x=>x!==v))}/>{v} <span className="muted">{n}</span></label>
      <button title="exclude" className={"x"+(exc.includes(v)?" on":"")} onClick={()=>onChange(inc.filter(x=>x!==v),exc.includes(v)?exc.filter(x=>x!==v):[...exc,v])}>⊘</button></div>)}
    {!values.length&&<span className="muted">none in range</span>}</div></details>; }
export default function Viewer({grug}){
  const [f,setF]=useState(null),[draft,setDraft]=useState({q:"",re:"",mode:"contains"});
  const [rows,setRows]=useState([]),[meta,setMeta]=useState({facets:[],catalog:null,per:200}),[err,setErr]=useState("");
  const [live,setLive]=useState(false),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[copied,setCopied]=useState(null);
  const [sorting,setSorting]=useState([]),[quick,setQuick]=useState(""),[expanded,setExpanded]=useState({});
  const [pinned,setPinned]=useState({}),[colVis,setColVis]=useState({}),[colSize,setColSize]=useState({});
  useEffect(()=>{ const u=fromUrl(); setF(u); setDraft({q:u.q,re:u.re,mode:u.re?"regex":"contains"});
    try{ setPinned(JSON.parse(localStorage.getItem("logPins")||"{}")); }catch{} },[]);
  useEffect(()=>{ localStorage.setItem("logPins",JSON.stringify(pinned)); },[pinned]);
  const set=o=>setF(x=>({...x,...o}));
  async function get(extra){ const r=await fetch("/api/logs?"+toQuery(f,extra),{cache:"no-store"}); const j=await r.json(); if(!r.ok) throw new Error(j.error||r.status); return j; }
  async function load(){ setBusy(true); setErr(""); try{ const j=await get({meta:"1"}); setRows(j.rows); setMore(j.rows.length===j.per&&!f.around); setMeta(j); }catch(e){ setErr(e.message); setRows([]); } setBusy(false); }
  async function older(){ const j=await get({before:String(rows.at(-1).id)}); setRows(r=>[...r,...j.rows]); setMore(j.rows.length===j.per); }
  useEffect(()=>{ if(!f) return; history.replaceState(null,"",location.pathname+(toQuery(f)?"?"+toQuery(f):"")); load(); },[JSON.stringify(f)]);
  useEffect(()=>{ if(!live||!f) return; const i=setInterval(async()=>{ if(document.visibilityState!=="visible") return;
      try{ const j=await get(rows[0]?{after:String(rows[0].id)}:{}); if(j.rows.length) setRows(r=>[...j.rows,...r].slice(0,2000)); }catch{} },5000);
    return ()=>clearInterval(i); },[live,JSON.stringify(f),rows[0]?.id]);
  function copy(r){ navigator.clipboard?.writeText(`${r.ts} ${r.level} ${r.source} ${r.message}`); setCopied(r.id); setTimeout(()=>setCopied(null),1200); }
  const togglePin=r=>setPinned(p=>{ const n={...p}; if(n[r.id]) delete n[r.id]; else n[r.id]=r; return n; });
  function pick(kind,v,e){ e.stopPropagation(); const inc=kind, exc="x"+kind; // click = only this, shift-click = exclude
    set(e.shiftKey?{[exc]:f[exc].includes(v)?f[exc].filter(x=>x!==v):[...f[exc],v],[inc]:f[inc].filter(x=>x!==v)}:{[inc]:f[inc].includes(v)?f[inc].filter(x=>x!==v):[...f[inc],v],[exc]:f[exc].filter(x=>x!==v)}); }
  const terms=[f?.q&&{v:f.q},f?.re&&{v:f.re,re:true},quick&&{v:quick}];
  const data=useMemo(()=>{ const ids=new Set(rows.map(r=>r.id)); return [...Object.values(pinned).filter(r=>!ids.has(r.id)),...rows]; },[rows,pinned]);
  const columns=useMemo(()=>[
    {id:"pin",header:"",size:34,enableSorting:false,enableResizing:false,enableHiding:false,cell:({row})=><button title="pin to top" className={"ghost cp"+(pinned[row.original.id]?" pinned":"")} onClick={e=>{e.stopPropagation();togglePin(row.original);}}>📌</button>},
    {id:"t",header:"Time (ET)",accessorKey:"ts",size:160,cell:c=>fmt(c.getValue())},
    {id:"level",header:"Level",accessorKey:"level",size:76,cell:c=><span className={`pill ${c.getValue()}`} onClick={e=>pick("level",c.getValue(),e)} title="click: filter · shift-click: exclude">{c.getValue()}</span>},
    {id:"s",header:"Source",accessorKey:"source",size:210,cell:c=><span className="val" onClick={e=>pick("source",c.getValue(),e)} title="click: filter · shift-click: exclude">{c.getValue()}</span>},
    {id:"m",header:"Message",accessorKey:"message",size:700,enableSorting:false,cell:({row,getValue})=>row.getIsExpanded()
      ?<><Mark text={getValue()} terms={terms}/><div className="row-acts"><span className="muted">id {row.original.id} · {row.original.ts}</span>
        <button className="ghost cp" onClick={e=>{e.stopPropagation();setF({...EMPTY,range:"",around:String(row.original.id)});}}>Show ±1 min around</button></div></>
      :<Mark text={getValue().slice(0,240)} terms={terms}/>},
    {id:"cp",header:"",size:60,enableSorting:false,enableResizing:false,cell:({row})=><button className="ghost cp" onClick={e=>{e.stopPropagation();copy(row.original);}}>{copied===row.original.id?"copied":"copy"}</button>},
  ],[copied,pinned,JSON.stringify(f),quick]);
  const rowPinning=useMemo(()=>({top:Object.keys(pinned)}),[pinned]);
  const table=useReactTable({data,columns,getRowId:r=>String(r.id),columnResizeMode:"onChange",enableRowPinning:true,keepPinnedRows:true,
    state:{sorting,globalFilter:quick,expanded,rowPinning,columnVisibility:colVis,columnSizing:colSize,columnPinning:{left:["pin","t","level","s"]}},
    onSortingChange:setSorting,onGlobalFilterChange:setQuick,onExpandedChange:setExpanded,onColumnVisibilityChange:setColVis,onColumnSizingChange:setColSize,
    getRowCanExpand:()=>true,globalFilterFn:"includesString",
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getFilteredRowModel:getFilteredRowModel(),getExpandedRowModel:getExpandedRowModel()});
  const top=table.getTopRows(), center=table.getCenterRows(), box=useRef(null);
  const virt=useVirtualizer({count:center.length,getScrollElement:()=>box.current,estimateSize:()=>28,overscan:15});
  const vi=virt.getVirtualItems(), pad={top:vi[0]?.start||0,bottom:vi.length?virt.getTotalSize()-vi[vi.length-1].end:0};
  if(!f) return null;
  const counts=k=>{ const m={}; for(const x of meta.facets||[]) m[x[k]]=(m[x[k]]||0)+x.n; return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
  const sticky=c=>c.column.getIsPinned()?{position:"sticky",left:c.column.getStart("left"),zIndex:1}:{};
  const Row=(r,i,pinnedRow)=><tr key={pinnedRow?i:r.id} data-index={i} ref={pinnedRow?undefined:virt.measureElement} className={(r.getIsExpanded()?"open ":"")+(pinnedRow?"pinrow":"")} onClick={r.getToggleExpandedHandler()}>
    {r.getVisibleCells().map(c=><td key={c.id} className={c.column.id} style={{width:c.column.getSize(),...sticky(c)}}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>;
  const ncol=table.getVisibleLeafColumns().length;
  const chips=[...f.source.map(v=>["source",v,"+"]),...f.level.map(v=>["level",v,"+"]),...f.xsource.map(v=>["xsource",v,"−"]),...f.xlevel.map(v=>["xlevel",v,"−"])];
  return <>
    <div className="grug-head">{grug}<div><h2 style={{margin:0,display:"flex",gap:8,alignItems:"center"}}>Box logs <Info catalog={meta.catalog}/></h2>
      <div className="muted" style={{fontSize:12}}>one table. complexity very bad. click a source or level to filter, shift-click to exclude.</div></div></div>
    <div className="lv-bar">
      <Multi label="Source" values={counts("source")} inc={f.source} exc={f.xsource} onChange={(a,b)=>set({source:a,xsource:b})}/>
      <Multi label="Level" values={counts("level").sort((a,b)=>LEVELS.indexOf(a[0])-LEVELS.indexOf(b[0]))} inc={f.level} exc={f.xlevel} onChange={(a,b)=>set({level:a,xlevel:b})}/>
      <form onSubmit={e=>{e.preventDefault(); set(draft.mode==="regex"?{re:draft.re||draft.q,q:""}:{q:draft.q||draft.re,re:""});}} style={{display:"flex",gap:4}}>
        <select value={draft.mode} onChange={e=>setDraft(d=>({...d,mode:e.target.value}))}><option value="contains">contains</option><option value="regex">regex</option></select>
        <input value={draft.mode==="regex"?draft.re:draft.q} onChange={e=>setDraft(d=>d.mode==="regex"?{...d,re:e.target.value}:{...d,q:e.target.value})} placeholder="Message filter (server)" style={{width:190}}/><button>Apply</button></form>
      <input value={quick} onChange={e=>setQuick(e.target.value)} placeholder="Search loaded rows" style={{width:160}}/>
    </div>
    <div className="lv-bar">
      <span className="lv-seg">{RANGES.map(r=><button key={r} className={f.range===r&&!f.from&&!f.around?"on":""} onClick={()=>set({range:r,from:"",to:"",around:""})}>{r}</button>)}</span>
      <label className="muted">from <input type="datetime-local" value={f.from?toLocal(f.from):""} onChange={e=>set({from:e.target.value?new Date(e.target.value).toISOString():"",around:""})}/></label>
      <label className="muted">to <input type="datetime-local" value={f.to?toLocal(f.to):""} onChange={e=>set({to:e.target.value?new Date(e.target.value).toISOString():"",around:""})}/></label>
      <details className="ms"><summary>Columns</summary><div className="ms-pop">{table.getAllLeafColumns().filter(c=>c.getCanHide()&&c.columnDef.header).map(c=>
        <label key={c.id} className="ms-row"><span><input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()}/>{c.columnDef.header}</span></label>)}
        <button className="ghost cp" onClick={()=>setColSize({})}>reset widths</button></div></details>
      <label className="lv-live"><input type="checkbox" checked={live} onChange={e=>setLive(e.target.checked)}/>Live{live&&<span className="dot"/>}</label>
      <button className="ghost cp" onClick={()=>navigator.clipboard?.writeText(location.href)}>copy link</button>
      <span className="muted">{busy?"loading…":`${center.length} of ${rows.length} loaded${top.length?` · ${top.length} pinned`:""}`}</span>
    </div>
    {(chips.length||f.q||f.re||f.around)?<div className="lv-bar">{chips.map(([k,v,s])=><span key={k+v} className={"chip"+(s==="−"?" neg":"")}>{s} {v} <button onClick={()=>set({[k]:f[k].filter(x=>x!==v)})}>✕</button></span>)}
      {f.q&&<span className="chip">contains “{f.q}” <button onClick={()=>set({q:""})}>✕</button></span>}
      {f.re&&<span className="chip">regex /{f.re}/ <button onClick={()=>set({re:""})}>✕</button></span>}
      {f.around&&<span className="chip">±1 min around row {f.around} <button onClick={()=>set({around:"",range:"24h"})}>✕</button></span>}
      <button className="link" onClick={()=>{setF({...EMPTY});setDraft({q:"",re:"",mode:"contains"});}}>clear all</button></div>:null}
    {err&&<div className="error" style={{marginBottom:8}}>{err}</div>}
    <div className="lv-wrap" ref={box}><table className="lv" style={{width:table.getTotalSize()}}><thead>{table.getHeaderGroups().map(g=><tr key={g.id}>{g.headers.map(h=>
        <th key={h.id} style={{width:h.getSize(),...(h.column.getIsPinned()?{position:"sticky",left:h.column.getStart("left"),zIndex:3}:{})}}>
          <span className={h.column.getCanSort()?"sortable":""} onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header,h.getContext())}{{asc:" ▲",desc:" ▼"}[h.column.getIsSorted()]||""}</span>
          {h.column.getCanResize()&&<span className={"rz"+(h.column.getIsResizing()?" on":"")} onMouseDown={h.getResizeHandler()} onTouchStart={h.getResizeHandler()} onDoubleClick={()=>h.column.resetSize()}/>}</th>)}</tr>)}</thead>
      <tbody>
        {top.map(r=>Row(r,"p"+r.id,true))}
        {pad.top>0&&<tr><td colSpan={ncol} style={{height:pad.top,padding:0,border:0}}/></tr>}
        {vi.map(v=>Row(center[v.index],v.index))}
        {pad.bottom>0&&<tr><td colSpan={ncol} style={{height:pad.bottom,padding:0,border:0}}/></tr>}
        {!center.length&&!busy&&<tr><td colSpan={ncol} className="muted">No log lines match.</td></tr>}</tbody></table></div>
    {more&&<button className="ghost" style={{marginTop:10}} onClick={older}>Load more</button>}
  </>;
}
function toLocal(iso){ const d=new Date(iso); const z=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
