"use client";
// Bots as a TanStack table: sortable columns, search, click a row to expand description, recent actions and routines.
import { useMemo, useState } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getExpandedRowModel, flexRender } from "@tanstack/react-table";
const fmt=d=>d?new Date(d).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"never";
export default function BotsTable({data}){
  const [sorting,setSorting]=useState([{id:"last_at",desc:true}]),[search,setSearch]=useState(""),[expanded,setExpanded]=useState({});
  const columns=useMemo(()=>[
    {id:"name",header:"Name",accessorKey:"name",cell:({row})=><span style={{display:"flex",gap:8,alignItems:"center"}}><span className="av sm" style={{background:row.original.color||"#1d2330"}}>{(row.original.name||"?")[0]}</span><b>{row.original.name}</b></span>},
    {id:"title",header:"Title",accessorKey:"title"},
    {id:"last_at",header:"Last active (ET)",accessorFn:r=>r.last_at?new Date(r.last_at).getTime():0,cell:({row})=>fmt(row.original.last_at)},
    {id:"actions",header:"Actions 7d",accessorKey:"actions"},
    {id:"routines",header:"Routines",accessorFn:r=>r.routines.length},
    {id:"top",header:"Top tool",accessorKey:"top",cell:c=>c.getValue()?<span className="chip">{c.getValue()}</span>:<span className="muted">–</span>},
  ],[]);
  const table=useReactTable({data,columns,getRowId:r=>r.key,state:{sorting,globalFilter:search,expanded},onSortingChange:setSorting,onGlobalFilterChange:setSearch,onExpandedChange:setExpanded,
    getRowCanExpand:()=>true,globalFilterFn:(row,_,v)=>`${row.original.name} ${row.original.title} ${row.original.description}`.toLowerCase().includes(String(v).toLowerCase()),
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getFilteredRowModel:getFilteredRowModel(),getExpandedRowModel:getExpandedRowModel()});
  const rows=table.getRowModel().rows;
  return <>
    <div className="lv-bar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search bots" style={{width:220}}/><span className="muted">{rows.length} of {data.length} bots</span></div>
    <div className="lv-wrap"><table className="lv bt"><thead>{table.getHeaderGroups().map(g=><tr key={g.id}>{g.headers.map(h=>
      <th key={h.id}><span className="sortable" onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header,h.getContext())}{{asc:" ▲",desc:" ▼"}[h.column.getIsSorted()]||""}</span></th>)}</tr>)}</thead>
      <tbody>{rows.map(r=>[<tr key={r.id} className={r.getIsExpanded()?"open":""} onClick={r.getToggleExpandedHandler()}>
          {r.getVisibleCells().map(c=><td key={c.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>,
        r.getIsExpanded()&&<tr key={r.id+"x"} className="open"><td colSpan={columns.length}><div className="bot-x">
          <div><div className="tip-h">Description</div><p style={{whiteSpace:"pre-wrap",margin:"4px 0"}}>{r.original.description||"–"}</p>
            {r.original.tools.length>0&&<div className="tools">{r.original.tools.map(t=><span key={t.tool} className="chip">{t.tool} {t.n}</span>)}</div>}</div>
          <div><div className="tip-h">Recent actions</div>{r.original.recent.length?<ul className="recent">{r.original.recent.map((e,i)=><li key={i}><span className="muted">{fmt(e.ts)}</span> {e.tool}{e.target?<> → <b>{e.target}</b></>:null}</li>)}</ul>:<p className="muted">none</p>}</div>
          <div><div className="tip-h">Routines</div>{r.original.routines.length?<ul className="recent">{r.original.routines.map(x=><li key={x.routine_id}>{x.name} <span className="muted">{x.schedule_or_trigger}</span>{x.status==="paused"&&<span className="badge-paused" style={{marginLeft:4}}>Paused</span>} <a href={`/chat?thread=${encodeURIComponent("routine:"+x.routine_id)}`} onClick={e=>e.stopPropagation()}>chat</a></li>)}</ul>:<p className="muted">none</p>}</div>
        </div></td></tr>])}
      {!rows.length&&<tr><td colSpan={columns.length} className="muted">No bots match.</td></tr>}</tbody></table></div></>;
}
