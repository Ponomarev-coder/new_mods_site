export interface CatalogMod {
  id: number; title: string; author: string; game: string; category: string;
  description: string; preview: string | null; screenshots: string[];
  downloads: number; rating: number; size_mb: number; created_at: string;
  rating_count?: number;
  socials: Record<string, string>;
}
export interface CatalogPage { items: CatalogMod[]; total: number; page: number; pages: number }
export interface CatalogFilters { game: string; category: string; search: string; page: number }
export function readFilters(search: string): CatalogFilters {
  const params = new URLSearchParams(search);
  return { game: params.get('game') ?? '', category: params.get('category') ?? '',
    search: params.get('search') ?? '', page: Math.max(1, Math.min(100000, Math.floor(Number(params.get('page'))) || 1)) };
}
export function catalogUrl(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  for (const key of ['game', 'category', 'search'] as const) if (filters[key]) params.set(key, filters[key]);
  if (filters.page > 1) params.set('page', String(filters.page));
  return '/' + (params.size ? '?' + params : '');
}
export function modId(path: string, search: string): number | null {
  const value = path.startsWith('/mods/') ? path.slice(6) : new URLSearchParams(search).get('id');
  const match = value?.match(/^(\d+)(?:-[^/]*)?$/);
  const id = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
// Only same-origin public media paths are served through the new site.
export function mediaUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.replaceAll('\\', '/'), 'https://modskik.ru/');
    if (url.origin !== 'https://modskik.ru' || url.username || url.password) return undefined;
    if (!/^\/(?:uploads|logo|media)\//.test(url.pathname) && !/^\/kikcustom\/v1\/media\/[0-9a-f-]{36}\/[0-5]$/.test(url.pathname)) return undefined;
    return url.pathname;
  } catch { return undefined; }
}
export function externalUrl(value: string): string | undefined {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
