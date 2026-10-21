"use client";
// Chat plugin settings. Shown in Settings only while the plugin is on.
import { useState } from "react";
import { saveSettings } from "@/app/settings/save";
export default function ChatSettings({initial}){
  const [on,setOn]=useState(initial.always_reply_in_chat),[note,setNote]=useState("");
  const set=async v=>{ setNote("Saving…"); const j=await saveSettings({always_reply_in_chat:v}); if(j._error) return setNote(j._error); setOn(j.always_reply_in_chat); setNote("Saved"); };
  return <div><label className="srow"><input type="checkbox" checked={on} onChange={e=>set(e.target.checked)}/>
    <span><b>Always reply in Grok Bot chat</b><div className="muted">Mirror every chat reply and every pause, resume, schedule and trigger result to Grok Bot chat, as well as this dashboard.</div></span></label>
    {note&&<div className="muted">{note}</div>}</div>;
}
