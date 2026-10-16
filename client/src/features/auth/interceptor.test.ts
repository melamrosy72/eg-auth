import { AxiosError } from 'axios'
import { afterEach, expect, test, vi } from 'vitest'
import { http } from '@/lib/http'
import { fakeApi } from '@/test/fake-adapter'
import { installRefreshInterceptor } from './interceptor'

// specs/06 §2 item 9
let eject: (() => void) | undefined
afterEach(() => eject?.())

function install() {
  const expired = vi.fn()
  eject = installRefreshInterceptor(http, expired)
  return expired
}

test('401 → refresh → retry once → success', async () => {
  const expired = install()
  let first = true
  const calls = fakeApi((c) => (c.url === '/x' && first ? ((first = false), 401) : 200))
  await expect(http.get('/x')).resolves.toMatchObject({ status: 200 })
  expect(calls).toEqual(['/x', '/auth/refresh', '/x'])
  expect(expired).not.toHaveBeenCalled()
})

test('three concurrent 401s → one refresh, three retries', async () => {
  install()
  const calls = fakeApi((c) => {
    if (c.url === '/auth/refresh') return new Promise((r) => setTimeout(() => r(200), 10))
    return c._retry ? 200 : 401
  })
  await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')])
  expect(calls.filter((u) => u === '/auth/refresh')).toHaveLength(1)
  expect(calls.toSorted()).toEqual(['/a', '/a', '/auth/refresh', '/b', '/b', '/c', '/c'])
})

test('refresh 401 → session expired, no loop', async () => {
  const expired = install()
  const calls = fakeApi(() => 401)
  await expect(http.get('/x')).rejects.toMatchObject({ response: { status: 401 } })
  expect(calls).toEqual(['/x', '/auth/refresh'])
  expect(expired).toHaveBeenCalled()
})

test.each([503, 429, 'network' as const])('refresh %s → auth not cleared', async (status) => {
  const expired = install()
  fakeApi((c) => (c.url === '/auth/refresh' ? status : 401))
  await expect(http.get('/x')).rejects.toBeInstanceOf(AxiosError)
  expect(expired).not.toHaveBeenCalled()
})

test('retried request 401 again → no second refresh', async () => {
  install()
  const calls = fakeApi((c) => (c.url === '/auth/refresh' ? 200 : 401))
  await expect(http.get('/x')).rejects.toMatchObject({ response: { status: 401 } })
  expect(calls).toEqual(['/x', '/auth/refresh', '/x'])
})

test.each(['/auth/signin', '/auth/signup', '/auth/logout', '/auth/refresh'])('%s 401 → no refresh', async (url) => {
  install()
  const calls = fakeApi(() => 401)
  await expect(http.post(url)).rejects.toMatchObject({ response: { status: 401 } })
  expect(calls).toEqual([url])
})
