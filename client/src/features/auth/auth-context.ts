import { createContext, useContext } from 'react'
import type { SafeUser, SignInBody, SignUpBody } from './api'

// specs/05 §5. In memory only.
export type AuthState =
  | { status: 'authenticated'; user: SafeUser }
  | { status: 'loading' | 'unauthenticated' | 'error'; user: null }

export type AuthContextValue = AuthState & {
  signIn: (body: SignInBody) => Promise<void>
  signUp: (body: SignUpBody) => Promise<void>
  logout: () => Promise<void>
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
