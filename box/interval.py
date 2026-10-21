#!/usr/bin/env python3
"""Print the loop sleep in seconds: min(ship_interval_s, heartbeat_interval_s) from dashboard Settings.
Settings are cached in logs/.settings for 5 minutes; falls back to the cache, then 60/60. `interval.py ship|heartbeat` prints one value."""
import os, sys, json, time, urllib.request
DIR=os.path.dirname(os.path.abspath(__file__)); C=os.path.join(DIR,"logs",".settings")
OK={"ship_interval_s":{15,30,60,300,600},"heartbeat_interval_s":{30,60,300,600}}
def clean(s): return {k:(s.get(k) if s.get(k) in v else 60) for k,v in OK.items()}
def cached():
    try: return clean(json.load(open(C)))
    except Exception: return clean({})
def settings():
    if os.path.exists(C) and time.time()-os.path.getmtime(C)<300: return cached()
    try:
        env=dict(l.rstrip("\n").split("=",1) for l in open(os.path.join(DIR,".env")) if "=" in l)
        req=urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/")+"/api/settings",headers={"x-vercel-protection-bypass":env.get("VERCEL_BYPASS","")})
        s=clean(json.loads(urllib.request.urlopen(req,timeout=10).read()))
    except Exception: s=cached()
    os.makedirs(os.path.dirname(C),exist_ok=True); json.dump(s,open(C,"w")); return s
if __name__=="__main__":
    s=settings(); w=(sys.argv[1:] or [""])[0]
    print(s["ship_interval_s"] if w=="ship" else s["heartbeat_interval_s"] if w=="heartbeat" else min(s.values()))
