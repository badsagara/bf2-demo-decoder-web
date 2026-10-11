# Необов'язково: ігровий сервер сам відсилає демо

Для сервера =FL= це **не потрібно** — VPS сам забирає демо з їхньої сторінки (`server/INSTALL.md`, п. 5).
Ця папка — для ігрового сервера, до якого є доступ (свій тестовий сервер, або якщо адміни =FL= захочуть
відсилати демо одразу після раунду). Скрипт кожні 2 хвилини шле нові `.bf2demo` (і `round_*.json` логера) по SFTP
на один або кілька сайтів. Кожен файл іде на кожен сайт один раз; спершу під тимчасовим іменем `.part`,
тож сайт ніколи не бере половину файла.

## Linux

```bash
sudo mkdir -p /opt/bf2replay && sudo cp linux/bf2replay-upload.* /opt/bf2replay/
sudo ssh-keygen -t ed25519 -N '' -C bf2-server-1 -f /opt/bf2replay/id_ed25519
sudo nano /opt/bf2replay/bf2replay-upload.conf      # DEMO_DIR, KEY, TARGETS
# публічний ключ (/opt/bf2replay/id_ed25519.pub) -> на VPS у /etc/ssh/bf2replay_keys/bf2upload
( sudo crontab -l 2>/dev/null; echo '*/2 * * * * /bin/bash /opt/bf2replay/bf2replay-upload.sh' ) | sudo crontab -
```

Журнал: `/opt/bf2replay/state/upload.log`.

## Windows

У PowerShell від адміністратора (клієнт OpenSSH є в Windows 10/11 і Server 2019+; якщо ні —
Settings → Apps → Optional features → OpenSSH Client):

```powershell
mkdir C:\BF2Server\bf2replay, C:\ProgramData\bf2replay
copy windows\bf2replay-upload.* C:\BF2Server\bf2replay\
cmd /c ssh-keygen -t ed25519 -N "" -C bf2-server-1 -f C:\ProgramData\bf2replay\id_ed25519
icacls C:\ProgramData\bf2replay\id_ed25519 /inheritance:r /grant:r "SYSTEM:F" "Administrators:F"
notepad C:\BF2Server\bf2replay\bf2replay-upload.conf.ps1     # $DemoDir, $Key, $Targets
schtasks /Create /TN "BF2 Replay upload" /SC MINUTE /MO 2 /RU SYSTEM /RL HIGHEST /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\BF2Server\bf2replay\bf2replay-upload.ps1"
```

Вміст `C:\ProgramData\bf2replay\id_ed25519.pub` → на VPS у `/etc/ssh/bf2replay_keys/bf2upload` (один рядок).
Журнал: `C:\BF2Server\bf2replay\state\upload.log`.

## Налаштування

- **DEMO_DIR / $DemoDir** — папка, куди сервер пише демо: зазвичай `mods/bf2/demos` у папці сервера; якщо
  працює `rotate_demo.py` (`sv.autoDemoHook`), то його `target_root`.
- **TARGETS / $Targets** — один або кілька сайтів: `bf2upload@replay.example.com` або `bf2upload@1.2.3.4:2222`.
- **SINCE** — не слати демо, старші за дату (`РРРР-ММ-ДД`); **MIN_BYTES** — не слати менші (порожні ~400 KB).
- Під час першого з'єднання нічого підтверджувати не треба: ключ сайту запам'ятовується сам (`accept-new`).
