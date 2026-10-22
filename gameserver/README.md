# Optional: the game server sends its demos itself

For a server that publishes its demos on a web page (like =FL=) this is **not needed** — the VPS takes the demos from
that page itself (`server/INSTALL.md`, §5). This folder is for a game server you have access to (your own test server,
or when a server's admins want to send their demos right after each round). Every 2 minutes the script sends the new
`.bf2demo` files (and the logger's `round_*.json`) over SFTP to one or more sites. Each file goes to each site once;
first under a temporary `.part` name, so a site never takes half a file.

## Linux

```bash
sudo mkdir -p /opt/bf2replay && sudo cp linux/bf2replay-upload.* /opt/bf2replay/
sudo ssh-keygen -t ed25519 -N '' -C bf2-server-1 -f /opt/bf2replay/id_ed25519
sudo nano /opt/bf2replay/bf2replay-upload.conf      # DEMO_DIR, KEY, TARGETS
# the public key (/opt/bf2replay/id_ed25519.pub) -> on the VPS into /etc/ssh/bf2replay_keys/bf2upload
( sudo crontab -l 2>/dev/null; echo '*/2 * * * * /bin/bash /opt/bf2replay/bf2replay-upload.sh' ) | sudo crontab -
```

Log: `/opt/bf2replay/state/upload.log`.

## Windows

In PowerShell as an administrator (the OpenSSH client is in Windows 10/11 and Server 2019+; if not —
Settings → Apps → Optional features → OpenSSH Client):

```powershell
mkdir C:\BF2Server\bf2replay, C:\ProgramData\bf2replay
copy windows\bf2replay-upload.* C:\BF2Server\bf2replay\
cmd /c ssh-keygen -t ed25519 -N "" -C bf2-server-1 -f C:\ProgramData\bf2replay\id_ed25519
icacls C:\ProgramData\bf2replay\id_ed25519 /inheritance:r /grant:r "SYSTEM:F" "Administrators:F"
notepad C:\BF2Server\bf2replay\bf2replay-upload.conf.ps1     # $DemoDir, $Key, $Targets
schtasks /Create /TN "BF2 Replay upload" /SC MINUTE /MO 2 /RU SYSTEM /RL HIGHEST /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\BF2Server\bf2replay\bf2replay-upload.ps1"
```

The contents of `C:\ProgramData\bf2replay\id_ed25519.pub` → on the VPS into `/etc/ssh/bf2replay_keys/bf2upload` (one
line).
Log: `C:\BF2Server\bf2replay\state\upload.log`.

## Settings

- **DEMO_DIR / $DemoDir** — the folder the server writes its demos into: usually `mods/bf2/demos` in the server's folder;
  if `rotate_demo.py` runs (`sv.autoDemoHook`), its `target_root`.
- **TARGETS / $Targets** — one or more sites: `bf2upload@replay.example.com` or `bf2upload@1.2.3.4:2222`.
- **SINCE** — don't send demos older than a date (`YYYY-MM-DD`); **MIN_BYTES** — don't send smaller ones (empty ones are
  ~400 KB).
- Nothing needs confirming at the first connection: the site's key is remembered by itself (`accept-new`).
