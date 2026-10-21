"use client";
// One table for every page, same look as Logs: toolbar with search + count, sortable sticky headers, resizable
// columns, 📌 row pinning (kept in localStorage), first columns pinned left, click a row to expand.
//   columns: TanStack column defs. sub(row) = expanded content. getSubRows = tree rows (Usage). pinKey = localStorage key.
import { useEffect, useMemo, useState } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getExpandedRowModel, flexRender } from "@tanstack/react-table";
export default function GrugTable({data,columns,rowId,search,placeholder="Search",noun="rows",pinKey,sub,getSubRows,sort=[],left=[],toolbar,empty="Nothing here.",onRow,rowClass,expanded:ex,onExpanded,height="72vh",footer}){
  const [sorting,setSorting]=useState(sort),[q,setQ]=useState(""),[exp,setExp]=useState(getSubRows?true:{}),[pins,setPins]=useState([]),[size,setSize]=useState({});
  const expanded=ex??exp, setExpanded=onExpanded??setExp;
  useEffect(()=>{ if(pinKey) try{ setPins(JSON.parse(localStorage.getItem(pinKey)||"[]")); }catch{} },[pinKey]);
  const pin=id=>setPins(p=>{ const n=p.includes(id)?p.filter(x=>x!==id):[...p,id]; localStorage.setItem(pinKey,JSON.stringify(n)); return n; });
  const cols=useMemo(()=>pinKey?[{id:"_pin",header:"",size:34,enableSorting:false,enableResizing:false,cell:({row})=>row.depth?null:
    <button title="pin to top" className={"ghost cp"+(pins.includes(row.id)?" pinned":"")} onClick={e=>{e.stopPropagation();pin(row.id);}}>📌</button>},...columns]:columns,[columns,pins,pinKey]);
  const ids=new Set(data.map((r,i)=>rowId?rowId(r,i):String(i)));
  const table=useReactTable({data,columns:cols,getRowId:rowId,getSubRows,columnResizeMode:"onChange",enableRowPinning:true,keepPinnedRows:true,
    state:{sorting,globalFilter:q,expanded,columnSizing:size,rowPinning:{top:pins.filter(p=>ids.has(p))},columnPinning:{left:[...(pinKey?["_pin"]:[]),...left]}},
    onSortingChange:setSorting,onGlobalFilterChange:setQ,onExpandedChange:setExpanded,onColumnSizingChange:setSize,
    getRowCanExpand:r=>!!sub||!!r.subRows?.length,filterFromLeafRows:true,
    globalFilterFn:(row,_,v)=>(search?search(row.original):JSON.stringify(row.original)).toLowerCase().includes(String(v).toLowerCase()),
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getFilteredRowModel:getFilteredRowModel(),getExpandedRowModel:getExpandedRowModel()});
  const sticky=c=>c.column.getIsPinned()?{position:"sticky",left:c.column.getStart("left"),zIndex:1}:{};
  const rows=[...table.getTopRows(),...table.getCenterRows()], n=table.getFilteredRowModel().rows.filter(r=>!r.depth).length, nc=table.getVisibleLeafColumns().length;
  const tr=r=><tr key={r.id} className={[r.getIsPinned()?"pinrow":"",r.getIsExpanded()&&sub?"open":"",r.depth?"subrow":"",rowClass?.(r.original)||""].join(" ")}
      onClick={()=>onRow?onRow(r.original):sub&&r.toggleExpanded()}>
      {r.getVisibleCells().map(c=><td key={c.id} style={{width:c.column.getSize(),...sticky(c)}}>{flexRender(c.column.columnDef.cell,c.getContext())}</td>)}</tr>;
  return <div className="gt">
    <div className="lv-bar"><input value={q} onChange={e=>setQ(e.target.value)} placeholder={placeholder} style={{width:240}}/>{toolbar}<span className="muted">{n} of {data.length} {noun}</span></div>
    <div className="lv-wrap" style={{maxHeight:height}}><table className="lv gtt" style={{width:table.getTotalSize()}}>
      <thead>{table.getHeaderGroups().map(g=><tr key={g.id}>{g.headers.map(h=><th key={h.id} style={{width:h.getSize(),...sticky(h),zIndex:h.column.getIsPinned()?3:2}}>
        <span className={h.column.getCanSort()?"sortable":""} onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header,h.getContext())}{{asc:" ▲",desc:" ▼"}[h.column.getIsSorted()]||""}</span>
        {h.column.getCanResize()&&<span className={"rz"+(h.column.getIsResizing()?" on":"")} onMouseDown={h.getResizeHandler()} onClick={e=>e.stopPropagation()}/>}</th>)}</tr>)}</thead>
      <tbody>{rows.map(r=>[tr(r),sub&&r.getIsExpanded()&&!r.depth&&<tr key={r.id+"x"} className="open"><td colSpan={nc} className="gt-sub" onClick={e=>e.stopPropagation()}>{sub(r.original,r)}</td></tr>])}
        {!rows.length&&<tr><td colSpan={nc} className="muted">{empty}</td></tr>}</tbody>
      {footer&&<tfoot>{footer}</tfoot>}</table></div></div>;
}
