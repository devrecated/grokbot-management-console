"use client";
// Editor card: send "change the console" requests to Grok Bot, which hands them to your editor bot.
import { useState } from "react";
export const FIRST_QUESTION="what grug want console do?";
export default function EditorCard({docs,demo}){
  const [text,setText]=useState(""),[note,setNote]=useState(""),[busy,setBusy]=useState(false);
  async function send(){
    if(demo){ setNote("Demo: this would go to Grok Bot as an edit_request, and your editor bot would pick it up. Nothing sent."); return; }
    setBusy(true); const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"edit_request",text})});
    const j=await r.json().catch(()=>({})); setBusy(false);
    if(!r.ok) return setNote("Error: "+(j.error||r.status));
    setText(""); setNote(j.delivered?"Sent to Grok Bot. Follow it in Chat.":"Saved, not delivered"+(j.reason?` (${j.reason})`:"")+".");
  }
  return <div className="bot"><h3>Editor</h3>
    <p style={{marginTop:0}}>Want the console to do something new? Make an <b>editor bot</b> in Grok Bot from the <a href={docs} target="_blank" rel="noreferrer">grugbot-editor template</a>. It changes this app for you: edits the code, keeps it simple, runs a build, commits and deploys with <code>grugbot deploy</code>.</p>
    <p className="muted">First thing it ask: <b>“{FIRST_QUESTION}”</b>. Answer here, or in Grok Bot chat.</p>
    <textarea value={text} onChange={e=>setText(e.target.value)} rows={4} placeholder={FIRST_QUESTION} style={{width:"100%"}} aria-label={FIRST_QUESTION}/>
    <div style={{display:"flex",gap:8,alignItems:"center",marginTop:6}}>
      <button disabled={busy||!text.trim()} onClick={send}>Send to editor bot</button>
      <a href={docs} target="_blank" rel="noreferrer">Editor docs and recipes</a>{note&&<span className="muted">{note}</span>}</div>
    <div className="muted" style={{fontSize:12,marginTop:6}}>Grok Bot only forwards this to your editor bot. It never edits the app on its own. No editor bot yet? It will tell you how to make one.</div></div>;
}
