"use client";
// Prompt editor with a plain line diff against the bot's current prompt. Saving creates a pending set_prompt change.
import { useEffect, useState } from "react";
function diff(a,b){ // LCS line diff, fine for prompts (a few hundred lines)
  const A=a.split("\n"), B=b.split("\n"), n=A.length, m=B.length, L=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) L[i][j]=A[i]===B[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const out=[]; let i=0,j=0;
  while(i<n&&j<m){ if(A[i]===B[j]){out.push([" ",A[i]]);i++;j++;} else if(L[i+1][j]>=L[i][j+1]) out.push(["-",A[i++]]); else out.push(["+",B[j++]]); }
  while(i<n) out.push(["-",A[i++]]); while(j<m) out.push(["+",B[j++]]); return out; }
export default function PromptEditor({r,fetching,busy,onSave,onRefetch,onClose}){
  const cur=r.prompt_text||""; const [text,setText]=useState(cur),[show,setShow]=useState(false);
  useEffect(()=>{ if(cur&&!text) setText(cur); },[cur]);
  if(fetching) return <div className="muted">Fetching the current prompt from {r.bot}… this updates by itself. <button className="link" onClick={onClose}>close</button></div>;
  const d=show?diff(cur,text):[], changed=text!==cur;
  return <div>
    <div className="muted" style={{marginBottom:6}}>{r.prompt_fetched_at?`Current prompt as of ${new Date(r.prompt_fetched_at).toLocaleString("en-US",{timeZone:"America/New_York"})} ET`:"No prompt on file yet."} <button className="link" onClick={onRefetch}>refetch</button></div>
    <textarea value={text} onChange={e=>setText(e.target.value)} rows={14} style={{width:"100%",fontFamily:"ui-monospace,monospace",fontSize:12}}/>
    <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}>
      <button disabled={busy||!changed||!text.trim()} onClick={()=>onSave(text)}>Save (needs bot confirm)</button>
      <button className="ghost" onClick={()=>setShow(s=>!s)} disabled={!changed}>{show?"Hide diff":"Show diff"}</button>
      <button className="ghost" onClick={()=>setText(cur)} disabled={!changed}>Reset</button>
      <button className="ghost" onClick={onClose}>Close</button><span className="muted">{text.length} chars</span></div>
    {show&&changed&&<pre className="diff">{d.map(([k,l],i)=><div key={i} className={k==="+"?"add":k==="-"?"del":""}>{k} {l}</div>)}</pre>}
  </div>;
}
