# Встановлення на VPS (Ubuntu 22.04 / 24.04)

Ігровий сервер =FL= тут не потрібен і нічого на ньому не ставиться: VPS сам забирає нові демо з веб-сторінки,
на якій сервер їх публікує (ту саму, звідки ти качав демо руками).

Що з'явиться на VPS:

| Що | Як часто | Де дивитися |
|---|---|---|
| сайт через Caddy, HTTPS-сертифікат сам (Let's Encrypt) | постійно | `systemctl status caddy` |
| `fetch.mjs`: нові демо зі сторінки демо → `upload/incoming` | раз на день, о 05:30 (`BF2R_FETCH_AT`) | `journalctl -u bf2replay-fetch` |
| `ingest.mjs`: демо → розібраний раунд, список раундів (раунди без гравців відкидаються) | одразу, як з'явився файл (і кожні 2 хв) | `journalctl -u bf2replay-ingest` |
| `update.sh`: `git pull` з GitHub, оновлення сайту | кожні 5 хв | `journalctl -u bf2replay-update` |
| SFTP-скринька `bf2upload` (для тих, хто сам відсилає демо) | — | необов'язково, п. 8 |

Усе живе в `/srv/bf2replay`: `repo/` (копія GitHub), `site/` (те, що бачать люди), `data/` (демо і раунди),
`upload/incoming/` (вхідні). Налаштування — `/etc/bf2replay.conf`.

## 0. Що потрібно

- **RAM:** розбір найбільшого демо (45 хв, 64 гравці) бере ~600 MB. Якщо в VPS менше 2 GB — додай swap (п. 3).
- **Диск:** раунд з гравцями = демо 10–25 MB + розібраний раунд 2–4 MB. Порожні раунди (~400 KB, ніхто не грав)
  відкидаються. 4 живі раунди на день ≈ 2–3 GB на місяць. Щоб тримати менше — `BF2R_RAW_KEEP_DAYS` (п. 6).
  Коли на диску лишається менше 3 GB (`BF2R_MIN_FREE_GB`), `fetch.mjs` зупиняється і пише це в журнал.
- **Node.js 22, Caddy, git, rsync** — `install.sh` поставить сам.
- **Порти 22, 80, 443** відкриті (і в `ufw`, і у файрволі хостера, якщо він є в панелі).
- **Домен** для HTTPS. Безкоштовно: https://www.duckdns.org → свій піддомен `щось.duckdns.org` → вписати IP VPS.
  Без домену теж працює, але тільки `http://IP`.

## 1. DNS

У DNS домену: запис **A** `replay.твій-домен` → IP VPS (або DuckDNS як вище). Перевірити з Mac:
`dig +short replay.твій-домен` має показати IP VPS. Робити це **до** `install.sh`, бо Caddy одразу просить сертифікат.

## 2. Файрвол

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 3. Swap (якщо RAM < 2 GB)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Запуск install.sh

Спершу репозиторій має бути на GitHub (README.md у корені, «Один раз: створити репозиторій»).
Скопіюй папку `server` з Mac на VPS і запусти:

```bash
# на Mac
scp -r ~/bf2-round-replay/server ТИ@IP_VPS:/tmp/bf2r-server

# на VPS
cd /tmp/bf2r-server
sudo BF2R_REPO=git@github.com:ТВІЙ_ЛОГІН/bf2-round-replay.git \
     BF2R_DOMAIN=replay.твій-домен \
     BF2R_FETCH_URLS=http://85.17.145.41/karkand/demos/ \
     bash install.sh
```

GitHub читається від root з ключем **`/root/.ssh/GitHub_bf2_repo`** (інший шлях — `BF2R_GIT_KEY=…`). Якщо такого файла
немає, скрипт сам створить ключ, зупиниться на кроці «Repository» і покаже публічну частину
(`/root/.ssh/GitHub_bf2_repo.pub`, рядок `ssh-ed25519 AAAA… bf2replay@…`). Якщо ключ уже є — візьме його
(він має бути без пароля; права 600 скрипт поставить сам, а якщо нема `.pub` — зробить його з ключа).
Свій `/root/.ssh/config` скрипт для GitHub не читає (там можуть бути опції з Mac, як-от `UseKeychain`). Встав публічний ключ у GitHub: репозиторій → Settings → Deploy keys →
Add deploy key, назва `bf2replay VPS`, «Allow write access» **не** ставити → Add key. Потім Enter у вікні скрипта —
він продовжить. Перевірити ключ окремо:

```bash
sudo ssh -F /dev/null -i /root/.ssh/GitHub_bf2_repo -o IdentitiesOnly=yes -T git@github.com   # Hi ЛОГІН/bf2-round-replay! ...
```

Сам `git pull` (кожні 5 хв) теж іде від root з цим ключем (він записаний у `/srv/bf2replay/repo/.git/config`,
`core.sshCommand`); розбір демо й завантаження — від користувача `bf2replay`.

Наприкінці він напише адресу сайту. Перше завантаження стартує одразу після встановлення (бере все, що є на
сторінці, найновіші першими; раунди з'являються на сайті по одному, щойно розібрані), далі — раз на день.

`install.sh` можна запускати повторно: дані й ключі лишаються. Змінні тоді можна не задавати — вони беруться з
`/etc/bf2replay.conf`; ті, що задані, замінюють старі (напр. `sudo BF2R_DOMAIN=новий.домен bash install.sh`).

## 5. Звідки брати демо (BF2R_FETCH_URLS)

Сервер =FL= Strike at Karkand викладає демо тут: **http://85.17.145.41/karkand/demos/** (звичайний список файлів).
Раз на день (о `BF2R_FETCH_AT`, 05:30 за годинником VPS — `timedatectl`) `fetch.mjs` бере з цієї сторінки всі
посилання на `*.bf2demo` і качає кожне **один раз** (список скачаного — `data/.fetched.json`), найновіші першими,
з паузою 1 с між файлами. Файл, який ще пишеться (змінювався < 3 хв тому — раунд іде), бере наступного дня.
`ingest.mjs` розбирає кожне демо: раунд, де грали хоча б двоє (`BF2R_MIN_PLAYERS`), з'являється на сайті; порожній
(~400 KB, ніхто не заходив або ніхто не з'явився на полі) і раунд з одним гравцем видаляються. Кілька сторінок — через пробіл.

Подивитися, що він скачав би, нічого не качаючи (скільки файлів і скільки MB, і скільки вільно на диску):

```bash
sudo -u bf2replay node /srv/bf2replay/repo/server/fetch.mjs --list | tail -3
```

Ввічливо попередити адмінів =FL=, що сайт бере демо з їхньої сторінки: раз на день, кожне один раз, 10–25 MB на
живий раунд (порожні ~400 KB).

## 6. Налаштування: /etc/bf2replay.conf

| Параметр | Що робить | За замовчуванням |
|---|---|---|
| `BF2R_FETCH_URLS` | сторінки з демо, через пробіл | порожньо |
| `BF2R_FETCH_AT` | коли качати, раз на день, `ГГ:ХХ` за годинником VPS | 05:30 |
| `BF2R_FETCH_SINCE` | `РРРР-ММ-ДД`: не брати демо, записані раніше | порожньо = все зі сторінки |
| `BF2R_FETCH_MAX` | скільки демо за раз (решта — наступного дня) | 0 = без обмеження |
| `BF2R_FETCH_MIN_BYTES` | не качати менші (порожній раунд ~400 KB; без цього їх відкидає розбір) | 0 |
| `BF2R_FETCH_PAUSE` | секунд між двома файлами | 1 |
| `BF2R_MIN_FREE_GB` | не качати, коли на диску менше стількох GB | 3 |
| `BF2R_MIN_PLAYERS` | раунд, де на полі було менше гравців, не з'являється на сайті (`2`: один гравець на порожньому сервері — ні) | 2 |
| `BF2R_KEEP_EMPTY` | `1` = зберігати демо порожніх раундів (і раундів з замалою кількістю гравців) у `data/empty` | 0 |
| `BF2R_RAW_KEEP_DAYS` | через N днів видаляти саме демо, розібраний раунд лишається | 0 = не видаляти |

Після зміни нічого перезапускати не треба — наступний прохід візьме нові значення (новий `BF2R_FETCH_AT` —
за ≤ 5 хв, його ставить `update.sh`; перевірити: `systemctl list-timers bf2replay-fetch`).
Увага щодо `BF2R_RAW_KEEP_DAYS`: раунд без демо не можна перерозібрати після оновлення розбору — він лишиться
таким, як був розібраний.

## 7. Корисні команди

```bash
systemctl list-timers 'bf2replay-*'                       # коли що запускалося і коли наступного разу
journalctl -u 'bf2replay-*' -f                             # живий журнал усього
sudo systemctl start --no-block bf2replay-fetch           # забрати нові демо зараз, не чекаючи ранку
journalctl -u bf2replay-fetch -n 30 --no-pager            # що скачав останнього разу (рядок "fetched N demos" в кінці)
sudo systemctl start bf2replay-update                     # підтягнути GitHub зараз
ls -lh /srv/bf2replay/data/rounds /srv/bf2replay/data/demos

# демо, скачане руками (напр. з Mac через scp у /tmp):
sudo install -o bf2replay -g bf2replay -m 644 /tmp/auto_….bf2demo /srv/bf2replay/upload/incoming/

# перерозібрати все з демо (напр. якщо щось пішло не так):
sudo -u bf2replay flock /srv/bf2replay/data/.ingest.lock node /srv/bf2replay/repo/server/ingest.mjs --rebuild
```

Резервна копія: достатньо `/srv/bf2replay/data/demos` (усе інше відновлюється з демо через `--rebuild`)
і `/etc/bf2replay.conf`.

## 8. Необов'язково: демо, які відсилають самі

Якщо колись буде свій ігровий сервер (або адміни =FL= захочуть самі відсилати демо) — на ньому ставиться скрипт з
папки `gameserver/` (див. її README), а тут додається його публічний ключ, один рядок на сервер:

```bash
echo 'ssh-ed25519 AAAA… bf2-server-1' | sudo tee -a /etc/ssh/bf2replay_keys/bf2upload
```

Користувач `bf2upload` може тільки класти файли в `incoming/` по SFTP: без shell, без доступу до решти диска,
без тунелів.

## 9. apt-get update падає (на VPS уже є чужі джерела пакетів)

`install.sh` зупиняється, якщо `apt-get update` пише `E: …`. Найчастіше це старе джерело Webmin
(`download.webmin.com/download/repository sarge`, ключ DSA-1024, який Ubuntu 24.04 більше не приймає):

```bash
grep -rn webmin /etc/apt/sources.list /etc/apt/sources.list.d/        # де записане старе джерело
sudo sed -i 's|^deb .*download.webmin.com/download/repository.*|# &|' /etc/apt/sources.list /etc/apt/sources.list.d/*.list
curl -o /tmp/webmin-setup-repo.sh https://raw.githubusercontent.com/webmin/webmin/master/webmin-setup-repo.sh
sudo sh /tmp/webmin-setup-repo.sh                                    # нове джерело Webmin з новим ключем
sudo apt-get update                                                   # має пройти без E:
```

Webmin слухає порт 10000; якщо ним користуєшся, після `ufw enable` відкрий його лише для своєї IP:
`sudo ufw allow from ТВОЯ_IP to any port 10000 proto tcp`.

## 10. Якщо на VPS уже є nginx (або інший веб-сервер на 80/443)

`install.sh` це помітить і зупиниться. Тоді запусти його з `BF2R_WEB=none` (Caddy не ставиться) і підключи сайт
до nginx за прикладом `nginx-example.conf` (там же команда для HTTPS через certbot).

## 11. Посилання з прев'ю (раунд, гравець)

Кнопка **Copy link** дає посилання виду `https://твій-домен/r/auto_2026_10_11_20_17_46?t=466&p=…` (раунд у потрібну
мить, за гравцем) і `https://твій-домен/p/puika_mk3` (сторінка гравця за всі раунди). Telegram, Discord, Slack,
WhatsApp показують під таким посиланням назву мапи й дату, хто виграв і з яким рахунком, скільки гравців і вбивств,
найкращого гравця (для гравця: його раунди, вбивства й смерті, K/D) і картинку мапи. Відкрите посилання одразу веде на
сам сайт.

Ці маленькі сторінки пише `ingest.mjs` у `data/share/` (разом із раундами); Caddy віддає їх за `/r/*` і `/p/*`
(`Caddyfile.in`, свіжа версія стає сама: `units.sh` при кожному `update.sh`). Для картинок і посилань у прев'ю потрібен
`BF2R_DOMAIN` (без домену прев'ю буде без картинки в частині месенджерів). З nginx — блок `location ~ ^/([rp])/` з
`nginx-example.conf` треба додати руками.

Для довгого списку раундів точки вбивств винесено з `data/rounds.json` у `data/heat/<мапа>.json`: список на сайті
вантажиться в ~8 разів менший, а точки — лише для теплової карти всіх раундів і для сторінок гравців.

## 12. Уже встановлено раніше: перейти на щоденне завантаження з =FL=

Таймери тепер оновлюються самі з GitHub (`units.sh`, його кличе `update.sh`), але версія `update.sh`, яка вже
стоїть, цього ще не вміє — тому один раз руками:

```bash
# 1. після git push: підтягнути нову версію зараз (а не через ≤ 5 хв) і перевірити
sudo systemctl start bf2replay-update && journalctl -u bf2replay-update -n 5 --no-pager

# 2. подивитися, що буде скачано: скільки демо, скільки MB, скільки вільно на диску (нічого не качає)
sudo -u bf2replay env BF2R_FETCH_URLS=http://85.17.145.41/karkand/demos/ BF2R_FETCH_SINCE= \
     node /srv/bf2replay/repo/server/fetch.mjs --list | tail -3

# 3. увімкнути: сторінка =FL=, усі демо (без дати), без обмеження за раз; таймер раз на день; перше завантаження - одразу
cd /srv/bf2replay/repo/server
sudo BF2R_FETCH_URLS=http://85.17.145.41/karkand/demos/ BF2R_FETCH_SINCE= BF2R_FETCH_MAX=0 bash install.sh

# 4. дивитися, як качає і розбирає (Ctrl+C - вийти; воно працює далі)
journalctl -u bf2replay-fetch -u bf2replay-ingest -f
systemctl list-timers 'bf2replay-*'          # bf2replay-fetch: наступний запуск завтра о 05:30
```

Інший час — `BF2R_FETCH_AT=ГГ:ХХ` у `/etc/bf2replay.conf` (або в команді п. 3).
