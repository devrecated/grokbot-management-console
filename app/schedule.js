// Pure helpers: build a 5-field cron + plain-English preview from editor selections.
export const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const t12=(h,m)=>{const H=+h%12||12;return `${H}:${String(m).padStart(2,"0")} ${+h<12?"AM":"PM"}`;};
const ord=n=>n+(["th","st","nd","rd"][(n%100-20)%10]||["th","st","nd","rd"][n%100]||"th");
const list=a=>a.length<=2?a.join(" and "):a.slice(0,-1).join(", ")+" and "+a.at(-1);
export function build(s){
  const [h,m]=(s.time||"08:00").split(":").map(Number);
  switch(s.freq){
    case "hourly": return {cron:`${s.minute||0} * * * *`, human:`Every hour at :${String(s.minute||0).padStart(2,"0")}`};
    case "minutes": { const n=Math.max(1,Math.min(59,+s.n||15)); return {cron:`*/${n} * * * *`, human:`Every ${n} minute${n>1?"s":""}`}; }
    case "hours": { const n=Math.max(1,Math.min(23,+s.n||2)); return {cron:`${s.minute||0} */${n} * * *`, human:`Every ${n} hour${n>1?"s":""} at :${String(s.minute||0).padStart(2,"0")}`}; }
    case "daily": return {cron:`${m} ${h} * * *`, human:`Daily at ${t12(h,m)} ET`};
    case "weekdays": return {cron:`${m} ${h} * * 1-5`, human:`Weekdays at ${t12(h,m)} ET`};
    case "weekly": { const d=(s.days?.length?s.days:[1]).slice().sort(); return {cron:`${m} ${h} * * ${d.join(",")}`, human:`Every ${list(d.map(x=>DAYS[x]))} at ${t12(h,m)} ET`}; }
    case "monthly": { const dom=+s.dom||1; return {cron:`${m} ${h} ${dom} * *`, human:`Monthly on the ${ord(dom)} at ${t12(h,m)} ET`}; }
    case "once": { if(!s.date) return {cron:"",human:"Pick a date"}; const [Y,M,D]=s.date.split("-").map(Number);
      return {cron:`${m} ${h} ${D} ${M} *`, human:`Once on ${new Date(Y,M-1,D).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} at ${t12(h,m)} ET`, once:s.date}; }
    case "custom": { const c=(s.cron||"").trim().split(/\s+/).join(" "); return {cron:c, human:/^\S+ \S+ \S+ \S+ \S+$/.test(c)?`Custom cron "${c}" (ET)`:"Enter 5 cron fields"}; }
  }
  return {cron:"",human:""};
}
// Event-triggered = not a recognizable cron schedule.
export function isEvent(sot){
  const s=String(sot||"").replace(/^CRON_TZ=\S+\s+/,"").replace(/\(paused\)/i,"").trim();
  return !/^\S+ \S+ \S+ \S+ \S+$/.test(s);
}
