import { afterEach, expect, test, vi } from 'vitest';
import { ApiClient, ApiError } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const tokens = { access_token: 'access', refresh_token: 'refresh', expires_in: 900 };

test('serializes concurrent refresh and sends the rotated access token', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn()
    .mockResolvedValueOnce(json(tokens))
    .mockResolvedValueOnce(json({ ...tokens, access_token: 'rotated', refresh_token: 'next' }))
    .mockResolvedValueOnce(json({ id: 1 }))
    .mockResolvedValueOnce(json([]));
  vi.stubGlobal('fetch', fetcher);
  const client = new ApiClient();
  await client.login('name', 'password');
  vi.setSystemTime(Date.now() + 700_000);
  await Promise.all([client.me(), client.mods()]);
  expect(fetcher.mock.calls.filter(([path]) => path.endsWith('/auth/refresh'))).toHaveLength(1);
  for (const [, init] of fetcher.mock.calls.slice(2)) {
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer rotated');
    expect(init.credentials).toBe('omit');
  }
});

test('leaves multipart boundary to the browser and revokes session on logout', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(tokens))
    .mockResolvedValueOnce(json({ id: 'upload' }, 201))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  const client = new ApiClient();
  await client.login('name', 'password');
  const form = new FormData();
  form.set('file', new Blob(['archive']), 'mod.rar');
  await client.upload(form);
  expect(fetcher.mock.calls[1][1].body).toBe(form);
  expect(new Headers(fetcher.mock.calls[1][1].headers).has('Content-Type')).toBe(false);
  await client.logout();
  await expect(client.me()).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('keeps the session available for logout retry after a network error', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(tokens))
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  const client = new ApiClient();
  await client.login('name', 'password');
  await expect(client.logout()).rejects.toThrow('network');
  await client.logout();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('expired or revoked sessions are cleared and API errors remain readable', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(tokens))
    .mockResolvedValueOnce(json({ error: 'invalid_credentials_or_session' }, 401));
  vi.stubGlobal('fetch', fetcher);
  const client = new ApiClient();
  await client.login('name', 'password');
  await expect(client.me()).rejects.toBeInstanceOf(ApiError);
  await expect(client.mods()).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
