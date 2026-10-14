# Ubuntu / Timeweb Cloud / Apache2

Репозиторий находится в `/var/www/html/modsKIK`. Сайт — `modskik-website/template`, API сайта — `KIKCustom-system-core`, мессенджер — `system-core`. В командах ниже используйте собственные пароли и домены. Это инструкция для администратора; удалённый сервер автоматически не изменяется.

| URL | Назначение |
| --- | --- |
| `https://modskik.ru/` | React из `modskik-website/template/dist` |
| `/kikcustom/v1/*` | KIKCustom, `127.0.0.1:8091` |
| `/messenger-api/*` | Мессенджер, `127.0.0.1:8090` (префикс снимает Apache) |
| `/messenger-ws` | WebSocket мессенджера, внутренний `/ws` |
| `/auth/*`, `/users/*`, `/messenger/*`, `/health` | Совместимые прямые маршруты десктопного мессенджера |

API сайта не принимает JWT мессенджера. Общая таблица `users` обеспечивает общий логин/пароль и блокировки; каждый сервис создаёт собственную сессию. Redis нужен мессенджеру; KIKCustom использует PostgreSQL.

## 1. Пакеты и сборка

```sh
sudo apt update
sudo apt install apache2 postgresql redis-server libarchive-dev build-essential pkg-config libssl-dev
sudo a2enmod ssl headers proxy proxy_http proxy_wstunnel reqtimeout dir rewrite alias
sudo systemctl enable --now postgresql redis-server
```

Установите поддерживаемый Rust stable (edition 2024) и Node.js 22.12+ / актуальную LTS. Используйте Ubuntu с libarchive 3.7+ и обновлениями безопасности (например, Ubuntu 24.04 LTS); KIKCustom проверяет библиотеку при старте. На Ubuntu amd64 путь — `/usr/lib/x86_64-linux-gnu/libarchive.so.13`; на ARM исправьте его или уберите переменную, чтобы использовать системный loader. Пакет `libarchive-dev` подтягивает нужную runtime-библиотеку; сборка Rust через libloading не требует C-заголовков. Локаль `C.UTF-8` должна быть доступна для имён файлов на русском.

```sh
cd /var/www/html/modsKIK
cargo build --release --locked --manifest-path KIKCustom-system-core/Cargo.toml
cargo build --release --locked --manifest-path system-core/Cargo.toml
cd modskik-website/template
npm ci
npm test
npm run build
```

Не запускайте сборку от пользователя веб-сервера. Сервисам нужен доступ на чтение/исполнение бинарников, Apache — на чтение `dist`.

## 2. PostgreSQL

Сделайте резервную копию существующей БД. Оба сервиса должны подключаться к одной PostgreSQL `data_kik`. Для **пустой** БД создайте её и примените таблицу аккаунтов:

```sh
sudo -u postgres createdb data_kik
sudo -u postgres psql -v ON_ERROR_STOP=1 -d data_kik -f /var/www/html/modsKIK/SQL/users.sql
```

Для существующей базы не создавайте её заново: проверьте актуальные user-миграции, особенно `SQL/2026-06-02_users_public_user_id.sql`, наличие default для public_user_id и уникальность username/email без учёта регистра.

Создайте отдельные роли `kikcustom` и `modskik_messenger` с паролями через `sudo -u postgres psql` и `\password`. Им нужны CONNECT к БД, USAGE/CREATE в целевой схеме, права на используемые таблицы и последовательности. При старте ядра выполняют DDL, включая ALTER общих таблиц: одних DML GRANT недостаточно. Для нового развёртывания удобно создать общую NOLOGIN роль владельца схемы/таблиц, выдать обеим сервисным ролям членство и назначить владельцем существующей `users` и её последовательностей эту роль. Проверьте владельцев всех существующих таблиц перед переключением. Не используйте PostgreSQL superuser для постоянного запуска.

KIKCustom автоматически применяет свои миграции в транзакции. Старые записи `mods` не копируются: новые заявки находятся в `kikcustom_uploads`. Публичный Rust API читает одобренные записи существующей таблицы `mods`; автоматической публикации новых заявок в неё нет. На пустой базе миграция 2 создаёт совместимую таблицу. При существующей `mods` выдайте сервисной роли SELECT и UPDATE(downloads); миграция не меняет её владельца.

