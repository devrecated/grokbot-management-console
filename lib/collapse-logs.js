// Log rows for the viewer. Pure, so it is unit-tested.
// originOf: lines from a bot's own files show that bot; everything else (exec-daemon.log, journal, kernel...) is "system".
export function originOf(source,bots){ const s=String(source||"").toLowerCase();
  for(const b of bots){ for(const k of [b.key,b.name]) if(k&&k.length>=3&&s.includes(String(k).toLowerCase())) return b.name||b.key; }
  return "system"; }
// collapse: rows come newest first. Consecutive lines with the same source, level and message (digits ignored) become one
// row with count; a "(previous line repeated N more times)" line adds N to the line before it.
const REP=/^\(previous line repeated (\d+) more times?\)$/, key=r=>`${r.source}\u0000${r.level}\u0000${String(r.message).replace(/\d+/g,"#")}`;
export function collapse(rows){ const out=[]; // walk oldest -> newest
  for(let i=rows.length-1;i>=0;i--){ const r=rows[i], last=out[out.length-1], m=REP.exec(String(r.message).trim());
    if(m&&last&&last.source===r.source){ last.count+=Number(m[1]); last.last_ts=r.ts; continue; }
    if(last&&key(last)===key(r)){ last.count++; last.last_ts=r.ts; last.last_id=r.id; continue; }
    out.push({...r,count:1,first_ts:r.ts,last_ts:r.ts}); }
  return out.reverse(); }
