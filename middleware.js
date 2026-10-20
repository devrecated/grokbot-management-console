// DEMO_MODE only: browser writes never touch the in-memory DB. They get a fake "ok" and demo-shim.js
// fakes the result in the page. Bot-facing routes answer 403 so nobody mistakes the demo for a real console.
import { NextResponse } from "next/server";
export const config={matcher:"/api/:path*"};
export function middleware(req){
  if(!(process.env.DEMO_MODE==="1"||process.env.DEMO_MODE==="true")||req.method==="GET") return NextResponse.next();
  return NextResponse.json({ok:true,demo:true,delivered:false,reason:"demo mode: nothing is saved"},{status:200});
}