## 3. Системные пользователи и секреты

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin kikcustom
sudo useradd --system --no-create-home --shell /usr/sbin/nologin modskik
sudo install -d -m 700 -o kikcustom -g kikcustom /var/lib/kikcustom/quarantine
sudo install -d -m 700 -o modskik -g modskik /var/lib/modskik/messenger
sudo install -d -m 700 /etc/kikcustom /etc/modskik
sudo install -m 600 /var/www/html/modsKIK/KIKCustom-system-core/deploy/kikcustom.env.example /etc/kikcustom/core.env
sudo install -m 600 /var/www/html/modsKIK/system-core/deploy/messenger.env.example /etc/modskik/messenger.env
openssl rand -hex 32
openssl rand -hex 32
```

Если пользователи уже существуют, пропустите их создание. Впишите **разные** полученные секреты и пароли БД в environment-файлы через `sudoedit`. Пароль в PostgreSQL URL должен быть URL-encoded. Шаблоны с CHANGE_ME не запускаются. Для сайтов с другими доменами исправьте origins и Apache; не добавляйте `*`.

Карантин и вложения хранятся в `/var/lib`, даже когда код лежит в `/var/www/html/modsKIK`. Не добавляйте Apache Alias к этим каталогам. Не переносите существующее хранилище вложений без копирования данных и сверки путей с БД.

Мессенджер пока использует PHP-мост для почтовых кодов: настройте PHP CLI, зависимости/SMTP по [system-core README](../system-core/README.md). Почтовая интеграция не нужна для текущего парольного входа KIKCustom.

## 4. systemd

```sh
sudo install -m 644 /var/www/html/modsKIK/KIKCustom-system-core/deploy/kikcustom.service /etc/systemd/system/kikcustom.service
sudo install -m 644 /var/www/html/modsKIK/system-core/deploy/modskik-system-core.service.example /etc/systemd/system/modskik-system-core.service
sudo systemctl daemon-reload
sudo systemctl enable --now kikcustom modskik-system-core
sudo systemctl status kikcustom modskik-system-core
```

При ошибке смотрите `journalctl -u kikcustom -n 100` или `journalctl -u modskik-system-core -n 100`. Секреты не публикуйте в отчётах.

## 5. DNS, TLS и Apache

В Timeweb Cloud направьте A-записи `modskik.ru` и `www.modskik.ru` на публичный IP. Настройте AAAA только при рабочем IPv6. Разрешите входящие 80/443 и ваш SSH-порт в облачном firewall и Ubuntu. Порты 8090/8091/5432/6379 оставьте закрытыми извне.

Получите TLS-сертификат на оба домена (например, Certbot с существующим HTTP VirtualHost). Не включайте SSL-пример до появления указанных сертификатов. Если домен уже обслуживается Apache, объедините конфигурацию с текущим VirtualHost, не создавайте конфликтующий второй.

```sh
sudo install -m 644 /var/www/html/modsKIK/modskik-website/deploy/apache-site.conf.example /etc/apache2/sites-available/mysite-le-ssl.conf 
sudo a2ensite mysite-le-ssl.conf 
sudo apache2ctl configtest
sudo systemctl reload apache2
```

DocumentRoot — **только** `/var/www/html/modsKIK/modskik-website/template/dist`. Включены серверные HTML-маршруты каталога, ограниченные маршруты React и прокси API; исходники, Cargo-файлы и секреты не раздаются. Общий URL сайта и API устраняет необходимость в междоменных запросах браузера.

Если десктопный мессенджер использует `api.modskik.ru`, сохраните его существующий HTTPS VirtualHost и включите туда `system-core/deploy/apache2-modskik-system-core.conf.example`; DNS, сертификат и WebAuthn origin этого домена должны соответствовать друг другу. При необходимости добавьте туда и KIKCustom proxy snippet.

Прокси перезаписывает IP-заголовки; доверенные адреса Rust — только 127.0.0.1. Если перед Apache есть CDN, сначала отдельно настройте `mod_remoteip` с точными адресами доверенных прокси. Не доверяйте произвольному X-Forwarded-For.

## 6. Проверка после запуска

```sh
curl -fsS https://modskik.ru/kikcustom/v1/health
curl -fsS https://modskik.ru/messenger-api/health
```

В браузере: зарегистрируйтесь или войдите, загрузите маленький ZIP/7z/RAR с текстовым файлом, проверьте появление заявки «На проверке», затем выйдите. Архив с паролем, ссылкой, исполняемым файлом или вложенным архивом должен отклоняться. Проверка структуры не заменяет антивирус: для ClamAV задайте KIKCUSTOM_CLAMSCAN и настройте свежие базы.

Текущий этап: каталог существующих одобренных модов, фильтры, страницы модов, галерея, скачивание через перенаправление, серверное SEO, парольный вход, регистрация и приватные заявки. Модераторский интерфейс, публикация новых заявок, отправка отзывов/оценок/жалоб и остальные PHP-функции требуют следующих этапов переноса. Старый PHP-сайт перестанет обслуживаться на основном домене после смены DocumentRoot; при необходимости оставьте его на отдельном временном VirtualHost.

Технические основания: [Apache reverse proxy](https://httpd.apache.org/docs/2.4/howto/reverse_proxy.html), [SPA fallback](https://httpd.apache.org/docs/2.4/mod/mod_dir.html#fallbackresource), [libarchive](https://github.com/libarchive/libarchive), [Vite](https://vite.dev/guide/).

## Ошибка PostgreSQL 42501: permission denied for schema public

Это отказ миграции Rust API, а не Apache. Сообщение systemd `Started` означает запуск процесса; последующий `status=1/FAILURE` означает, что API не поднялся. Остановите цикл перезапусков:

```sh
sudo systemctl stop kikcustom
```

Уточните базу и PostgreSQL-роль из `KIKCUSTOM_DATABASE_URL` в `/etc/kikcustom/core.env`. Не публикуйте URL с паролем. Linux-пользователь из `User=kikcustom` в systemd и роль PostgreSQL — разные сущности. Ниже используются имена из шаблона: `data_kik`, `kikcustom`.

```sh
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d data_kik
```

В psql:

```sql
GRANT CONNECT ON DATABASE data_kik TO kikcustom;
GRANT USAGE, CREATE ON SCHEMA public TO kikcustom;

