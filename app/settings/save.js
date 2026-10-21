// One settings patch to /api/settings. Returns the saved settings, or {_error}.
export async function saveSettings(patch){ const r=await fetch("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(patch)});
  return r.ok?r.json():{_error:"Save failed ("+r.status+")"}; }
