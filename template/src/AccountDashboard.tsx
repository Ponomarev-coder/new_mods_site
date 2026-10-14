import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, type User, type Profile, type PublishedMod, type Report, type ModUpload } from './api';
import { mediaUrl } from './catalog';

const status: Record<string,string> = { approved:'Опубликован',pending:'На проверке',pending_review:'На проверке',rejected:'Отклонён',open:'Открыта',resolved:'Решена',dismissed:'Отклонена' };
const tabs = [['mods','Мои моды'],['uploads','Заявки на публикацию'],['settings','Настройка модов'],['reports','История жалоб'],['profile','Настройки профиля'],['privacy','Конфиденциальность']];
export function AccountDashboard({user,uploads,busy,reload,onProfileSaved}: {user:User;uploads:ModUpload[];busy:boolean;reload:()=>Promise<void>;onProfileSaved:(user:User)=>void}) {
  const [profile,setProfile]=useState<Profile>();
  const [mods,setMods]=useState<PublishedMod[]>([]);
  const [reports,setReports]=useState<Report[]>([]);
  const [tab,setTab]=useState('mods');
  const [query,setQuery]=useState('');
  const [game,setGame]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [retry,setRetry]=useState(0);
  const [editing,setEditing]=useState<PublishedMod>();
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    Promise.all([api.profile(),api.publishedMods(),api.reports()]).then(([p,m,r])=>{if(active){setProfile(p);setMods(m);setReports(r);}}).catch(e=>{if(active)setError(errorMessage(e));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[user.id,retry]);
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);setSaving(true);setError('');setNotice('');
    try {await api.saveProfile({first_name:String(data.get('first_name')),last_name:String(data.get('last_name')),username:String(data.get('username'))});const p=await api.profile();setProfile(p);onProfileSaved(p);setNotice('Профиль сохранён.');}
    catch(e){setError(errorMessage(e));}finally{setSaving(false);}
  }
  async function requestMail(event:FormEvent<HTMLFormElement>,action:'email'|'mod_delete'|'account_delete') {
    event.preventDefault();if(saving)return;
    const form=event.currentTarget;const data=new FormData(form);setSaving(true);setError('');setNotice('');
    try {
      await api.requestMail(action==='email' ? {action,email:String(data.get('email'))} : action==='mod_delete' ? {action,id:Number(data.get('id'))} : {action,email:String(data.get('email')),password:String(data.get('password')),confirmText:String(data.get('confirmText')),deleteMods:data.get('deleteMods')==='on'});
      form.reset();setNotice(action==='email'?'Письмо отправлено на новый адрес. Подтвердите смену почты по ссылке из письма.':'Письмо отправлено на вашу почту. Удаление произойдёт только после подтверждения по ссылке.');
    } catch(e){setError(errorMessage(e));}finally{const password=form.querySelector<HTMLInputElement>('input[type=password]');if(password)password.value='';setSaving(false);}
  }
  const filtered=mods.filter(m=>m.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && m.game.toLocaleLowerCase().includes(game.toLocaleLowerCase()));
  async function editMod(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!editing)return;
    const data=new FormData(event.currentTarget);const value=(key:string)=>String(data.get(key)??'');setSaving(true);setError('');setNotice('');
    try {await api.editMod(editing.id,{title:value('title'),game:value('game'),category:value('category'),description:value('description'),download_url:value('download_url')});setMods(await api.publishedMods());setEditing(undefined);setNotice('Изменения сохранены. Мод отправлен на повторную проверку.');}
    catch(e){setError(errorMessage(e));}finally{setSaving(false);}
  }
  return <div className="account-layout"><section className="panel account-content"><div className="section-title"><h2>{tabs.find(([id])=>id===tab)?.[1]}</h2><button disabled={busy||saving||loading} onClick={()=>{setRetry(v=>v+1);void reload();}}>Обновить</button></div>
    {error && <p role="alert" className="message error">{error}</p>}{notice && <p role="status" className="message">{notice}</p>}
    {loading ? <p role="status">Загрузка кабинета…</p> : <>
      {tab==='mods' && <><div className="row account-search"><label>Поиск по названию<input value={query} onChange={e=>setQuery(e.target.value)} type="search" /></label><label>Поиск по игре<input value={game} onChange={e=>setGame(e.target.value)} type="search" /></label></div><p>Найдено: {filtered.length}</p><ul className="mods">{filtered.map(m=><li key={m.id}><div className="mod-title"><h3>{m.status==='approved'?<a href={'/mods/'+m.id}>{m.title}</a>:m.title}</h3><span className={'badge '+m.status}>{status[m.status]??m.status}</span></div><p>{m.game} · {m.category}</p><p>↓ {m.downloads} · ★ {m.rating.toFixed(1)}</p></li>)}</ul>{!filtered.length && <p>Моды пока не опубликованы. <a href="/upload">Добавить мод →</a></p>}</>}
      {tab==='uploads' && <ul className="mods">{uploads.length===0?<li>Заявок пока нет. <a href="/upload">Загрузить мод</a></li>:uploads.map(m=><li key={m.id}><div className="mod-title"><h3>{m.title}</h3><span className={'badge '+m.status}>{status[m.status]}</span></div><p>{m.game} · {m.category} · {(m.size_bytes/1048576).toFixed(2)} МиБ</p><p>{m.review_note || 'Ожидает проверки модератором.'}</p>{m.published_mod_id && <a href={'/mods/'+m.published_mod_id}>Страница мода →</a>}<time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('ru-RU')}</time></li>)}</ul>}
      {tab==='settings' && <><p>После изменения мод возвращается на проверку модератором.</p><ul className="mods">{mods.map(m=><li key={m.id}><div className="section-title"><h3>{m.title}</h3><button disabled={saving} onClick={()=>setEditing(m)}>Редактировать</button></div><details><summary>Удалить мод</summary><p>Удаление мода и его комментариев нужно подтвердить по почте. Ссылка действует 1 час.</p><form onSubmit={event=>void requestMail(event,'mod_delete')}><input type="hidden" name="id" value={m.id} /><button disabled={saving} type="submit">Отправить письмо для удаления</button></form></details></li>)}</ul>{!mods.length && <p>Модов пока нет.</p>}{editing && <form key={editing.id} onSubmit={editMod}><fieldset disabled={saving}><label>Название<input name="title" defaultValue={editing.title} required maxLength={255} /></label><div className="row"><label>Игра<input name="game" defaultValue={editing.game} required maxLength={100} /></label><label>Категория<input name="category" defaultValue={editing.category} required maxLength={255} /></label></div><label>Описание<textarea name="description" defaultValue={editing.description} required maxLength={4000} rows={5} /></label><label>Ссылка на скачивание<input name="download_url" type="url" defaultValue={editing.download_url} required maxLength={2000} /></label><button type="submit">Сохранить и отправить на проверку</button><button className="secondary" type="button" onClick={()=>setEditing(undefined)}>Отмена</button></fieldset></form>}</>}
      {tab==='reports' && <ul className="mods">{reports.length===0?<li>Вы ещё не отправляли жалобы.</li>:reports.map(r=><li key={r.id}><div className="mod-title"><h3>{r.title}</h3><span className="badge">{status[r.status]??r.status}</span></div><p><strong>{r.reason}</strong></p><p className="description">{r.description}</p>{r.resolution && <p>Ответ модератора: {r.resolution}</p>}<time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString('ru-RU')}</time></li>)}</ul>}
      {tab==='profile' && profile && <><form onSubmit={save}><fieldset disabled={saving}><label>Логин<input name="username" defaultValue={profile.username} pattern="[A-Za-z0-9_]{3,30}" required /></label><div className="row"><label>Имя<input name="first_name" defaultValue={profile.first_name} maxLength={100} required /></label><label>Фамилия<input name="last_name" defaultValue={profile.last_name} maxLength={100} required /></label></div><p>Email: {profile.email}</p><p>ID пользователя: {profile.public_user_id}</p><button type="submit">{saving?'Сохраняем…':'Сохранить профиль'}</button></fieldset></form><form className="mail-form" onSubmit={event=>void requestMail(event,'email')}><fieldset disabled={saving}><h3>Смена почты</h3><p>Подтверждение придёт на новый адрес. Ссылка действует 24 часа.</p><label>Новая почта<input name="email" type="email" required maxLength={254} autoComplete="email" /></label><button type="submit">Отправить подтверждение</button></fieldset></form></>}
      {tab==='privacy' && <><p>Ваш email, имя и фамилия отображаются только в вашем кабинете. В комментариях публикуется логин.</p><p>Токены входа хранятся в памяти вкладки. Кнопка «Выйти» отзывает текущую сессию. После перезагрузки страницы потребуется повторный вход.</p><a href="/privacy">Политика обработки данных →</a><details className="mail-form"><summary>Удаление аккаунта</summary><form onSubmit={event=>void requestMail(event,'account_delete')}><fieldset disabled={saving}><p>Аккаунт и личные данные будут удалены после подтверждения по почте. Ссылка действует 1 час.</p><label>Текущая почта<input name="email" type="email" required maxLength={254} autoComplete="email" /></label><label>Текущий пароль<input name="password" type="password" required maxLength={1024} autoComplete="current-password" /></label><label>Введите «Удалить аккаунт»<input name="confirmText" required pattern="Удалить аккаунт" /></label><label><input type="checkbox" name="deleteMods" /> Удалить также мои моды (иначе они останутся с автором «Удалённый пользователь»)</label><button type="submit">Отправить письмо для удаления аккаунта</button></fieldset></form></details></>}
    </>}
  </section><aside className="panel profile-sidebar"><img className="profile-avatar" src={mediaUrl(profile?.avatar)||'/logo_KIKcustom.png'} alt="Аватар пользователя" /><h2>{profile?.username??user.username}</h2><p>{profile?.first_name} {profile?.last_name}</p><div className="profile-stats"><span>Рейтинг<strong>{Number(profile?.rating??0).toFixed(2)}</strong></span><span>Модов<strong>{profile?.mods_count??0}</strong></span><span>Жалоб<strong>{profile?.reports_count??0}</strong></span></div><nav aria-label="Разделы личного кабинета">{tabs.map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>{setTab(id);setNotice('');}}>{label}</button>)}<a className="button" href="/upload">Добавить мод</a></nav></aside></div>;
}