SELECT has_schema_privilege('kikcustom', 'public', 'USAGE') AS schema_usage,
       has_schema_privilege('kikcustom', 'public', 'CREATE') AS schema_create;

SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename = 'users' OR tablename LIKE 'kikcustom\_%' ESCAPE '\');

\q
```

Выдавайте права в той базе, которую использует API: схема `public` отдельная в каждой базе. `GRANT ALL ON DATABASE` не заменяет права на схему.

Первая миграция также создаёт индексы и выполняет ALTER таблицы `users`. Для ошибки `must be owner of table users` подготовлен [fix-account-permissions.sql](../KIKCustom-system-core/deploy/fix-account-permissions.sql), рассчитанный на PostgreSQL 16+, базу `data_kik` и роли `kikcustom`, `modskik_messenger`. Он создаёт общую NOLOGIN-роль `modskik_accounts_owner`, передаёт ей только `public.users`, сохраняет доступ прежнего владельца и выдаёт права на связанные последовательности. Операции выполняются одной транзакцией, повторный запуск допустим. Данные аккаунтов сохраняются. После копирования SQL-файла на сервер:

```sh
sudo systemctl stop kikcustom
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d data_kik -f /var/www/html/modsKIK/KIKCustom-system-core/deploy/fix-account-permissions.sql
sudo systemctl reset-failed kikcustom
sudo systemctl start kikcustom
```

Проверка в конце SQL должна вернуть `modskik_accounts_owner | t | t`. `GRANT ALL ON TABLE` без членства в роли владельца не даёт права ALTER. Не выдавайте приложению SUPERUSER или членство в роли `postgres`. Если KIKCustom-таблицы ранее создавались другой ролью, проверьте также их владельцев и права доступа.

После исправления:

```sh
sudo systemctl reset-failed kikcustom
sudo systemctl start kikcustom
sudo journalctl -u kikcustom --since "2 minutes ago" --no-pager
curl -fsS -H 'X-Real-IP: 127.0.0.1' http://127.0.0.1:8091/kikcustom/v1/health
curl -fsS https://modskik.ru/kikcustom/v1/health
```

X-Real-IP в локальной проверке нужен при `KIKCUSTOM_TRUSTED_PROXIES=127.0.0.1`; Apache устанавливает его сам для публичного URL.

Имя Apache-конфига может быть `mysite-le-ssl.conf`. Используйте существующий HTTPS VirtualHost в этом файле: переносите туда DocumentRoot, Directory и Include из примера, сохраняя действующие сертификаты. Второй VirtualHost на тот же домен не нужен. Для SQL-ошибки конфигурацию Apache менять или перезагружать не требуется.

Основание: [PostgreSQL: права на схемы](https://www.postgresql.org/docs/17/ddl-schemas.html), [права владельца объектов](https://www.postgresql.org/docs/18/ddl-priv.html).


## Обновление каталога и SEO

1. Пересоберите Rust и frontend. Копируйте `dist` целиком, включая скрытый `.htaccess`.
2. В `/etc/kikcustom/core.env` добавьте:
   `KIKCUSTOM_FRONTEND_DIST=/var/www/html/modsKIK/modskik-website/template/dist`.
3. Роли API нужен доступ к существующей таблице каталога (от владельца таблицы):
   `GRANT SELECT, UPDATE(downloads) ON TABLE public.mods TO kikcustom;`
4. Обновите существующий VirtualHost по `deploy/apache-site.conf.example`: AllowOverride All только в dist, без FallbackResource; Alias только для uploads/screenshots; RequestHeader X-Real-IP для HTML-прокси; модули rewrite, alias, proxy, proxy_http, headers.
5. Выполните `apache2ctl configtest`, затем reload Apache и restart kikcustom.

Проверьте `/`, `/mods/<существующий ID>`, `/mod.html?id=<ID>`, `/sitemap.xml`, `/robots.txt`, `/favicon.ico`. Исходный HTML страницы мода должен содержать его название и canonical без JavaScript. Неодобренный/несуществующий ID должен давать HTTP 404, неизвестный путь и отсутствующий asset — тоже 404. Кабинет исключён из индексации. На другом домене замените SEO-origin в обоих проектах и Sitemap в robots.txt.

Главная читает существующую таблицу `mods`; если в ней нет одобренных записей, отображается пустой каталог. Демонстрационные моды автоматически не добавляются.


## Главная возвращает `{"error":"not_found"}`, Яндекс не скачивает Sitemap

Если `/kikcustom/v1/health` возвращает HTTP 200 с `{"service":"kikcustom","status":"ok"}`, а **оба новых маршрута** `/kikcustom/v1/catalog` и `/kikcustom/pages/home` возвращают HTTP 404 с `{"error":"not_found"}`, запросы доходят до KIKCustom, но запущенная сборка не содержит новых маршрутов. Копирование .rs-файлов, сборка frontend и reload Apache не обновляют работающий Rust-процесс. Нужны сборка backend и restart именно службы `kikcustom`.

Проверьте используемый бинарник:

```sh
sudo systemctl show kikcustom --property=ExecStart --no-pager
```

Ожидаемый путь: `/var/www/html/modsKIK/KIKCustom-system-core/target/release/kikcustom-system-core`. Если ExecStart указывает в другое место, обновите используемый бинарник или настройку службы. После изменения unit-файла выполните `sudo systemctl daemon-reload`.

Для стандартного ExecStart:

```sh
cd /var/www/html/modsKIK
cargo build --release --locked --manifest-path KIKCustom-system-core/Cargo.toml &&
sudo systemctl restart kikcustom &&
sudo systemctl --no-pager --full status kikcustom
```

В действующем `/etc/kikcustom/core.env` (не только в .env.example) должна быть строка:

```ini
KIKCUSTOM_FRONTEND_DIST=/var/www/html/modsKIK/modskik-website/template/dist
```

После изменения environment-файла снова перезапустите kikcustom. Frontend должен быть собран через `npm ci && npm run build` в modskik-website/template.

Проверьте новые маршруты напрямую на сервере, затем через Apache:

```sh
curl -i --max-time 20 -H 'X-Real-IP: 127.0.0.1' http://127.0.0.1:8091/kikcustom/v1/catalog
curl -i --max-time 20 -H 'X-Real-IP: 127.0.0.1' http://127.0.0.1:8091/kikcustom/pages/sitemap.xml
curl -i --max-time 20 https://modskik.ru/
curl -i --max-time 20 https://modskik.ru/sitemap.xml
curl -i --max-time 20 'https://modskik.ru/sitemap.xml?page=1'
```

Главная должна возвращать HTTP 200 и HTML, sitemap и его первая часть — HTTP 200 и application/xml. После этого отправьте `https://modskik.ru/sitemap.xml` на повторную проверку в Яндекс. Доступный robots.txt не устраняет HTTP 404 у самой карты сайта.

