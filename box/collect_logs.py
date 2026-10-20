#!/usr/bin/env python3
"""Collect box logs into a local SQLite DB (logs/box-logs.db). Local only, nothing leaves the box.
Redacts token-like strings, tracks per-file offsets, prunes >30 days and caps DB size. Fail-soft."""
import os, re, glob, sqlite3, time, json, sys
DIR=os.path.dirname(os.path.abspath(__file__)); DB=os.path.join(DIR,"logs","box-logs.db")
MAX_DAYS=30; MAX_MB=50; MAX_LINE=2000; MAX_NEW_PER_FILE=20000
SOURCES=["/var/log/**/*","/tmp/**/*.log","/tmp/**/*.out","/tmp/**/*.err",os.path.expanduser("~/.cache/**/*.log"),
         os.path.expanduser("~/.npm/_logs/*.log"),os.path.join(DIR,"runs.jsonl"),os.path.join(DIR,"registry.jsonl")]
# Browser profile LevelDB ".log" files are binary site-storage databases (session/local storage), not logs.
SKIP_DIRS=re.compile(r"(/agent-data/|/node_modules/|/chrome-profile/|google-chrome|mcp-chrome|/Default/|leveldb|/\.git/|/var/log/journal/|/routine-log/logs/|/sand-data/plugins/)")
BINARY={"wtmp","btmp","lastlog","faillog"}
def proc_outputs():
    """Regular files that running processes (same user) write stdout/stderr to."""
    out=set()
    for fd in glob.glob("/proc/[0-9]*/fd/[12]"):
        try:
            t=os.readlink(fd)
            if t.startswith("/") and os.path.isfile(t): out.add(t)
        except OSError: pass
    return out
def is_text(f):
    try:
        with open(f,"rb") as fh: return b"\0" not in fh.read(4096)
    except OSError: return False
# Never collected: agent transcripts, shell histories, box-secrets, cookie seeds, .env/.token files.
DENY=re.compile(r"(_history$|\.bash_history|\.zsh_history|\.python_history|transcript|secret|cookie|\.env$|\.env\.|\.token|credential|\.pem$|\.key$)",re.I)
RED=[(re.compile(p,re.I),r) for p,r in [
 (r"\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{10,}","[REDACTED_GH]"),(r"\bcrsr_[A-Za-z0-9_\-]{8,}","[REDACTED_CRSR]"),
 (r"\b(sk|rk|pk)[-_](live|test|proj|ant)?[-_]?[A-Za-z0-9_\-]{12,}","[REDACTED_KEY]"),(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}","[REDACTED_SLACK]"),
 (r"\bAKIA[0-9A-Z]{16}\b","[REDACTED_AWS]"),(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}","[REDACTED_JWT]"),
 (r"(bearer|token|authorization)(\s*[:=]\s*|\s+)['\"]?[A-Za-z0-9._~+/=\-]{12,}",r"\1\2[REDACTED]"),
 (r"(password|passwd|pwd|secret|api[_-]?key|access[_-]?key)(\"?\s*[:=]\s*)['\"]?[^\s'\",&]{4,}",r"\1\2[REDACTED]"),
 (r"(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s@/]+@",r"\1://[REDACTED]@"),(r"https?://[^\s/:@]+:[^\s/@]+@","https://[REDACTED]@"),
 (r"\b[A-Fa-f0-9]{40,}\b","[REDACTED_HEX]")]]
ANSI=re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
def redact(s):
    s=ANSI.sub("",s)
    for p,r in RED: s=p.sub(r,s)
    return s
LVL=re.compile(r"\b(fatal|panic|critical|error|err|fail(?:ed|ure)?|warn(?:ing)?|debug|trace)\b",re.I)
def level(s):
    m=LVL.search(s); k=(m.group(1).lower() if m else "")
    return "error" if k.startswith(("fatal","panic","crit","err","fail")) else "warn" if k.startswith("warn") else "debug" if k in("debug","trace") else "info"
TS=re.compile(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})")
import subprocess
def kv(db,k,v=None):
    db.execute("create table if not exists kv(k text primary key, v text)")
    if v is None: r=db.execute("select v from kv where k=?",(k,)).fetchone(); return r[0] if r else None
    db.execute("insert or replace into kv values(?,?)",(k,v))
def run(cmd): return subprocess.run(cmd,capture_output=True,text=True,timeout=20).stdout
def collect_dmesg(db,now):
    out=run(["dmesg","--time-format","iso","--nopager"]).splitlines()
    last=kv(db,"dmesg_last") or ""; new=[l for l in out if l[:31]>last] if last else out
    if not new: return 0
    rows=[(l[:19],"kernel (dmesg)",level(l),redact(l)[:MAX_LINE]) for l in new]
    db.executemany("insert into logs(ts,source,level,message) values(?,?,?,?)",rows); kv(db,"dmesg_last",new[-1][:31]); return len(rows)
def collect_journal(db,now):
    cur=kv(db,"journal_cursor"); cmd=["journalctl","--no-pager","-o","short-iso","--show-cursor","-q"]+(["--after-cursor",cur] if cur else ["-n","2000"])
    lines=run(cmd).splitlines(); rows=[]
    for l in lines:
        if l.startswith("-- cursor: "): kv(db,"journal_cursor",l[11:]); continue
        rows.append((l[:19] if TS.match(l[:19]) else now,"journal",level(l),redact(l)[:MAX_LINE]))
    db.executemany("insert into logs(ts,source,level,message) values(?,?,?,?)",rows); return len(rows)
