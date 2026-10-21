// Times shown in the timezone from Settings, with its short label (ET, PT, CET, UTC...).
export const tzLabel=tz=>{ try{ return new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"short"}).formatToParts(new Date()).find(p=>p.type==="timeZoneName")?.value||tz; }catch{ return tz; } };
export const fmtIn=(tz,opts)=>d=>d?new Date(d).toLocaleString("en-US",{timeZone:tz,...opts}):"never";
export const SHORT={month:"short",day:"numeric",hour:"numeric",minute:"2-digit"};
