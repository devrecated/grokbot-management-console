"use client";
// Log viewer: server filters + TanStack Table (columns, sorting, quick filter, expandable rows) + TanStack Virtual (only visible rows render).
// Live polls every 5s only while on and the tab is visible.
import { useEffect, useMemo, useRef, useState } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getExpandedRowModel, flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import Info from "./info";
const RANGES=["1h","6h","24h","7d"], LEVELS=["error","warn","info","debug"];
const fmt=d=>new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"});
export default function Viewer({grug}){
  const [f,setF]=useState({source:"",level:"",range:"24h",q:""}),[search,setSearch]=useState("");
  const [rows,setRows]=useState([]),[meta,setMeta]=useState({sources:[],catalog:null});
  const [sorting,setSorting]=useState([]),[quick,setQuick]=useState(""),[expanded,setExpanded]=useState({});
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
  const columns=useMemo(()=>[
    {id:"t",header:"Time (ET)",accessorKey:"ts",size:150,cell:c=>fmt(c.getValue())},
    {id:"level",header:"Level",accessorKey:"level",size:70,cell:c=><span className={`pill ${c.getValue()}`}>{c.getValue()}</span>},
    {id:"s",header:"Source",accessorKey:"source",size:200},
    {id:"m",header:"Message",accessorKey:"message",enableSorting:false,cell:({row,getValue})=>row.getIsExpanded()
      ?<>{getValue()}<div className="muted" style={{marginTop:4}}>id {row.original.id} · {row.original.ts}</div></>:getValue().slice(0,220)},
    {id:"cp",header:"",size:60,enableSorting:false,cell:({row})=><button className="ghost cp" onClick={e=>{e.stopPropagation();copy(row.original);}}>{copied===row.original.id?"copied":"copy"}</button>},
  ],[copied]);
  const table=useReactTable({data:rows,columns,state:{sorting,globalFilter:quick,expanded},getRowId:r=>String(r.id),
    onSortingChange:setSorting,onGlobalFilterChange:setQuick,onExpandedChange:setExpanded,getRowCanExpand:()=>true,
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getFilteredRowModel:getFilteredRowModel(),getExpandedRowModel:getExpandedRowModel()});
  const trows=table.getRowModel().rows, box=useRef(null);
  const virt=useVirtualizer({count:trows.length,getScrollElement:()=>box.current,estimateSize:()=>28,overscan:15});
  const vi=virt.getVirtualItems(), pad={top:vi[0]?.start||0,bottom:vi.length?virt.getTotalSize()-vi[vi.length-1].end:0};
  return <>
    <div className="grug-head">{grug}<div><h2 style={{margin:0,display:"flex",gap:8,alignItems:"center"}}>Box logs <Info catalog={meta.catalog}/></h2><div className="muted" style={{fontSize:12}}>one table. no framework. complexity very bad.</div></div></div>
    <div className="lv-bar">
      <select value={f.source} onChange={e=>set("source",e.target.value)}><option value="">All sources</option>{meta.sources.map(s=><option key={s.source} value={s.source}>{s.source} ({s.n})</option>)}</select>
      <select value={f.level} onChange={e=>set("level",e.target.value)}><option value="">All levels</option>{LEVELS.map(l=><option key={l}>{l}</option>)}</select>
      <span className="lv-seg">{RANGES.map(r=><button key={r} className={f.range===r?"on":""} onClick={()=>set("range",r)}>{r}</button>)}</span>
      <form onSubmit={e=>{e.preventDefault();set("q",search);}} style={{display:"flex",gap:6}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search text"/><button>Search</button></form>
      <input value={quick} onChange={e=>setQuick(e.target.value)} placeholder="Quick filter (loaded rows)" style={{width:170}}/>
      <label className="lv-live"><input type="checkbox" checked={live} onChange={e=>setLive(e.target.checked)}/>Live{live&&<span className="dot"/>}</label>
      {busy&&<span className="muted">loading…</span>}<span className="muted">{trows.length} of {rows.length} loaded</span>
    </div>
    <div className="lv-wrap" ref={box}><table className="lv"><thead>{table.getHeaderGroups().map(g=><tr key={g.id}>{g.headers.map(h=>
        <th key={h.id} style={{width:h.getSize()}} onClick={h.column.getToggleSortingHandler()} className={h.column.getCanSort()?"sortable":""}>
          {flexRender(h.column.columnDef.header,h.getContext())}{{asc:" ▲",desc:" ▼"}[h.column.getIsSorted()]||""}</th>)}</tr>)}</thead>
      <tbody>
        {pad.top>0&&<tr><td colSpan={5} style={{height:pad.top,padding:0,border:0}}/></tr>}
        {virt.getVirtualItems().map(v=>{ const r=trows[v.index]; return <tr key={r.id} data-index={v.index} ref={virt.measureElement}
          className={r.getIsExpanded()?"open":""} onClick={r.getToggleExpandedHandler()}>
          {r.getVisibleCells().map(c=><td key={c.id} className={c.column.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>; })}
        {pad.bottom>0&&<tr><td colSpan={5} style={{height:pad.bottom,padding:0,border:0}}/></tr>}
        {!trows.length&&!busy&&<tr><td colSpan={5} className="muted">No log lines match.</td></tr>}</tbody></table></div>
    {more&&<button className="ghost" style={{marginTop:10}} onClick={older}>Load more</button>}
  </>;
}