Другие ответы требуют другой диагностики:

- `frontend_not_configured` (503): переменная отсутствует в окружении запущенной службы.
- `frontend_not_built` (503): Rust не может прочитать dist/index.html; проверьте сборку, путь и права чтения пользователя kikcustom.
- `internal_error` (500): проверьте `sudo journalctl -u kikcustom -n 60 --no-pager`, миграции и права SELECT на mods.
- Прямой маршрут на 127.0.0.1:8091 работает, а публичный нет: проверьте активный VirtualHost через `sudo apache2ctl -S`, DocumentRoot, AllowOverride и наличие dist/.htaccess.


## KIKCustom падает с PostgreSQL 42601 (syntax error около обратной кавычки)

HTML-страница 503 от Apache вместе с ошибкой SQL 42601 в журнале kikcustom означает, что backend завершился при запуске. В первой версии переноса миграция 2 встраивала общий файл SQL/mods.sql через include_str!; старый серверный файл мог содержать MySQL-синтаксис.

Исправление: src/server.rs теперь подключает самостоятельный PostgreSQL-файл migrations/0002_catalog.sql. Обновите **оба файла KIKCustom-system-core** перед сборкой. Существующая таблица mods и её данные сохраняются; миграция использует CREATE TABLE IF NOT EXISTS. Общий SQL/mods.sql больше не участвует в сборке backend.

