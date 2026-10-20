#!/usr/bin/env python3
"""Print the ship interval in seconds (dashboard Settings > ship_interval_s). Cached in logs/.interval for 5 minutes; falls back to the cache or 60."""
import os, json, time, urllib.request
DIR=os.path.dirname(os.path.abspath(__file__)); C=os.path.join(DIR,"logs",".interval"); OK={15,30,60,300,600}
def cached():
    try: v=int(open(C).read().strip()); return v if v in OK else 60
    except Exception: return 60
if os.path.exists(C) and time.time()-os.path.getmtime(C)<300: print(cached()); raise SystemExit
try:
    env=dict(l.rstrip("\n").split("=",1) for l in open(os.path.join(DIR,".env")) if "=" in l)
    req=urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/")+"/api/settings",headers={"x-vercel-protection-bypass":env.get("VERCEL_BYPASS","")})
    v=int(json.loads(urllib.request.urlopen(req,timeout=10).read()).get("ship_interval_s",60)); v=v if v in OK else 60
except Exception: v=cached()
open(C,"w").write(str(v)); print(v)
