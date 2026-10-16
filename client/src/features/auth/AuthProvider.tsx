import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { http, toApiError } from '@/lib/http'
import { authApi, type SignInBody, type SignUpBody } from './api'
import { AuthContext, type AuthState } from './auth-context'
import { installRefreshInterceptor } from './interceptor'

const UNAUTHENTICATED: AuthState = { status: 'unauthenticated', user: null }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })
  // sessionEpoch (specs/05 §5): bumped on every auth change, so a /me that started earlier is ignored.
  const epoch = useRef(0)

  const loadMe = useCallback(() => {
    const started = ++epoch.current
    authApi.me().then(
      (user) => {
        if (started === epoch.current) setState({ status: 'authenticated', user })
      },
      (error: unknown) => {
        if (started !== epoch.current) return
        setState(toApiError(error).status === 401 ? UNAUTHENTICATED : { status: 'error', user: null })
      },
    )
  }, [])

  // Declared before the /me effect so the interceptor is in place when /me is sent.
  useEffect(
    () =>
      installRefreshInterceptor(http, () => {
        epoch.current++
        setState(UNAUTHENTICATED)
      }),
    [],
  )

  // Under StrictMode this runs twice; the second loadMe() bumps the epoch, so the first /me is ignored.
  useEffect(loadMe, [loadMe])

  const signIn = useCallback(async (body: SignInBody) => {
    const user = await authApi.signIn(body)
    epoch.current++
    setState({ status: 'authenticated', user })
  }, [])

  const signUp = useCallback(async (body: SignUpBody) => {
    const user = await authApi.signUp(body)
    epoch.current++
    setState({ status: 'authenticated', user })
  }, [])

  // Clears the state even if the request fails (specs/01 §6); the error still reaches the caller.
  const logout = useCallback(async () => {
    epoch.current++
    try {
      await authApi.logout()
    } finally {
      setState(UNAUTHENTICATED)
    }
  }, [])

  const retry = useCallback(() => {
    setState({ status: 'loading', user: null })
    loadMe()
  }, [loadMe])

  const value = useMemo(
    () => ({ ...state, signIn, signUp, logout, retry }),
    [state, signIn, signUp, logout, retry],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
