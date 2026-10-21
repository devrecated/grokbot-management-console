// Alert email templates and the {{var}} renderer. No server deps, so Settings can preview in the browser.
const grug=(title,color,line)=>`<div style="font-family:Georgia,serif;background:#f6f1e7;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border:3px solid #1d2330;border-radius:10px;padding:20px">
<div style="font-size:28px">🪨 <b style="color:${color}">${title}</b></div>
<p style="font-size:16px">${line}</p>
<table style="font-size:14px;border-collapse:collapse">
<tr><td style="padding:2px 12px 2px 0;color:#666">Routine</td><td><b>{{routine}}</b></td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Bot</td><td>{{bot}}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Status</td><td>{{status}}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666">Time</td><td>{{time}}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#666;vertical-align:top">Says</td><td>{{error}}</td></tr></table>
<p><a href="{{link}}" style="background:#1d2330;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Look at cave wall</a></p>
<p style="color:#999;font-size:12px">grug send one email per run. turn off in Settings.</p></div></div>`;
export const DEFAULT_TEMPLATES={
  alert_fail_subject:"🪨 grug sad: {{routine}} broke",
  alert_fail_html:grug("routine broke","#c5221f","{{bot}} try run <b>{{routine}}</b>. rock fall on it. grug think you look."),
  alert_ok_subject:"🪨 grug happy: {{routine}} done",
  alert_ok_html:grug("routine done","#1e8e3e","{{bot}} run <b>{{routine}}</b>. all good. grug happy."),
};
export const VARS=["routine","bot","status","time","error","link"];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const render=(t,vars,html)=>String(t).replace(/\{\{(\w+)\}\}/g,(m,k)=>VARS.includes(k)?(html?esc(vars[k]):String(vars[k]??"").replace(/[\r\n]+/g," ")):m);
export const templates=s=>Object.fromEntries(Object.keys(DEFAULT_TEMPLATES).map(k=>[k,s[k]||DEFAULT_TEMPLATES[k]]));
