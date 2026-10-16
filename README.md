# BF2 Round Replay — сайт

Перегляд раундів Battlefield 2 з файлів `.bf2demo` на карті: хто де бігав, хто кого вбив, прапори, техніка, квитки.
Цей репозиторій — це весь сайт разом зі скриптами для сервера:

```
site/         сам сайт: index.html + assets/ (мапи, іконки, дані про стіни й рельєф для «хто кого бачив»,
              картинки для прев'ю посилань: assets/og)
server/       для VPS: install.sh (ставить усе одним запуском), fetch.mjs (забирає демо з сторінки сервера),
              ingest.mjs (розбирає демо), update.sh (оновлення з GitHub), units.sh (таймери systemd і Caddy),
              systemd/, Caddyfile.in, INSTALL.md
gameserver/   необов'язково: скрипт для ігрового сервера, який сам відсилає демо (якщо є доступ до сервера)
```

Як усе працює:

```
сторінка демо сервера =FL=  ──(раз на день, fetch.mjs)──►  VPS: upload/incoming
(85.17.145.41/karkand/demos)                                 │ ingest.mjs: демо → розібраний раунд (.bfr, у ~6 разів менший);
                                                             │ раунди без гравців і з одним гравцем відкидаються
                                                             ▼
                                data/rounds.json (список, легкий) + data/rounds/*.bfr (раунди)
                                + data/heat/<мапа>.json (точки вбивств: теплова карта всіх раундів, сторінки гравців)
                                + data/share/r|p/*.html (прев'ю посилань /r/<раунд>, /p/<гравець>)
                                                             │ Caddy (HTTPS)
                                                             ▼
                                         браузер: список раундів, раунд відкривається за 1–3 с
GitHub (цей репозиторій)  ──(щохвилини, update.sh: git pull)──►  site/ на VPS
```

Встановлення на VPS — [server/INSTALL.md](server/INSTALL.md).

## Оновлення сайту через GitHub

VPS сам щохвилини дивиться в GitHub. Коли там з'являється новий коміт, він оновлює `site/` і, якщо змінився
розбір демо, перерозбирає всі раунди з їхніх демо (5–15 с на раунд, окремою службою `bf2replay-reprocess` у фоні;
сайт працює далі, і наступна версія з GitHub підтягується теж, не чекаючи кінця перерозбору).
Тобто «викласти нову версію» = зробити `git push`.

### Один раз: створити репозиторій

1. На github.com: **New repository** → назва `bf2-round-replay` → **Private** → без README → **Create**.
2. На Mac, у Terminal (архів від Claude розпакований у `~/bf2-round-replay`):

   ```bash
   cd ~/bf2-round-replay
   git init -b main
   git add .
   git commit -m "BF2 Round Replay v57"
   git remote add origin git@github.com:ТВІЙ_ЛОГІН/bf2-round-replay.git
   git push -u origin main
   ```

   (Якщо `git push` просить пароль або пише «Permission denied (publickey)» — додай свій SSH-ключ у GitHub:
   Settings → SSH and GPG keys, або використай GitHub Desktop: File → Add local repository → Publish.)
3. VPS читає репозиторій через **deploy key** лише на читання (`/root/.ssh/GitHub_bf2_repo` на VPS) — `install.sh`
   сам його створить (або візьме вже наявний) і покаже, що вставити в репозиторії: Settings → Deploy keys →
   Add deploy key (галочку «Allow write access» не ставити).

### Кожна нова версія

Від Claude приходить новий `bf2-round-replay-vNN.zip` (усередині — папка `bf2-round-replay-vNN/`). На Mac:

```bash
V=v81   # номер версії з назви архіву
cd ~/Downloads && rm -rf bf2-round-replay-$V && unzip -q bf2-round-replay-$V.zip
rsync -a --delete --exclude .git bf2-round-replay-$V/ ~/bf2-round-replay/
cd ~/bf2-round-replay && git add -A && git commit -m "$V" && git push
```

За ≤ 1 хвилину нова версія на сайті. Не чекати й хвилини: `sudo systemctl start --no-block bf2replay-update` на VPS
(після `git push`). Перевірити: `journalctl -u bf2replay-update -n 20`.

У браузері: сторінка, її файли (`assets/`) і `version.json` ніколи не беруться з кешу без перевірки, тож звичайне
оновлення сторінки (F5) показує нову версію. Уже відкрита вкладка раз на 2 хвилини (і щоразу, як на неї
повертаються) дивиться у `version.json` і, якщо там новіша версія, показує вгорі плашку **A new version is out: vNN ·
Reload** — Reload відкриває ту саму мить раунду з тим самим бійцем, уже в новій версії.

**Відкат**, якщо нова версія щось зламала: `git revert HEAD && git push` — за хвилину повернеться попередня.

**Простіше:** якщо підключити цей репозиторій до Claude (GitHub-інтеграція), Claude зможе сам робити `git push`
нових версій — тоді не треба ні zip, ні команд.

### Перевірити локально перед push

```bash
cd ~/bf2-round-replay/site && python3 -m http.server 8000
```

і відкрити http://localhost:8000 — без `data/` сайт працює як звичайний переглядач (кнопка «Open .bf2demo»).
