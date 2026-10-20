"""Which box is this? machine_id = hash of machine-id (stable across reboots); instance_id = hash of machine-id + boot_id (one per boot). Raw ids never leave the box."""
import hashlib, os, socket
def _read(p):
    try: return open(p).read().strip()
    except OSError: return ""
def info():
    boot=_read("/proc/sys/kernel/random/boot_id"); mid=_read("/etc/machine-id") or _read("/var/lib/dbus/machine-id")
    btime=next((int(l.split()[1]) for l in _read("/proc/stat").splitlines() if l.startswith("btime ")),0)
    here=os.path.dirname(os.path.abspath(__file__))
    return {"machine_id":hashlib.sha256(f"grugbot-machine:{mid}".encode()).hexdigest()[:16],"instance_id":hashlib.sha256(f"grugbot:{boot}:{mid}".encode()).hexdigest()[:16],"hostname":socket.gethostname()[:64],
            "boot_time":btime,"version":_read(os.path.join(here,"VERSION"))[:40] or "dev"}
