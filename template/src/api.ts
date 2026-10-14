export interface User { id: number; public_user_id: number; username: string; email: string }
export interface Profile extends User { first_name: string; last_name: string; avatar: string | null; mods_count: number; rating: number; reports_count: number }
export interface Comment { id: number; name: string; body: string; created_at: string }
export interface CommentPage { items: Comment[]; next: number | null }
export interface PublishedMod { id: number; title: string; game: string; category: string; description: string; download_url: string; status: string; rating: number; downloads: number; created_at: string }
export interface Report { id: number; mod_id: number; title: string; reason: string; description: string; status: string; resolution: string; created_at: string }
export interface Tokens { access_token: string; refresh_token: string; expires_in: number }
export interface ModUpload {
  id: string; title: string; game: string; description: string;
  status: 'pending_review' | 'approved' | 'rejected';
  size_bytes: number; created_at: string; sha256: string;
  category: string; review_note: string; published_mod_id: number | null;
}
export interface Registration {
  username: string; email: string; password: string; first_name: string; last_name: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

// Tokens exist only in this tab's memory. Reloading requires another login.
// A single refresh promise prevents rotating the same refresh token twice.
export class ApiClient {
  private tokens: Tokens | null = null;
  private expiresAt = 0;
  private refreshing: Promise<void> | null = null;
  private generation = 0;
  constructor(private readonly base = '/kikcustom/v1') {}

