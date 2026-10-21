// Rebuild after plugin changes (plugins are bundled at build time, see plugins/load.mjs).
// GET: what can this console use to redeploy? POST: do it.
//  1. VERCEL_TOKEN (Secret env var): redeploy this deployment to production through the Vercel REST API. Needs the
//     system env vars VERCEL_PROJECT_ID and VERCEL_DEPLOYMENT_ID ("Automatically expose System Environment Variables",
//     on by default). Team: VERCEL_TEAM_ID, else the only team the token can see. Works for Git and file deploys.
//  2. VERCEL_DEPLOY_HOOK_URL (Secret env var): POST the hook. Needs a Git-connected project.
//  3. Neither: say how to do it by hand.
// Browser route: protected by your host's auth (Vercel Authentication), like the other dashboard routes.
export const dynamic="force-dynamic";
const E=process.env, API="https://api.vercel.com";
const HOW="No redeploy method set. Plugins are bundled at build time, so rebuild to apply. On Vercel: create a token at vercel.com/account/tokens (scope it to the team that owns this project), add it as VERCEL_TOKEN (type Secret, Production) in Project Settings > Environment Variables, keep 'Automatically expose System Environment Variables' on, then redeploy once by hand (Deployments > ... > Redeploy). After that this button redeploys for you. Self-hosted: run npm run build, then restart the server.";
const sys=()=>({project:E.VERCEL_PROJECT_ID||"",deployment:E.VERCEL_DEPLOYMENT_ID||""});
export function status(){ const s=sys(), token=!!E.VERCEL_TOKEN, hook=!!E.VERCEL_DEPLOY_HOOK_URL;
  const missing=token&&(!s.project||!s.deployment)?"VERCEL_TOKEN is set but VERCEL_PROJECT_ID / VERCEL_DEPLOYMENT_ID are missing: turn on 'Automatically expose System Environment Variables' in Project Settings > Environment Variables and redeploy once.":"";
  return {method:token&&!missing?"token":hook?"hook":"none",token,hook,missing,how:HOW}; }
export async function GET(){ return Response.json(status()); }
async function team(h){ if(E.VERCEL_TEAM_ID) return E.VERCEL_TEAM_ID;
  const j=await (await fetch(`${API}/v2/teams`,{headers:h})).json().catch(()=>({}));
  return j.teams?.length===1?j.teams[0].id:""; }
export async function POST(){ const st=status();
  if(st.method==="token"){ const h={authorization:`Bearer ${E.VERCEL_TOKEN}`,"content-type":"application/json"}, s=sys();
    try{ const t=await team(h), qs=t?`?teamId=${encodeURIComponent(t)}&forceNew=1`:"?forceNew=1";
      const r=await fetch(`${API}/v13/deployments${qs}`,{method:"POST",headers:h,body:JSON.stringify({name:s.project,project:s.project,deploymentId:s.deployment,target:"production"})});
      const j=await r.json().catch(()=>({}));
      if(r.ok) return Response.json({triggered:true,via:"token",url:j.url?`https://${j.url}`:null});
      return Response.json({triggered:false,how:`Vercel API said ${r.status}: ${j.error?.message||"unknown error"}. Check the token can see this project's team (or set VERCEL_TEAM_ID). ${HOW}`}); }
    catch{ return Response.json({triggered:false,how:"Could not reach the Vercel API. "+HOW}); } }
  if(st.method==="hook"){ const u=E.VERCEL_DEPLOY_HOOK_URL;
    if(!/^https:\/\/api\.vercel\.com\//.test(u)) return Response.json({triggered:false,how:"VERCEL_DEPLOY_HOOK_URL must start with https://api.vercel.com/"},{status:400});
    const r=await fetch(u,{method:"POST"}).catch(()=>null);
    return Response.json(r?.ok?{triggered:true,via:"hook"}:{triggered:false,how:`Deploy hook failed (${r?r.status:"network"}). ${HOW}`}); }
  return Response.json({triggered:false,how:st.missing||HOW}); }
