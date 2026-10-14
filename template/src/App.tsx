import { useEffect, useRef, useState, type FormEvent } from 'react';
import Account from './Account';
import { Comments, Rating, ReportButton } from './Community';
import { ApiError, errorMessage } from './api';
import { catalogUrl, externalUrl, mediaUrl, modId, readFilters, type CatalogFilters, type CatalogMod, type CatalogPage } from './catalog';
import { games } from './games';
import LiquidGlass from './LiquidGlass';
import { useSeo } from './seo';

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch('/kikcustom/v1/catalog' + path, { signal, credentials: 'omit' });
  if (!response.ok) throw new ApiError(response.status, response.status === 404 ? 'mod_not_found' : 'request_failed');
  return response.json();
}
function navigate(url: string) { history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }
function useLocation() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  useEffect(() => {
    const update = () => { setLocation(window.location.pathname + window.location.search); };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || !/^(\/|\/mods\/\d+|\/account|\/upload|\/information|\/privacy)$/.test(url.pathname)) return;
      event.preventDefault(); navigate(url.pathname + url.search + url.hash);
    };
    window.addEventListener('popstate', update); document.addEventListener('click', click);
    return () => { window.removeEventListener('popstate', update); document.removeEventListener('click', click); };
  }, []);
  return location;
}
function Header() {
  return <header className="site-header"><div className="header-inner">
    <a className="brand" href="/" aria-label="modsKIK — главная"><img src="/logo_KIKcustom.png" alt="" width="44" height="44" />mods<span>KIK.ru</span></a>
    <nav aria-label="Основная навигация"><a href="/">Главная</a><details><summary>Меню ☰</summary><div className="nav-dropdown">
      <a href="/account">Личный кабинет</a><a href="/information">Информация</a><a href="/privacy">Политика данных</a>
    </div></details><a href="/account" className="nav-account">Личный кабинет</a><a className="button" href="/upload">Добавить мод</a></nav>
  </div></header>;
}
function Cover({ src, title, className = '' }: { src?: string; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img className={className} src={src} alt={title} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <div className={'cover-placeholder ' + className}><img src="/logo_KIKcustom.png" alt="" /><span>Скриншот пока не добавлен</span></div>;
}
function Card({ mod, index }: { mod: CatalogMod; index: number }) {
  const ref = useRef<HTMLElement>(null);
  const [visible,setVisible] = useState(() => !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { threshold: 0.05 });
    observer.observe(ref.current); return ()=>observer.disconnect();
  },[]);
  return <article ref={ref} className={'catalog-card'+(visible?' is-visible':' is-hidden')} style={{transitionDelay:visible ? (index%4)*70+'ms' : '0ms'}}><a href={'/mods/' + mod.id} className="card-link">
    <Cover src={mediaUrl(mod.preview)} title={mod.title} className="card-cover" />
    <LiquidGlass image={mediaUrl(mod.preview)}><span className="text-capsule card-category">{mod.game} · {mod.category}</span>
      <h2 className="text-capsule">{mod.title}</h2>
      <div className="card-meta"><span className="text-capsule">Автор: {mod.author}</span><span className="text-capsule">↓ {mod.downloads.toLocaleString('ru-RU')} · ★ {mod.rating.toFixed(1)}</span></div>
    </LiquidGlass>
  </a></article>;
}
function Catalog({ search }: { search: string }) {
  const filters = readFilters(search);
  const [data, setData] = useState<CatalogPage>();
  const [facets, setFacets] = useState<{game: string; category: string; count: number}[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(filters.search);
  useSeo(filters.game ? 'Моды для ' + filters.game + ' — modsKIK' : 'modsKIK — моды для BeamNG, SnowRunner, ETS 2 и других игр',
    'Каталог игровых модификаций. Выбирайте игру и категорию, смотрите скриншоты и скачивайте моды.', catalogUrl(filters), !!filters.search);
  useEffect(() => {
    const controller = new AbortController();
    get<typeof facets>('/facets', controller.signal).then(setFacets).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setQuery(filters.search);
    get<CatalogPage>(search, controller.signal).then(setData).catch(reason => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, attempt]);
  const update = (changes: Partial<CatalogFilters>) => navigate(catalogUrl({ ...filters, page: 1, ...changes }));
  const submit = (event: FormEvent) => { event.preventDefault(); update({ search: query.trim() }); };
  const allGames = [...new Set([...Object.keys(games), ...facets.map(f => f.game)])];
  const categories = [...new Set([...(games[filters.game] ?? []), ...facets.filter(f => f.game === filters.game).map(f => f.category)])];
  return <main className="catalog-main shell">
    <div className="game-strip" aria-label="Популярные игры">{[
      ['BeamNG DRIVE', 'beamng.png'], ['SnowRunner', 'snowrunner.jpg'], ['ETS 2', 'ETS-2.png'],
      ['GTA 5', 'GTA5.png'], ['Farming Simulator 25', 'FS-25.png'], ['Assetto Corsa', 'AC.png']
    ].map(([game, image]) => <a key={game} href={catalogUrl({game, category:'', search:'', page:1})}><img src={'/media/games/' + image} alt="" /><span>{game}</span></a>)}</div>
    <div className="catalog-layout"><section className="mods-zone" aria-label="Каталог модов">
      <div className="catalog-heading"><div><p className="eyebrow">СООБЩЕСТВО ИГРОВЫХ МОДИФИКАЦИЙ</p><h1>Доступные моды</h1>
        <p className="catalog-count" aria-live="polite">{loading ? 'Загружаем каталог…' : error ? 'Каталог временно недоступен' : 'Найдено модов: ' + (data?.total ?? 0)}</p></div>
        <form className="search-form" role="search" onSubmit={submit}><label htmlFor="mod-search">Найдите свой мод!</label>
          <div><input id="mod-search" type="search" value={query} maxLength={255} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию…" /><button type="submit" aria-label="Найти моды">Найти</button></div></form>
      </div>
      <div className="active-filters"><span>{filters.game || 'Все моды'}{filters.category && ' / ' + filters.category}{filters.search && ' / «' + filters.search + '»'}</span>
        {(filters.game || filters.category || filters.search) && <a href="/">Сбросить фильтры ×</a>}</div>
      {loading ? <div className="catalog-grid" aria-label="Загрузка" aria-busy="true">{[1,2,3,4].map(n => <div key={n} className="card-skeleton" />)}</div>
        : error ? <div role="alert" className="panel empty"><h2>Не удалось загрузить моды</h2><p>{error}</p><button onClick={() => setAttempt(attempt + 1)}>Попробовать снова</button></div>
        : !data?.items.length ? <div className="panel empty"><h2>Моды не найдены</h2><p>Попробуйте другую игру, категорию или название.</p><a className="button" href="/">Все моды</a></div>
        : <><div className="catalog-grid">{data.items.map((mod,index) => <Card key={mod.id} mod={mod} index={index} />)}</div>
          {data.pages > 1 && <nav className="pagination" aria-label="Страницы каталога">
            {data.page > 1 && <a className="button secondary" href={catalogUrl({...filters, page:data.page-1})}>← Назад</a>}
            <span>Страница {data.page} из {data.pages}</span>
            {data.page < data.pages && <a className="button" href={catalogUrl({...filters, page:data.page+1})}>Далее →</a>}
          </nav>}</>}
    </section><aside className="games-column"><h2>Доступные игры</h2>
      <a href={catalogUrl({...filters, game:'', category:'', page:1})} aria-current={!filters.game ? 'true' : undefined}>Все моды <span>{facets.reduce((sum, f) => sum + f.count, 0)}</span></a>
      {allGames.map(game => <div key={game}><a href={catalogUrl({...filters, game, category:'', page:1})} aria-current={filters.game === game ? 'true' : undefined}>{game}<span>{facets.filter(f => f.game === game).reduce((sum, f) => sum + f.count, 0)}</span></a>
        {filters.game === game && categories.length > 0 && <div className="category-list" aria-label={'Категории ' + game}>{categories.map(category =>
          <a key={category} href={catalogUrl({...filters, category, page:1})} aria-current={filters.category === category ? 'true' : undefined}>{category}</a>)}</div>}</div>)}
    </aside></div>
  </main>;
}
function ModPage({ id }: { id: number | null }) {
  const [mod, setMod] = useState<CatalogMod>();
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(!id);
  const [selected, setSelected] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const pictures = mod ? [...new Set([mod.preview, ...mod.screenshots].map(mediaUrl).filter((v): v is string => !!v))] : [];
  useSeo(mod ? mod.title + ' / ' + mod.game + ' — modsKIK' : notFound ? 'Мод не найден — modsKIK' : 'Загрузка мода — modsKIK',
    mod?.description ?? 'Страница игровой модификации.', id ? '/mods/' + id : '/mod.html', notFound || !!error);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setMod(undefined); setError(''); setNotFound(false); setSelected(0);
    get<CatalogMod>('/' + id, controller.signal).then(setMod).catch(reason => {
      if (!controller.signal.aborted) { setNotFound(reason instanceof ApiError && reason.status === 404); setError(errorMessage(reason)); }
    });
    return () => controller.abort();
  }, [id, attempt]);
  if (notFound) return <main className="shell"><div className="panel empty"><h1>Мод не найден</h1><p>Возможно, он удалён или ещё не опубликован.</p><a className="button" href="/">Вернуться в каталог</a></div></main>;
  if (error) return <main className="shell"><div role="alert" className="panel empty"><h1>Не удалось загрузить мод</h1><p>{error}</p><button onClick={() => setAttempt(attempt+1)}>Повторить</button></div></main>;
  if (!mod) return <main className="shell"><p className="loading" role="status">Загрузка мода…</p></main>;
  return <main className="shell detail-main"><nav className="breadcrumbs" aria-label="Хлебные крошки"><a href="/">Все моды</a><span>/</span><a href={catalogUrl({game:mod.game, category:'', search:'', page:1})}>{mod.game}</a><span>/</span><span>{mod.category}</span></nav>
    <article className="detail-panel"><h1>{mod.title}</h1><div className="author-line"><span>Автор: <strong>{mod.author}</strong></span><time dateTime={mod.created_at}>{new Date(mod.created_at).toLocaleDateString('ru-RU')}</time></div>
      <section className="gallery" aria-label="Скриншоты мода">
        <button className="main-screenshot" disabled={!pictures.length} aria-label="Открыть скриншот на весь экран" onClick={() => dialog.current?.showModal()}><Cover src={pictures[selected]} title={mod.title} /></button>
        {pictures.length > 1 && <div className="thumbnails">{pictures.map((src, i) => <button key={src} aria-label={'Скриншот ' + (i+1)} aria-pressed={i===selected} onClick={() => setSelected(i)}><img src={src} alt="" loading="lazy" /></button>)}</div>}
      </section>
      <div className="mod-stats"><div><a className="button download-button" href={'/kikcustom/v1/catalog/' + mod.id + '/download'}>↓ Скачать мод · {mod.size_mb.toLocaleString('ru-RU')} МБ</a><p>Скачиваний: {mod.downloads.toLocaleString('ru-RU')}</p></div>
        <div className="rating-summary" aria-label={'Средний рейтинг ' + mod.rating.toFixed(1) + ' из 5'}><span>★</span> {mod.rating.toFixed(1)} <small>/ 5</small><p>Оценок: {mod.rating_count ?? 0}</p></div></div>
      <Rating id={mod.id} onRated={(rating,rating_count)=>setMod({...mod,rating,rating_count})} />
      <section className="mod-description"><h2>Описание</h2><p>{mod.description}</p></section>
      <ReportButton id={mod.id} />
      {Object.entries(mod.socials).some(([,value]) => externalUrl(value)) && <section className="socials"><h2>Соцсети автора</h2><div>{Object.entries(mod.socials).map(([name,url]) => externalUrl(url) && <a className="button secondary" key={name} href={externalUrl(url)} target="_blank" rel="noopener noreferrer">{name} ↗</a>)}</div></section>}
      <Comments id={mod.id} />
    </article>
    <dialog ref={dialog} className="image-viewer" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }} onKeyDown={e => {
      if (e.key === 'ArrowRight') setSelected((selected+1)%pictures.length);
      if (e.key === 'ArrowLeft') setSelected((selected+pictures.length-1)%pictures.length);
    }}>
      <button className="viewer-close" onClick={() => dialog.current?.close()} aria-label="Закрыть просмотр">×</button>
      <img src={pictures[selected]} alt={mod.title + ' — скриншот ' + (selected+1)} />
      {pictures.length > 1 && <div className="viewer-controls"><button aria-label="Предыдущий скриншот" onClick={() => setSelected((selected+pictures.length-1)%pictures.length)}>←</button><span>{selected+1} / {pictures.length}</span><button aria-label="Следующий скриншот" onClick={() => setSelected((selected+1)%pictures.length)}>→</button></div>}
    </dialog>
  </main>;
}
function Info({ privacy }: { privacy: boolean }) {
  useSeo((privacy ? 'Политика данных' : 'О сайте') + ' — modsKIK', 'Информация о сообществе modsKIK.', privacy ? '/privacy' : '/information');
  return <main className="shell"><section className="panel info-page"><h1>{privacy ? 'Политика данных' : 'О modsKIK'}</h1>
    {privacy ? <><p>Для создания аккаунта используются указанные вами имя, фамилия, логин и email. Пароль хранится в виде хеша. Загруженные архивы и описание сохраняются для проверки модератором.</p><p>Токены входа хранятся только в памяти вкладки. Эта версия сайта не устанавливает аналитические и рекламные cookie.</p><p>При скачивании мода или переходе в соцсети открывается сторонний сервис, на котором действуют его правила обработки данных.</p></> :
      <><p>modsKIK — сообщество авторов и игроков. Здесь можно найти модификации для симуляторов и других игр, выбрать категорию и узнать подробности мода.</p><p>Для публикации войдите в кабинет автора и отправьте архив на проверку. Не загружайте вредоносные файлы и материалы, на распространение которых у вас нет разрешения.</p><a className="button" href="/account">Перейти в кабинет автора</a></>}
  </section></main>;
}
function Missing() {
  useSeo('Страница не найдена — modsKIK', 'Такой страницы нет.', window.location.pathname, true);
  return <main className="shell panel empty"><h1>Страница не найдена</h1><a href="/">В каталог</a></main>;
}
export default function App() {
  const location = useLocation();
  const url = new URL(location, window.location.origin);
  const account = ['/account','/personal_account.html','/Logn_Registration.html','/upload','/upload_mods.html'].includes(url.pathname);
  useEffect(() => { window.scrollTo(0,0); document.querySelectorAll<HTMLDetailsElement>('.site-header details').forEach(el => el.open = false); }, [location]);
  return <><a className="skip-link" href="#content">К содержимому</a><Header /><div id="content">
    {url.pathname === '/' || url.pathname === '/index.html' ? <Catalog search={url.search} /> :
      url.pathname.startsWith('/mods/') || url.pathname === '/mod.html' ? <ModPage key={url.pathname + url.search} id={modId(url.pathname,url.search)} /> :
      account ? <Account key={url.pathname} uploadPage={['/upload','/upload_mods.html'].includes(url.pathname)} /> : url.pathname === '/information' || url.pathname === '/privacy' ? <Info privacy={url.pathname === '/privacy'} /> : <Missing />}
    </div><footer className="site-footer shell"><a className="brand" href="/">mods<span>KIK.ru</span></a><p>Сообщество авторов игровых модификаций</p><a href="/information">О сайте</a><a href="/privacy">Политика данных</a></footer></>;
}
