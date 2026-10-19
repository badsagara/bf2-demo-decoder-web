# BF2 Round Replay — сайт

Перегляд раундів Battlefield 2 з файлів `.bf2demo` на карті: хто де бігав, хто кого вбив, прапори, техніка, квитки.
Цей репозиторій — це весь сайт разом зі скриптами для сервера:

```
site/         сам сайт: index.html + assets/ (мапи, іконки, дані про стіни й рельєф для «хто кого бачив»,
              картинки для прев'ю посилань: assets/og)
server/       для VPS: install.sh (ставить усе одним запуском), fetch.mjs (забирає демо з сторінки сервера),
              ingest.mjs (розбирає демо), update.sh (оновлення з GitHub), units.sh (таймери systemd і Caddy),
              analyze.sh / analyze.mjs (аналіз багатьох раундів для порогів підказок, v175),
              roundsidx.mjs (формат rounds.json, v176),
              systemd/, Caddyfile.in, INSTALL.md
gameserver/   необов'язково: скрипт для ігрового сервера, який сам відсилає демо (якщо є доступ до сервера)
```

Як усе працює:

```
сторінка демо сервера =FL=  ──(кожні 10 хв, fetch.mjs)──►  VPS: upload/incoming
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
розбір демо, перерозбирає всі раунди з їхніх демо (5–15 с на раунд, кілька одночасно — скільки дозволяють ядра й пам'ять, — окремою
службою `bf2replay-reprocess` у фоні; скільки вже зроблено і скільки лишилось — `sudo bf2replay-status` на VPS і
позначка «Updating rounds 25% · ~40 min» у шапці сайту на кожній сторінці (оновлюється кожні 30 с);
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

Від Claude приходять два архіви: `bf2-round-replay-vNN.zip` (сайт) і `bf2-round-replay-vNN-geo.zip` (точні форми
колізій мап для підказки "No line of sight", ~10 МБ, з v111; з v120 там і дерева мап `site/assets/los/*.veg.js`, з v144 —
чіткі мінімапи 2048 px `site/assets/maps_hd/*.webp`, ще ~13 МБ).
Обидва розпаковуються в ту саму папку `bf2-round-replay-vNN/` — потрібні **обидва**, інакше `rsync --delete` прибере
`site/assets/geo` і дерева з репозиторію. На Mac:

```bash
V=v111   # номер версії з назви архіву
cd ~/Downloads && rm -rf bf2-round-replay-$V && for z in bf2-round-replay-$V.zip bf2-round-replay-$V-geo.zip; do unzip -q -o "$z"; done
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

### Адмін-сторінка (з v150)

`https://домен/admin`, за паролем: стан сервера (раунди, черга демо, перерозбір, служби, диск, журнал), кнопки
«розібрати зараз / перерозібрати / скачати зараз / оновити / копія», список серверів, з яких брати демо (додати,
перевірити, прибрати). Пароль задається один раз на VPS — `sudo node /srv/bf2replay/repo/server/admin.mjs
--set-password`; у репозиторії його немає. Решта ставиться сама з оновленням. Докладно — `server/INSTALL.md`, розділ 14.
З v153 там же — пости про нові раунди в Discord / Telegram (вебхук або бот; розділ 15).
З v162 — скільки демо сервер розбирає одночасно (нові й повторно) і як швидко йшло з кожним числом, щоб підібрати
найкраще для VPS (розділ 16).
З v163 — що розбирається зараз і що чекає черги, кнопка Stop; прохід, що застав оновлення, закінчується сам (розділ 17).
З v165 цифри за всі раунди (сторінки гравця, порівняння, мапи, таблиця гравців) рахує сервер у `data/stats`, а сайт
вантажить лише потрібний файл (розділ 18).
З v166 `rounds.json` — короткий рядок на раунд (~0,5 КБ замість ~5), повні дані лише на сервері (розділ 18).
З v175 — аналіз усіх раундів сервера для порогів підказок: `sudo bash /srv/bf2replay/repo/server/analyze.sh start`,
у фоні кілька годин, потім архів для Claude (розділ 19).
З v176 `rounds.json` ще втричі менший: раунд масивом, сервер і команди номерами (6000 раундів: 3,1 → 0,9 МБ; розділ 18).

### Перевірити локально перед push

```bash
cd ~/bf2-round-replay/site && python3 -m http.server 8000
```

і відкрити http://localhost:8000 — без `data/` сайт працює як звичайний переглядач (кнопка «Open .bf2demo»).

## Подяки та сторонній код

Починаючи з v132 частина декодера (табло гравця з його Player ghost, спотер у повідомленні UnitSpotted, розкладка
KilledBy, id шаблонів решти авіації: Mi-28, Su-30MKK, MiG-29, Su-34, Mi-17, F-15E) перенесена з
[Kakarotto22/bf2-replay-viewer](https://github.com/Kakarotto22/bf2-replay-viewer) — розкладки полів, які автор
вивчив із бінарників гри. Перевірено на 9 раундах: табло 176 з 176 гравців, kill feed 2319 з 2319, спотери 843 з 843.
З v133 — розкладки всіх 63 подій гри (кожен пакет читається до кінця: 43154 з 43154), 16-бітні id об'єктів і записів,
посадка в техніку / на парашут, хто випустив кожен снаряд (MissileInit), реанімації за прапорцем «man down», асисти
(316 з 316), підібрані кіти, кіки, командири, медалі, назви сквадів.
З v135 — блок налаштувань сервера (ServerInfo / MapInfo), записи прапорів і груп спавну (ControlPoint, SpawnGroup:
зміни власника прапорів 845 з 845) і решта полів Player ghost (кнопки вогню, час поза зоною бою, час, коли можна
відродитись, обрана точка спавну).
З v136 — нумерація шаблонів на мапах Armored Fury (booster_global), події StickyProjectile, IssueSquadOrder і прапорець
втрати квитків у ScoreManager.
З v140 — повний запис бійця (SoldierNetworkable: вільне падіння, плавання, драбина; 100 % записів 4 раундів).
З v142 — розкладка ігрового HUD (табло Tab і верхня смуга часу й квитків за HudElementsScoreboard.con /
HudElementsMap.con) і виміряні кольори шрифтів; самі текстури й бітмап-шрифти взято з файлів гри (Menu_client.zip,
Fonts_client.zip).
З v156 — нумерація шаблонів Euro Force (техніка рівнів) і Special Forces (xpack) з тієї ж таблиці шаблонів.
З v170 — власні записи об'єктів (SimpleObject: техніка — місце, поворот, очки міцності з шириною поля й wreck за
шаблоном; ящики командира; GenericProjectile — куди дивиться ніс ракети; OverheadCamera — камера командира), поля
здоров'я (8 біт) і запасу спринту в записі бійця, таблиця шаблонів техніки (maxHitPoints / wreckHitPoints).
З v174 — мапи Special Forces: розмір мапи (`assets/world_sizes.json`), назви мап (HUD_LEVELNAME), назви прапорів із
шаблонів ControlPoint кожного режиму й розміру (таблиця шаблонів xpack; прапори демо зіставляються з блоком цих
шаблонів, як у їхньому `TemplateDB.align_level`) і блок даних ротації, надісланий під час раунду.
Їхня ліцензія:

```
MIT License

Copyright (c) 2026 Kakarotto

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Чіткі мінімапи (з v144, `site/assets/maps_hd/*.webp`, 2048 px) зменшено з паку
[High Definition Minimap](https://www.moddb.com/addons/high-definition-minimap) від Deine-Augen (ModDB, 2023:
мінімапи Battlefield 2 у 8192 px). Звичайні мінімапи 512 px (`site/assets/maps`) — з файлів самої гри; для 8 мап
Special Forces (з v174) і вони зменшені з того ж паку (файлів рівнів SF тут немає, тож на цих мапах немає стін,
рельєфу й ліній видимості).