  private async send<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.base + path, { ...init, credentials: 'omit' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new ApiError(response.status, data.error ?? 'request_failed');
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
  private json(value: unknown): RequestInit {
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
  }
  private save(tokens: Tokens) {
    this.tokens = tokens;
    this.expiresAt = Date.now() + tokens.expires_in * 1000;
  }
  clear() { this.generation++; this.tokens = null; this.expiresAt = 0; this.refreshing = null; }

  async login(login: string, password: string) {
    this.clear();
    this.save(await this.send<Tokens>('/auth/login', this.json({ login, password })));
  }
  async register(input: Registration) {
    this.clear();
    this.save(await this.send<Tokens>('/auth/register', this.json(input)));
  }
  private async refresh() {
    if (!this.tokens) throw new ApiError(401, 'invalid_credentials_or_session');
    if (!this.refreshing) {
      const generation = this.generation;
      const body = this.json({ refresh_token: this.tokens.refresh_token });
      this.refreshing = this.send<Tokens>('/auth/refresh', body)
        .then(tokens => { if (generation === this.generation) this.save(tokens); })
        .catch(error => {
          if (generation === this.generation && error instanceof ApiError && error.status === 401) this.clear();
          throw error;
        })
        .finally(() => { if (generation === this.generation) this.refreshing = null; });
    }
    await this.refreshing;
  }
  private async authorized<T>(path: string, init: RequestInit = {}): Promise<T> {
    // Keep enough token lifetime for the server's 300 second upload timeout.
    if (this.tokens && this.expiresAt - Date.now() < 310_000) await this.refresh();
    if (!this.tokens) throw new ApiError(401, 'invalid_credentials_or_session');
    const headers = new Headers(init.headers);
    headers.set('Authorization', 'Bearer ' + this.tokens.access_token);
    try { return await this.send<T>(path, { ...init, headers }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) this.clear();
      throw error;
    }
  }
  hasSession() { return this.tokens !== null; }
  me() { return this.authorized<User>('/auth/me'); }
  profile() { return this.authorized<Profile>('/profile'); }
  saveProfile(input: Pick<Profile,'first_name'|'last_name'|'username'>) { return this.authorized<void>('/profile', this.json(input)); }
  publishedMods() { return this.authorized<PublishedMod[]>('/profile/mods'); }
  editMod(id:number, input:Pick<PublishedMod,'title'|'game'|'category'|'description'|'download_url'>) { return this.authorized<void>('/profile/mods/'+id,this.json(input)); }
  requestMail(input: {action:'email';email:string} | {action:'mod_delete';id:number} | {action:'account_delete';email:string;password:string;confirmText:string;deleteMods:boolean}) {
    return this.authorized<{status:string}>('/profile/mail',this.json(input));
  }
  reports() { return this.authorized<Report[]>('/profile/reports'); }
  comments(id: number, before?: number, signal?: AbortSignal) { return this.send<CommentPage>(`/catalog/${id}/comments${before ? '?before='+before : ''}`, { signal }); }
  comment(id: number, body: string) {
    const init = this.json({body});
    return this.hasSession() ? this.authorized<Comment>(`/catalog/${id}/comments`,init) : this.send<Comment>(`/catalog/${id}/comments`,init);
  }
  rate(id: number, value: number) { return this.authorized<{rating:number;rating_count:number;value:number}>(`/catalog/${id}/rating`,this.json({value})); }
  report(id: number, reason: string, description: string) { return this.authorized<{id:number}>(`/catalog/${id}/reports`,this.json({reason,description})); }
  mods() { return this.authorized<ModUpload[]>('/mods'); }
  upload(form: FormData) {
    // The browser must set multipart Content-Type, including the boundary.
    return this.authorized<{ id: string }>('/mods/upload', { method: 'POST', body: form });
  }
  async logout() {
    await this.authorized<void>('/auth/logout', { method: 'POST' });
    this.clear();
  }
}
export const api = new ApiClient();

const errors: Record<string, string> = {
  mail_not_configured: 'Отправка почты пока не настроена на сервере.',
  mail_not_sent: 'Письмо не отправлено. Попробуйте позже или обратитесь в поддержку.',
  mail_timeout: 'Почтовый сервер не ответил вовремя. Перед повторной отправкой проверьте почту.',
  mail_busy: 'Сервис почты занят. Попробуйте через несколько минут.',
  email_same: 'Укажите новый адрес почты.', email_taken: 'Эта почта уже используется.', email_invalid: 'Укажите корректный адрес почты.',
  account_credentials_invalid: 'Почта или текущий пароль не совпадают.',
  account_delete_confirmation_invalid: 'Введите «Удалить аккаунт» для подтверждения.',
  invalid_mail_request: 'Проверьте заполненные поля запроса.',

  invalid_community_fields: 'Заполните текст и проверьте его длину.',
  invalid_rating: 'Выберите оценку от 1 до 5.',
  invalid_image: 'Не удалось прочитать скриншот. Выберите PNG, JPEG или WebP до 4096 × 4096.',
  image_too_large: 'Скриншот слишком большой. Максимум — 5 МиБ.',
  invalid_upload_url: 'Укажите полную ссылку HTTP или HTTPS.',
  invalid_credentials_or_session: 'Неверный логин или пароль, либо сессия завершена. Войдите снова.',
  invalid_registration_fields: 'Проверьте данные. Логин: 3–30 латинских букв, цифр или _. Пароль: 12–72 байта.',
  account_or_upload_conflict: 'Этот логин или email уже используется.',
  rate_limit_exceeded: 'Слишком много запросов. Повторите позже.',
  archive_rejected: 'Архив не прошёл проверку: возможны повреждение, пароль, небезопасные файлы или превышение лимитов.',
  supported_archives_zip_7z_rar: 'Выберите ZIP, 7z или RAR.',
  upload_too_large: 'Размер архива превышает 256 МиБ.',
  storage_quota_exceeded: 'Достигнут лимит: 100 заявок или 5 ГиБ на аккаунт.',
  scan_timeout: 'Проверка архива заняла слишком много времени.',
  origin_not_allowed: 'Адрес сайта не разрешён в настройках API.',
};
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return errors[error.code] ?? 'Не удалось выполнить запрос. Повторите позже.';
  return 'Не удалось связаться с сервером. Проверьте соединение.';
}
