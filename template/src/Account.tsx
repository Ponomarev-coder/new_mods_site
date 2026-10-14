import { useState, useEffect, type FormEvent } from 'react';
import { api, ApiError, errorMessage, type ModUpload, type User } from './api';

import { useSeo } from './seo';
import { games } from './games';
import { AccountDashboard } from './AccountDashboard';

const MAX_FILE = 256 * 1024 * 1024;
const statuses = { pending_review: 'На проверке', approved: 'Одобрен', rejected: 'Отклонён' };

export default function Account({ uploadPage = false }: { uploadPage?: boolean }) {
  useSeo((uploadPage ? 'Загрузка мода' : 'Личный кабинет')+' — modsKIK', 'Кабинет автора игровых модификаций.', uploadPage ? '/upload' : '/account', true);
  useEffect(() => {
    if (api.hasSession()) { api.me().then(setUser).then(() => api.mods()).then(setMods).catch(fail); }
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [mods, setMods] = useState<ModUpload[]>([]);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [game, setGame] = useState('');

  function fail(reason: unknown) {
    setError(errorMessage(reason));
    if (reason instanceof ApiError && reason.status === 401) { setUser(null); setMods([]); }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? '');
    const bytes = new TextEncoder().encode(value('password')).length;
    if (register && (bytes < 12 || bytes > 72)) {
      setError('Пароль должен занимать от 12 до 72 байт; кириллица занимает больше одного байта на символ.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      if (register) await api.register({
        username: value('username'), email: value('email'), password: value('password'),
        first_name: value('first_name'), last_name: value('last_name'),
      });
      else await api.login(value('login'), value('password'));
      setUser(await api.me());
      setMods([]);
      setMods(await api.mods());
      form.reset();
    } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE || !/\.(zip|7z|rar)$/i.test(file.name)) {
      setError('Выберите непустой ZIP, 7z или RAR размером до 256 МиБ.'); return;
    }
    setBusy(true); setError(''); setNotice('Загружаем и проверяем архив. Это может занять несколько минут.');
    try {
      await api.upload(data);
      form.reset();
      setGame('');
      setNotice('Мод загружен и отправлен на проверку.');
      // A list refresh failure must not erase confirmation of a saved upload.
      await api.mods().then(setMods).catch(fail);
    } catch (reason) { setNotice(''); fail(reason); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError(''); setNotice('');
    try { await api.logout(); setUser(null); setMods([]); }
    catch (reason) { fail(reason); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true); setError('');
    try { setMods(await api.mods()); } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <main className="account-main">
      {user && <div className="account-bar"><span>{user.username}</span><button disabled={busy} onClick={logout}>Выйти</button></div>}
      <section className="intro"><p className="eyebrow">СОЗДАВАЙ. ДЕЛИСЬ. ИГРАЙ.</p>
        <h1>{uploadPage ? 'Загрузка мода' : user ? 'Личный кабинет' : 'Вход в modsKIK'}</h1>
        <p>{uploadPage ? 'Выберите игру и категорию, добавьте описание, ссылки и скриншоты.' : 'Ваш профиль, опубликованные моды, заявки и история жалоб.'}</p>
      </section>
      {error && <div role="alert" className="message error">{error}</div>}
      {notice && <div role="status" className="message">{notice}</div>}
      {!user ? <section className="panel auth">
        <div className="tabs"><button disabled={busy} aria-pressed={!register} onClick={() => { setRegister(false); setError(''); }}>Вход</button>
          <button disabled={busy} aria-pressed={register} onClick={() => { setRegister(true); setError(''); }}>Регистрация</button></div>
        <h2>{register ? 'Создать аккаунт' : 'С возвращением'}</h2>
        <form key={String(register)} onSubmit={authenticate}>
          <fieldset disabled={busy}>
            {register ? <>
              <div className="row"><label>Имя<input name="first_name" autoComplete="given-name" maxLength={100} required /></label>
                <label>Фамилия<input name="last_name" autoComplete="family-name" maxLength={100} required /></label></div>
              <label>Логин<input name="username" autoComplete="username" pattern="[A-Za-z0-9_]{3,30}" title="3–30 латинских букв, цифр или _" required /></label>
              <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            </> : <label>Логин или email<input name="login" autoComplete="username" maxLength={254} required /></label>}
            <label>Пароль<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required /></label>
            {register && <small>От 12 до 72 байт. Email пока не подтверждается.</small>}
            <button type="submit">{busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}</button>
          </fieldset>
        </form>
        <p className="hint">Можно войти с существующим аккаунтом modsKIK. После обновления страницы потребуется повторный вход.</p>
      </section> : uploadPage ? <div className="upload-workspace">
        <section className="panel"><div className="section-title"><h2>Новая модификация</h2><a className="button secondary" href="/account">Личный кабинет</a></div><p className="hint">ZIP, 7z или RAR · до 256 МиБ</p>
          <form onSubmit={upload}><fieldset disabled={busy}>
            <label>Название<input name="title" maxLength={255} placeholder="Название модификации" required /></label>
            <div className="row"><label>Игра<select name="game" value={game} onChange={e=>setGame(e.target.value)} required><option value="">Выберите игру</option>{Object.keys(games).map(g=><option key={g}>{g}</option>)}</select></label>
            <label>Категория<select name="category" key={game} disabled={!game} required><option value="">Выберите категорию</option>{(games[game]??[]).map(c=><option key={c}>{c}</option>)}<option>Другое</option></select></label></div>
            <label>Ссылка на скачивание<input name="download_url" type="url" maxLength={2000} placeholder="https://…" required /></label>
            <details className="upload-socials"><summary>Соцсети автора (необязательно)</summary><div className="row">{['YouTube','VK','Telegram','Discord','Facebook','Boosty'].map(name=><label key={name}>{name}<input name={name} type="url" maxLength={2000} placeholder="https://…" /></label>)}</div></details>
            <label>Описание<textarea name="description" rows={5} maxLength={4000} placeholder="Что добавляет мод и как его установить" required /></label>
            <label>Скриншоты<input name="screenshots" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e=>{
              const files=Array.from(e.target.files??[]);if(files.length>6 || files.some(f=>f.size>5*1024*1024)){setError('Можно добавить до 6 скриншотов, каждый до 5 МиБ.');e.target.value='';}
            }} /></label><p className="hint">Первый скриншот станет обложкой. До 6 изображений PNG, JPEG или WebP, до 5 МиБ каждое, до 4096 × 4096.</p>
            <label className="file">Архив мода<input name="file" type="file" accept=".zip,.7z,.rar" required /></label>
            <p className="hint">Без пароля и вложенных архивов. Исполняемые файлы и ссылки не принимаются. После проверки заявка поступит на модерацию.</p>
            <label className="checkbox-label"><input type="checkbox" required />Я имею право распространять этот мод и согласен с правилами публикации.</label>
            <button type="submit">{busy ? 'Подождите…' : 'Отправить на проверку'}</button>
          </fieldset></form>
        </section>
        <aside className="panel"><div className="section-title"><h2>Мои заявки <span>{mods.length}</span></h2>
          <button className="secondary" disabled={busy} onClick={reload}>Обновить</button></div>
          {mods.length === 0 ? <div className="empty"><h3>Здесь появятся твои моды</h3><p>Отправь первый архив на проверку.</p></div> :
            <ul className="mods">{mods.map(mod => <li key={mod.id}>
              <div className="mod-title"><h3>{mod.title}</h3><span className={'badge ' + mod.status}>{statuses[mod.status] ?? mod.status}</span></div>
              <p>{mod.game} · {(mod.size_bytes / 1024 / 1024).toFixed(2)} МиБ</p>
              <p className="description">{mod.description}</p>
              {mod.review_note && <p>Результат проверки: {mod.review_note}</p>}
              {mod.published_mod_id && <a href={'/mods/'+mod.published_mod_id}>Открыть опубликованный мод →</a>}
              <time dateTime={mod.created_at}>{new Date(mod.created_at).toLocaleString('ru-RU')}</time>
            </li>)}</ul>}
        </aside>
      </div> : <AccountDashboard user={user} uploads={mods} busy={busy} reload={reload} onProfileSaved={setUser} />}
    </main>

  </div>;
}
