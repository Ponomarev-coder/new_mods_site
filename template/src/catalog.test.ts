import { describe, expect, it } from 'vitest';
import { catalogUrl, externalUrl, mediaUrl, modId, readFilters } from './catalog';
describe('catalogue navigation', () => {
  it('preserves unicode filters across category changes and history URLs', () => {
    const filters = { game: 'X-Plane 11 / 12', category: 'Самолеты', search: 'A&B + 100%', page: 3 };
    expect(readFilters(catalogUrl(filters).slice(1))).toEqual(filters);
  });
  it('supports numeric and legacy readable IDs without accepting arbitrary paths', () => {
    expect(modId('/mods/123','')).toBe(123);
    expect(modId('/mod.html','?id=123-Airbus-A320')).toBe(123);
    for (const value of ['0','-1','123/../../account','1e3','999999999999999999999']) expect(modId('/mods/'+value,'')).toBeNull();
  });
  it('allows only public same-origin media', () => {
    expect(mediaUrl('uploads/screenshots/test.png')).toBe('/uploads/screenshots/test.png');
    expect(mediaUrl('https://modskik.ru/uploads/screenshots/test.png')).toBe('/uploads/screenshots/test.png');
    for (const path of ['javascript:alert(1)','//tracker.test/image','/uploads/../api/auth','https://user:pass@modskik.ru/logo/x.png']) expect(mediaUrl(path)).toBeUndefined();
  });
  it('rejects script and local URLs for author links', () => {
    expect(externalUrl('https://example.com/author')).toBe('https://example.com/author');
    expect(externalUrl('javascript:alert(1)')).toBeUndefined();
    expect(externalUrl('file:///C:/secrets')).toBeUndefined();
  });
});
