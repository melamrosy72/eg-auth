import { http } from '@/lib/http'

// specs/03 §1
export type SafeUser = { id: string; name: string; email: string }
type UserResponse = { user: SafeUser }

export type SignInBody = { email: string; password: string }
export type SignUpBody = SignInBody & { name: string }

export const authApi = {
  me: () => http.get<UserResponse>('/auth/me').then((r) => r.data.user),
  signIn: (body: SignInBody) => http.post<UserResponse>('/auth/signin', body).then((r) => r.data.user),
  signUp: (body: SignUpBody) => http.post<UserResponse>('/auth/signup', body).then((r) => r.data.user),
  logout: () => http.post('/auth/logout'),
}
