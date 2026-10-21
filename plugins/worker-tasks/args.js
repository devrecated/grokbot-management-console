// Typed task args: int (min/max), enum (options), text (pattern, max 200). Same rules run on the server and on the box.
export function checkArgs(def, given){
  const out={}, g=given&&typeof given==="object"?given:{};
  for(const a of def.args||[]){
    let v=g[a.name]??a.default;
    if(a.type==="int"){ v=Number(v); if(!Number.isInteger(v)||v<(a.min??-1e9)||v>(a.max??1e9)) return {error:`${a.name}: whole number ${a.min??""}..${a.max??""}`}; }
    else if(a.type==="enum"){ if(!(a.options||[]).includes(v)) return {error:`${a.name}: pick one of ${(a.options||[]).join(", ")}`}; }
    else if(a.type==="text"){ v=String(v??""); if(v.length>200||!new RegExp(`^(?:${a.pattern||"[A-Za-z0-9._-]*"})$`).test(v)) return {error:`${a.name}: not allowed`}; }
    else return {error:`${a.name}: unknown type`};
    out[a.name]=v;
  }
  if(Object.keys(g).some(k=>!(def.args||[]).some(a=>a.name===k))) return {error:"unknown arg"};
  return {args:out};
}