def collect_network(db,now):
    """One summary line per minute: per-interface byte deltas from /proc/net/dev and a socket summary from ss. No packet capture."""
    cur={}
    for l in open("/proc/net/dev").read().splitlines()[2:]:
        n,d=l.split(":",1); f=d.split(); cur[n.strip()]=(int(f[0]),int(f[8]))
    prev=json.loads(kv(db,"netdev") or "{}"); kv(db,"netdev",json.dumps(cur))
    hb=lambda b:f"{b/1e6:.1f}MB" if b>=1e6 else f"{b/1e3:.0f}kB"
    parts=[f"{n} rx {hb(max(0,c[0]-prev[n][0]))} tx {hb(max(0,c[1]-prev[n][1]))}" for n,c in cur.items() if n in prev and n!="lo"]
    states={}; peers={}
    for l in run(["ss","-tunaH"]).splitlines():
        f=l.split()
        if len(f)<6: continue
        states[f"{f[0]}/{f[1]}"]=states.get(f"{f[0]}/{f[1]}",0)+1
        if f[1]=="ESTAB": p=f[5].rsplit(":",1); peers[p[0]+":"+p[-1]]=peers.get(p[0]+":"+p[-1],0)+1
    top=", ".join(f"{k} x{v}" for k,v in sorted(peers.items(),key=lambda x:-x[1])[:5])
    msg="net/min: "+("; ".join(parts) or "baseline")+" | sockets "+" ".join(f"{k}={v}" for k,v in sorted(states.items()))+(f" | top peers {top}" if top else "")
    db.execute("insert into logs(ts,source,level,message) values(?,?,?,?)",(now,"network (summary)","info",msg)); return 1
def main():
    db=sqlite3.connect(DB,timeout=30); os.chmod(DB,0o600)
    db.executescript("""create table if not exists logs(id integer primary key, ts text, source text, level text, message text);
     create index if not exists logs_ts on logs(ts); create index if not exists logs_src on logs(source,ts);
     create table if not exists cursors(path text primary key, inode integer, offset integer);""")
    now=time.strftime("%Y-%m-%dT%H:%M:%S"); total=0
    files=sorted({f for g in SOURCES for f in glob.glob(g,recursive=True)}|proc_outputs())
    files=[f for f in files if os.path.isfile(f) and not SKIP_DIRS.search(f) and os.path.basename(f) not in BINARY and os.access(f,os.R_OK) and not DENY.search(f)]
    for f in files:
        try:
            st=os.stat(f); row=db.execute("select inode,offset from cursors where path=?",(f,)).fetchone()
            off=row[1] if row and row[0]==st.st_ino and row[1]<=st.st_size else 0
            if off==st.st_size: continue
            if off==0 and not is_text(f): db.execute("insert or replace into cursors values(?,?,?)",(f,st.st_ino,st.st_size)); continue
            src=re.sub(r"^/(tmp|var/log)/","",f).replace(os.path.expanduser("~")+"/","~/"); src=os.path.basename(f) if src.startswith("/") else src
            rows=[]; prev=None; rep=0
            with open(f,"rb") as fh:
                fh.seek(off)
                if off==0 and st.st_size>5_000_000: fh.seek(st.st_size-5_000_000); fh.readline()
                for raw in fh:
                    if not raw.endswith(b"\n"): break
                    off=fh.tell(); line=raw.decode("utf-8","replace").rstrip()
                    if not line.strip(): continue
                    line=redact(line)[:MAX_LINE]; m=TS.search(line[:60])
                    lv=level(line)
                    if src=="runs.jsonl":
                        try: j=json.loads(line); lv={"error":"error","skipped":"warn"}.get(j.get("status"),"info")
                        except Exception: pass
                    key=re.sub(r"\d+","#",line)
                    if key==prev: rep+=1; continue
                    if rep: rows.append((rows[-1][0],src,rows[-1][2],f"(previous line repeated {rep} more times)")); rep=0
                    prev=key
                    rows.append((f"{m.group(1)}T{m.group(2)}" if m else now,src,lv,line))
                    if len(rows)>=MAX_NEW_PER_FILE: break
                else: off=off
            if rep: rows.append((now,src,"info",f"(previous line repeated {rep} more times)"))
            db.executemany("insert into logs(ts,source,level,message) values(?,?,?,?)",rows)
            db.execute("insert or replace into cursors values(?,?,?)",(f,st.st_ino,off)); db.commit(); total+=len(rows)
        except Exception as e: print("skip",f,type(e).__name__,file=sys.stderr)
    for fn in (collect_dmesg,collect_journal,collect_network):
        try: total+=fn(db,now)
        except Exception as e: print("skip",fn.__name__,type(e).__name__,file=sys.stderr)
    db.commit()
    cut=time.strftime("%Y-%m-%dT%H:%M:%S",time.localtime(time.time()-MAX_DAYS*86400))
    db.execute("delete from logs where ts<?",(cut,)); db.commit()
    while os.path.getsize(DB)>MAX_MB*1024*1024:
        n=db.execute("select count(*) from logs").fetchone()[0]
        if n<1000: break
        db.execute("delete from logs where id in (select id from logs order by id limit ?)",(n//5,)); db.commit(); db.execute("vacuum")
    print(f"collected {total} new lines from {len(files)} files; db {os.path.getsize(DB)//1024} KB")
if __name__=="__main__":
    try: main()
    except Exception as e: print("collect failed:",type(e).__name__,file=sys.stderr)
