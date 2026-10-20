#!/usr/bin/env python3
"""Collect box logs into a local SQLite DB (logs/box-logs.db). Local only, nothing leaves the box.
Redacts token-like strings, tracks per-file offsets, prunes >30 days and caps DB size. Fail-soft."""
import os, re, glob, sqlite3, time, json, sys
DIR=os.path.dirname(os.path.abspath(__file__)); DB=os.path.join(DIR,"logs","box-logs.db")
MAX_DAYS=30; MAX_MB=50; MAX_LINE=2000; MAX_NEW_PER_FILE=20000
SOURCES=["/var/log/dpkg.log","/var/log/alternatives.log","/var/log/apt/*.log","/tmp/*.log",
         os.path.join(DIR,"runs.jsonl"),os.path.join(DIR,"registry.jsonl")]
# Never collected: agent transcripts, shell histories, box-secrets, cookie seeds, .env/.token files.
DENY=re.compile(r"(transcript|history|secret|cookie|\.env|\.token|credential)",re.I)
RED=[(re.compile(p,re.I),r) for p,r in [
 (r"\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{10,}","[REDACTED_GH]"),(r"\bcrsr_[A-Za-z0-9_\-]{8,}","[REDACTED_CRSR]"),
 (r"\b(sk|rk|pk)[-_](live|test|proj|ant)?[-_]?[A-Za-z0-9_\-]{12,}","[REDACTED_KEY]"),(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}","[REDACTED_SLACK]"),
 (r"\bAKIA[0-9A-Z]{16}\b","[REDACTED_AWS]"),(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}","[REDACTED_JWT]"),
 (r"(bearer|token|authorization)(\s*[:=]\s*|\s+)['\"]?[A-Za-z0-9._~+/=\-]{12,}",r"\1\2[REDACTED]"),
 (r"(password|passwd|pwd|secret|api[_-]?key|access[_-]?key)(\"?\s*[:=]\s*)['\"]?[^\s'\",&]{4,}",r"\1\2[REDACTED]"),
 (r"(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s@/]+@",r"\1://[REDACTED]@"),(r"https?://[^\s/:@]+:[^\s/@]+@","https://[REDACTED]@"),
 (r"\b[A-Fa-f0-9]{40,}\b","[REDACTED_HEX]")]]
def redact(s):
    for p,r in RED: s=p.sub(r,s)
    return s
LVL=re.compile(r"\b(fatal|panic|critical|error|err|fail(?:ed|ure)?|warn(?:ing)?|debug|trace)\b",re.I)
def level(s):
    m=LVL.search(s); k=(m.group(1).lower() if m else "")
    return "error" if k.startswith(("fatal","panic","crit","err","fail")) else "warn" if k.startswith("warn") else "debug" if k in("debug","trace") else "info"
TS=re.compile(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})")
def main():
    db=sqlite3.connect(DB,timeout=30); os.chmod(DB,0o600)
    db.executescript("""create table if not exists logs(id integer primary key, ts text, source text, level text, message text);
     create index if not exists logs_ts on logs(ts); create index if not exists logs_src on logs(source,ts);
     create table if not exists cursors(path text primary key, inode integer, offset integer);""")
    now=time.strftime("%Y-%m-%dT%H:%M:%S"); total=0
    files=sorted({f for g in SOURCES for f in glob.glob(g)})
    for f in files:
        try:
            if DENY.search(f) or not os.path.isfile(f): continue
            st=os.stat(f); row=db.execute("select inode,offset from cursors where path=?",(f,)).fetchone()
            off=row[1] if row and row[0]==st.st_ino and row[1]<=st.st_size else 0
            if off==st.st_size: continue
            src=os.path.basename(f); rows=[]
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
                    rows.append((f"{m.group(1)}T{m.group(2)}" if m else now,src,lv,line))
                    if len(rows)>=MAX_NEW_PER_FILE: break
                else: off=off
            db.executemany("insert into logs(ts,source,level,message) values(?,?,?,?)",rows)
            db.execute("insert or replace into cursors values(?,?,?)",(f,st.st_ino,off)); db.commit(); total+=len(rows)
        except Exception as e: print("skip",f,type(e).__name__,file=sys.stderr)
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
