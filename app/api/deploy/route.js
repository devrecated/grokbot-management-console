// Rebuild after plugin changes (plugins are bundled at build time, see plugins/load.mjs).
// GET: is a deploy hook set? POST: call it. VERCEL_DEPLOY_HOOK_URL is optional; store it as a Secret env var.
// Browser route: protected by your host's auth (Vercel Authentication), like the other dashboard routes.
export const dynamic="force-dynamic";
const HOW="No deploy hook set. Plugins are bundled at build time, so rebuild to apply: on Vercel, Deployments > ... > Redeploy (or add VERCEL_DEPLOY_HOOK_URL from Settings > Git > Deploy Hooks). Self-hosted: run npm run build, then restart the server.";
export async function GET(){ return Response.json({hook:!!process.env.VERCEL_DEPLOY_HOOK_URL,how:HOW}); }
export async function POST(){ const u=process.env.VERCEL_DEPLOY_HOOK_URL;
  if(!u) return Response.json({triggered:false,how:HOW});
  if(!/^https:\/\/api\.vercel\.com\//.test(u)) return Response.json({triggered:false,how:"VERCEL_DEPLOY_HOOK_URL must start with https://api.vercel.com/"},{status:400});
  const r=await fetch(u,{method:"POST"}).catch(()=>null);
  return Response.json(r?.ok?{triggered:true}:{triggered:false,how:`Deploy hook failed (${r?r.status:"network"}). ${HOW}`}); }
