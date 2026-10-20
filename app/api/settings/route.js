// GET: dashboard (Vercel Auth) or bots (Bearer token). POST: dashboard only.
import { sql } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
export const dynamic="force-dynamic";
export async function GET(){ return Response.json(await getSettings(sql())); }
export async function POST(req){ return Response.json(await saveSettings(sql(), await req.json().catch(()=>({})))); }
