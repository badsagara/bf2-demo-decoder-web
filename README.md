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
GitHub (цей репозиторій)  ──(кожні 5 хв, update.sh: git pull)──►  site/ на VPS
```

Встановлення на VPS — [server/INSTALL.md](server/INSTALL.md).

## Оновлення сайту через GitHub

VPS сам кожні 5 хвилин дивиться в GitHub. Коли там з'являється новий коміт, він оновлює `site/` і, якщо змінився
розбір демо, перерозбирає всі раунди з їхніх демо (5–10 с на раунд, у фоні; сайт працює далі).
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

Від Claude приходить новий `bf2-round-replay.zip`. На Mac:

```bash
cd ~/Downloads && rm -rf bf2-round-replay-new && mkdir bf2-round-replay-new && unzip -q bf2-round-replay.zip -d bf2-round-replay-new
rsync -a --delete --exclude .git bf2-round-replay-new/bf2-round-replay/ ~/bf2-round-replay/
cd ~/bf2-round-replay && git add -A && git commit -m "v58" && git push
```

За ≤ 5 хвилин нова версія на сайті. Перевірити на VPS: `journalctl -u bf2replay-update -n 20`.

**Відкат**, якщо нова версія щось зламала: `git revert HEAD && git push` — через 5 хвилин повернеться попередня.

**Простіше:** якщо підключити цей репозиторій до Claude (GitHub-інтеграція), Claude зможе сам робити `git push`
нових версій — тоді не треба ні zip, ні команд.

### Перевірити локально перед push

```bash
cd ~/bf2-round-replay/site && python3 -m http.server 8000
```

і відкрити http://localhost:8000 — без `data/` сайт працює як звичайний переглядач (кнопка «Open .bf2demo»).
