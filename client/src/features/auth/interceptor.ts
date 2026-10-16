import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

// specs/05 §5: a 401 from these never triggers a refresh (paths relative to the /api/v1 base URL).
const NO_REFRESH = ['/auth/signin', '/auth/signup', '/auth/refresh', '/auth/logout']

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean }

// Module-level, not per install: Axios fixes a request's interceptor chain when the request starts, so
// under StrictMode the first mount's /me still runs through the ejected handler. Both must share one refresh.
let refreshing: Promise<unknown> | null = null

export function installRefreshInterceptor(instance: AxiosInstance, onSessionExpired: () => void) {
  const id = instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error
    const config = error.config as RetryConfig | undefined
    if (error.response?.status !== 401 || !config || config._retry || NO_REFRESH.includes(config.url ?? '')) {
      throw error
    }

    refreshing ??= instance.post('/auth/refresh').finally(() => {
      refreshing = null
    })
    try {
      await refreshing
    } catch (refreshError) {
      // Only a refresh 401 ends the session; 429, 5xx and network errors leave auth state alone.
      if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) onSessionExpired()
      throw refreshError
    }

    config._retry = true
    return instance(config)
  })
  return () => instance.interceptors.response.eject(id)
}