```sh
sudo systemctl stop kikcustom
cd /var/www/html/modsKIK
cargo build --release --locked --manifest-path KIKCustom-system-core/Cargo.toml &&
sudo systemctl reset-failed kikcustom &&
sudo systemctl restart kikcustom &&
sudo systemctl --no-pager --full status kikcustom
```

Миграция выполняется транзакционно: при синтаксической ошибке версия не записывается в kikcustom_schema_versions. Исправленный бинарник повторит её автоматически; вручную удалять таблицы, менять записи журнала миграций или импортировать дамп не нужно. Ошибки миграций теперь дополнительно сопровождаются именем SQL-файла в journalctl.

Проверка после запуска:

```sh
curl -i --max-time 20 https://modskik.ru/
curl -i --max-time 20 https://modskik.ru/sitemap.xml
curl -i --max-time 20 'https://modskik.ru/sitemap.xml?page=1'
```

Если служба всё ещё падает, смотрите свежий журнал: `sudo journalctl -u kikcustom --since "2 minutes ago" --no-pager`. Для этой ошибки изменения .env, systemd unit и Apache сами по себе не исправляют встроенный SQL: требуется новая сборка Rust.


## HTTP 500: permission denied for table mods (SQLSTATE 42501)

Подтверждение для стандартных имён базы/роли:

```sh
sudo -u postgres psql -X -d data_kik -v ON_ERROR_STOP=1 -c "SET ROLE kikcustom; SELECT count(*) FROM public.mods WHERE status = 'approved';"
```

Если получено `permission denied for table mods`, выдайте минимальные права:

```sh
sudo -u postgres psql -X -d data_kik -v ON_ERROR_STOP=1 -c "BEGIN; GRANT USAGE ON SCHEMA public TO kikcustom; GRANT SELECT, UPDATE(downloads) ON TABLE public.mods TO kikcustom; COMMIT;"
```

Или выполните подготовленный `KIKCustom-system-core/deploy/fix-catalog-permissions.sql` через psql `-f`. При других именах используйте базу из KIKCUSTOM_DATABASE_URL и параметр `-v api_role=имя_роли`. Скрипт не меняет владельцев, данные или права остальных таблиц. SELECT нужен каталогу и sitemap; UPDATE(downloads) — счётчику скачиваний. Исправление применяется сразу: пересборка и перезапуск служб не требуются.

Проверьте главную, `/sitemap.xml` и `/sitemap.xml?page=1`: ожидается HTTP 200. Интеграционный тест воспроизводит 500 от ограниченной роли и проверяет восстановление всех трёх маршрутов после GRANT; изменение описания и удаление модов этой роли остаются запрещены.

