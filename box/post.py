# Soft POST to deployed dashboard. Reads ROUTINE_LOG_URL, ROUTINE_LOG_TOKEN, VERCEL_BYPASS from .env next to this file.
import sys, json, os, urllib.request
def post(endpoint, rec):
    try:
        p=os.path.join(os.path.dirname(os.path.abspath(__file__)),".env"); env={}
        if not os.path.exists(p): return
        for l in open(p):
            if "=" in l: k,v=l.rstrip("\n").split("=",1); env[k]=v
        if not env.get("ROUTINE_LOG_URL"): return
        req=urllib.request.Request(env["ROUTINE_LOG_URL"].rstrip("/")+"/api/"+endpoint, data=json.dumps(rec).encode(),
            headers={"content-type":"application/json","authorization":"Bearer "+env.get("ROUTINE_LOG_TOKEN",""),"x-vercel-protection-bypass":env.get("VERCEL_BYPASS","")})
        urllib.request.urlopen(req, timeout=8).read()
    except Exception as e:
        print(f"routine-log: remote post skipped ({type(e).__name__})", file=sys.stderr)
