import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { http } from '@/lib/http'

// specs/06 §2: replace the instance's adapter with a scripted function, so the real interceptors run.
// A bare status gets a default body ({ user } for me/signin/signup, else {}); pass { status, data } to override it.
type Reply = number | 'network' | { status: number; data: unknown }
export type Script = (config: InternalAxiosRequestConfig & { _retry?: boolean }) => Reply | Promise<Reply>

export const USER = { id: '1', name: 'Ann', email: 'ann@example.com' }

export function fakeApi(script: Script) {
  const calls: string[] = []
  http.defaults.adapter = async (config) => {
    calls.push(config.url ?? '')
    const reply = await script(config)
    if (reply === 'network') throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)
    const { status, data } =
      typeof reply === 'number'
        ? { status: reply, data: ['/auth/me', '/auth/signin', '/auth/signup'].includes(config.url ?? '') ? { user: USER } : {} }
        : reply
    const response = { data, status, statusText: '', headers: {}, config }
    if (status < 300) return response
    throw new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, {}, response)
  }
  return calls
}
