#!/usr/bin/env python3
"""Tiny box facts for the dashboard Box page. Reads /proc only; no processes, users or file names.
os_info(): distro, kernel, arch, cores, ram_mb. sample(): cpu % since the last call (via logs/.cpustat), memory, 1-min load."""
import os, json, platform
DIR=os.path.dirname(os.path.abspath(__file__)); CS=os.path.join(DIR,"logs",".cpustat")
def meminfo():
    m={}
    for l in open("/proc/meminfo"):
        k,v=l.split(":",1); m[k]=int(v.split()[0])
    return m
def os_info():
    d="Linux"
    try: d=dict(l.rstrip().split("=",1) for l in open("/etc/os-release") if "=" in l).get("PRETTY_NAME","Linux").strip('"')
    except Exception: pass
    return {"distro":d,"kernel":platform.release(),"arch":platform.machine(),"cores":os.cpu_count() or 0,"ram_mb":meminfo().get("MemTotal",0)//1024}
def sample():
    f=[int(x) for x in open("/proc/stat").readline().split()[1:]]; idle,total=f[3]+(f[4] if len(f)>4 else 0),sum(f)
    cpu=None
    try:
        pi,pt=json.load(open(CS)); cpu=round(100*(1-(idle-pi)/(total-pt)),1) if total>pt else None
    except Exception: pass
    try: json.dump([idle,total],open(CS,"w"))
    except Exception: pass
    m=meminfo(); tot=m.get("MemTotal",0)//1024
    return {"cpu":cpu,"mem_used_mb":tot-m.get("MemAvailable",0)//1024,"mem_total_mb":tot,"load1":round(os.getloadavg()[0],2)}
if __name__=="__main__": print(json.dumps({"os":os_info(),"sample":sample()}))
