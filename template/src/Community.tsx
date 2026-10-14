import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage, type Comment } from './api';

export function Rating({ id, onRated }: { id: number; onRated: (rating:number,count:number)=>void }) {
  const [value,setValue] = useState(0);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  async function rate(value: number) {
    setBusy(true); setMessage('');
    try { const result = await api.rate(id,value); setValue(value); onRated(result.rating,result.rating_count); setMessage('Оценка сохранена. Вы можете её изменить.'); }
    catch (e) { setMessage(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <section className="rate-mod"><h2>Оценить мод</h2>{api.hasSession() ? <div className="stars" role="group" aria-label="Оценка от 1 до 5">{[1,2,3,4,5].map(n => <button key={n} aria-label={n+' из 5'} aria-pressed={value===n} disabled={busy} onClick={() => { void rate(n); }} className={n<=value ? 'rated' : ''}>★</button>)}</div> : <p><a href="/account">Войдите</a>, чтобы поставить оценку.</p>}{message && <p role="status">{message}</p>}</section>;
}
export function ReportButton({ id }: { id: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);
    setBusy(true); setError('');
    try { await api.report(id,String(data.get('reason')),String(data.get('description'))); form.reset(); dialog.current?.close(); setNotice('Жалоба отправлена. Результат появится в личном кабинете.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <div className="report-zone"><button className="secondary" onClick={() => { setError(''); dialog.current?.showModal(); }}>Пожаловаться на мод</button>{notice && <p role="status">{notice}</p>}
    <dialog ref={dialog} className="community-dialog" aria-labelledby="report-title"><h2 id="report-title">Жалоба на мод</h2>
      {api.hasSession() ? <form onSubmit={send}><fieldset disabled={busy}><label>Причина<select name="reason" required><option value="">Выберите причину</option>{['Нарушение авторских прав','Опасный файл','Неработающая ссылка','Неверное описание','Другое'].map(v=><option key={v}>{v}</option>)}</select></label><label>Описание<textarea name="description" rows={5} required maxLength={4000} placeholder="Опишите проблему и укажите необходимые подробности" /></label><button type="submit">{busy?'Отправляем…':'Отправить жалобу'}</button></fieldset></form> : <p>Жалобу может отправить только авторизованный пользователь. <a className="button" href="/account" onClick={() => dialog.current?.close()}>Войти</a></p>}
      {error && <p role="alert" className="message error">{error}</p>}<button type="button" className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Закрыть</button>
    </dialog>
  </div>;
}
export function Comments({ id }: { id: number }) {
  const [items,setItems] = useState<Comment[]>([]);
  const [next,setNext] = useState<number|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    const controller=new AbortController(); setLoading(true); setError('');
    api.comments(id,undefined,controller.signal).then(page=>{setItems(page.items);setNext(page.next);}).catch(e=>{if (!controller.signal.aborted) setError(errorMessage(e));}).finally(()=>{if (!controller.signal.aborted) setLoading(false);});
    return ()=>controller.abort();
  },[id,retry]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget; const body=String(new FormData(form).get('body')??'').trim();
    if (!body || busy) return;
    setBusy(true); setError(''); setNotice('');
    try { const comment=await api.comment(id,body);setItems(v=>[comment,...v.filter(c=>c.id!==comment.id)]);form.reset();setNotice('Комментарий добавлен.'); }
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function more() {
    if (!next || busy) return;setBusy(true);setError('');
    try {const page=await api.comments(id,next);setItems(v=>[...v,...page.items.filter(c=>!v.some(old=>old.id===c.id))]);setNext(page.next);}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  return <section className="comments"><h2>Комментарии</h2><p className="hint">{api.hasSession()?'Комментарий будет опубликован от вашего имени.':'Можно комментировать без регистрации. Сервер назначит имя guest-000000 с вашим шестизначным номером.'}</p>
    <form onSubmit={send}><fieldset disabled={busy}><label>Ваш комментарий<textarea name="body" rows={3} maxLength={2000} required /></label><button type="submit">{busy?'Подождите…':'Оставить комментарий'}</button></fieldset></form>
    {error && <p role="alert" className="message error">{error} <button onClick={()=>setRetry(v=>v+1)}>Повторить загрузку</button></p>}{notice && <p role="status">{notice}</p>}
    {loading?<p role="status">Загрузка комментариев…</p>:items.length===0?<p>Комментариев пока нет.</p>:<ol className="comment-list">{items.map(c=><li key={c.id}><div><strong>{c.name}</strong><time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString('ru-RU')}</time></div><p>{c.body}</p></li>)}</ol>}
    {next && <button disabled={busy} className="secondary" onClick={()=>{void more();}}>Ещё комментарии</button>}
  </section>;
}
