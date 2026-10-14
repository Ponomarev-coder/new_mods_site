# modsKIK: React + TypeScript

Главная страница с поиском, выбором игры/категории и пагинацией; страницы модов с галереей, автором, описанием, рейтингом, соцсетями и скачиванием; кабинет автора с регистрацией и загрузкой архивов. Запросы выполняет Rust API, PHP для этих страниц не нужен.

## Локальный запуск

```sh
npm ci
npm run dev
npm test
npm run build
```

Node.js 22.12+, рабочий каталог — `modskik-website/template`. Vite слушает `127.0.0.1:5173`, API — `127.0.0.1:8091`. Добавьте `http://localhost:5173,http://127.0.0.1:5173` в `KIKCUSTOM_ALLOWED_ORIGINS`; при прямом подключении `KIKCUSTOM_TRUSTED_PROXIES` пустой. Старые скриншоты в разработке проксируются через локальный XAMPP (`/modsKIK.ru/uploads/screenshots/`); для другого DocumentRoot измените этот proxy в vite.config.ts.

## Страницы и данные

- `/` — каталог, параметры `game`, `category`, `search`, `page` сохраняются в URL.
- `/mods/123` — мод. Старый `/mod.html?id=123-название` перенаправляется на новый URL в Apache/Rust.
- `/account` — личный кабинет; `/upload` — отдельная загрузка мода. Старые ссылки кабинета и загрузки перенаправляются на соответствующие страницы.
- `/information`, `/privacy` — информация о текущей версии.
- Каталог читает существующую PostgreSQL-таблицу `mods`, только `status = 'approved'`. ID и существующие данные сохраняются. Миграция 2 создаёт совместимую пустую таблицу на новой базе.
- Архивы заявок `kikcustom_uploads` остаются приватными. Одобрение в KIKManagement публикует запись каталога с внешней ссылкой автора и проверенными скриншотами.
- Скачивание перенаправляет на HTTP(S)-ссылку автора/файлообменника и увеличивает счётчик. Получение прямых ссылок из облачных сервисов и проксирование удалённых архивов не переносятся из PHP.
- На странице мода доступны оценки и жалобы для авторизованных пользователей, комментарии для всех и соцсети автора. Старый рейтинг сохраняется при добавлении новых голосов.

## Оформление

Фон скопирован из `logo/avia_logo_mod_№2.png` в `public/media/catalog-background.png`. Карточки используют Canvas-карту смещения и SVG feDisplacementMap по подходу [childrentime/liquid-glass](https://github.com/childrentime/liquid-glass). Текст находится поверх эффекта на белых капсулах `rgba(255,255,255,.8)`. Нет циклического рендера или обработчиков движения мыши: карта обновляется только при изменении размеров. Подробнее: [атрибуция](THIRD_PARTY_NOTICES.md).

Сохранены HTML-файлы подтверждения Google и Яндекс из прежнего сайта. Логотип и favicon — предоставленные logo_KIKcustom PNG/ICO. Manifest использует фактический PNG 1280×1280.

## SEO и production

DocumentRoot должен указывать на `dist`. Vite копирует `public/.htaccess` вместе с robots.txt и иконками. Для поисковиков и прямых переходов Apache проксирует главную, моды и sitemap в Rust, который вставляет title, description, canonical, Open Graph, Twitter и экранированный текст страницы в собранный HTML. Это не требует выполнения JavaScript. Неизвестные моды возвращают HTTP 404 и noindex. Sitemap разбивается на части по 10 000 URL.

Укажите `KIKCUSTOM_FRONTEND_DIST` — абсолютный путь к `dist`, затем перезапустите Rust после сборки. При отсутствии собранного шаблона HTML-маршруты возвращают 503. API JSON продолжает работать. Для другого домена измените canonical origin в `src/seo.ts`, `index.html`, `public/robots.txt` и `KIKCustom-system-core/src/pages.rs`.

Apache должен разрешать .htaccess в dist и иметь rewrite/proxy/proxy_http/headers; готовая конфигурация — [apache-site.conf.example](../deploy/apache-site.conf.example). Она открывает только каталог старых скриншотов через Alias; приватное хранилище архивов остаётся закрытым. CSP допускает React style-атрибуты для SVG-фильтра, но не inline-скрипты. Vite dev/preview служат для разработки; проверять HTTP-статусы и серверное SEO нужно через Apache.

Токены входа хранятся в памяти вкладки. Внутренняя навигация сохраняет вход, перезагрузка требует повторной авторизации.

Полная инструкция: [Ubuntu + Apache](../DEPLOYMENT.md).

## Проверки

`npm test` проверяет API-сессии, фильтры, старые URL и безопасные ссылки; `npm run build` — TypeScript и сборку.
Серверные интеграционные тесты каталога/SEO: задайте `KIKCUSTOM_TEST_DATABASE_URL` для тестовой PostgreSQL и `KIKCUSTOM_FRONTEND_DIST`, затем выполните:

```sh
cargo test --manifest-path KIKCustom-system-core/Cargo.toml --test catalog -- --ignored
```

Команда выполняется из корня репозитория. Тест использует отдельную случайную схему и удаляет только её.
## Community, account and upload pages

`/account` contains the profile/sidebar, own published mods, submission statuses, mod settings, report history and privacy information. `/upload` is a separate form with game/category, archive, external download link, author social links and screenshots. Legacy `/personal_account.html` redirects to `/account`; `/upload_mods.html` redirects to `/upload` through the bundled `.htaccess`.

Mod pages include account ratings, an authenticated report dialog, optional author social links and public plain-text comments. Anonymous comments receive server-generated six-digit `guest-XXXXXX` aliases. User sessions remain in tab memory; SPA navigation preserves them, while a full reload requires login.

Catalogue glass uses the mod's own image and fills the complete information area, including equal-height cards with long titles. Cards reveal/hide as they enter/leave the viewport; reduced-motion and keyboard-focus fallbacks keep the catalogue accessible.

Build the frontend and deploy the resulting dist together with KIKCustom migration 0003 and the updated backend. The Management connector must be configured on the servers for moderation. The external download link is published only after manual review; quarantine archives remain private.