В обновлённом src/error.rs журнал содержит SQLSTATE и статическую подсказку (42501 — права, 42P01 — отсутствующая таблица, 42703 — отсутствующий столбец). Тексты SQL-ошибок, значения параметров и строки подключения не выводятся. Включение расширенного журнала требует обычной пересборки/restart backend, но для уже подтверждённой ошибки прав это не нужно.

## Почта личного кабинета через PHP

Новый кабинет подключает формы смены почты, удаления мода и удаления аккаунта. Смена/восстановление пароля в новый UI не добавлены. Отправка остаётся в PHP (`user_data/request_*.php` и PHPMailer); Rust проверяет свою сессию и вызывает `user_data/kikcustom_mail_bridge.php` через stdin. PHP-сессия в браузере для этих запросов не требуется. Коды KIKmessage и письма кабинета используют общий `user_data/mail_template.php` на основе прежнего `send_kikmessage_code.php`.

Обновите сайт, KIKCustom-system-core, изменённые `user_data` и `security/confirm_profile_change.php` вместе. Миграция `0004_profile_mail.sql` автоматически создаёт таблицу запросов подтверждения и сохраняет изображения оставленных опубликованных модов при удалении аккаунта. Открытие ссылки из письма показывает страницу подтверждения; изменение выполняется только после POST кнопки «Подтвердить». Ссылки одноразовые: смена почты — 24 часа, удаление мода/аккаунта — 1 час.

На Ubuntu 24.04:

```sh
sudo apt install php-cli php-pgsql php8.3-fpm
sudo a2enmod proxy_fcgi setenvif
```

Установите PHP-пакет PHPMailer через Composer в корне `/var/www/html/modsKIK` (используется `vendor/autoload.php`). В `/etc/kikcustom/core.env` добавьте значения из `KIKCustom-system-core/deploy/kikcustom.env.example`: `KIKCUSTOM_MAIL_BRIDGE`, `KIKCUSTOM_MAIL_SITE_ORIGIN`, `KIKCUSTOM_PHP_BIN` и `SMTP_*`. Адрес `KIKCUSTOM_MAIL_SITE_ORIGIN` должен входить в `KIKCUSTOM_ALLOWED_ORIGINS`. PHP-мост использует ту же БД, что `KIKCUSTOM_DATABASE_URL`; пароль БД не передаётся в аргументах процесса. После обновления Rust и environment перезапустите службу.

В Apache откройте только точный Alias `/security/confirm_profile_change.php` из обновлённого `deploy/apache-site.conf.example`, с PHP-FPM handler. Исправьте `/run/php/php8.3-fpm.sock`, если установлена другая версия PHP. Не публикуйте папку `user_data` и CLI-мост. Выполните `sudo apache2ctl configtest` перед reload.

Для HTTP страницы подтверждения задайте `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` в отдельной конфигурации PHP-FPM pool (файл вне репозитория, закрытый для других пользователей). Используйте отдельную PostgreSQL-роль `modskik_profile`. Доступ к существующим таблицам выдаётся администратором после миграции:

```sh
sudo -u postgres psql -X -d data_kik -v api_role=kikcustom -v confirmation_role=modskik_profile \
  -f /var/www/html/modsKIK/KIKCustom-system-core/deploy/mail-permissions.sql
```

Для удаления старых аватаров/скриншотов PHP-FPM также нужен доступ к соответствующим папкам `uploads/avatars` и `uploads/screenshots`. Публичные изображения новых модов остаются в БД и сохраняются, если при удалении аккаунта пользователь оставляет моды. При смене почты старые Rust-сессии отзываются; требуется повторный вход.

Проверка без реальной отправки писем, на отдельной тестовой БД с правом CREATEDB:

```sh
KIKCUSTOM_TEST_DATABASE_URL=postgres://test_user:TEST_PASSWORD@127.0.0.1:5432/postgres \
  python3 tests/test-profile-mail.py
```

Тест создаёт и удаляет собственную временную БД, подменяет PHPMailer захватом письма и проверяет шаблон, владение модом, пароль удаления аккаунта, GET/POST подтверждение, одноразовость ссылки, сохранение публичных изображений и удаление запроса при ошибке отправки. Для реального SMTP дополнительно проверьте отправку из кабинета после настройки сервера.
