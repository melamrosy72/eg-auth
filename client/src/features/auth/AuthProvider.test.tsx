import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { expect, test } from 'vitest'
import { AppRoutes } from '@/app/router'
import { fakeApi } from '@/test/fake-adapter'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'

// specs/06 §2 items 7, 8, 10, 11 plus the StrictMode and sessionEpoch rules of specs/05 §5.
function Where() {
  return <p data-testid="path">{useLocation().pathname}</p>
}

function renderApp(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  )
}

// Shows the auth status and exposes logout, recording whether it rejected.
function Probe({ rejections }: { rejections: unknown[] }) {
  const auth = useAuth()
  return (
    <>
      <p data-testid="status">{auth.status}</p>
      <button onClick={() => auth.logout().catch((e: unknown) => rejections.push(e))}>logout</button>
    </>
  )
}

test('StrictMode: expired access token → exactly one refresh, no flash, then /app renders', async () => {
  let refreshed = false
  const calls = fakeApi((c) => {
    if (c.url === '/auth/refresh') return new Promise((r) => setTimeout(() => ((refreshed = true), r(200)), 10))
    return refreshed ? 200 : 401
  })
  renderApp('/app')
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  expect(screen.queryByRole('heading')).toBeNull()
  expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeInTheDocument()
  expect(screen.getByText('Signed in as Ann')).toBeInTheDocument()
  expect(calls.filter((u) => u === '/auth/refresh')).toHaveLength(1)
})

test('direct /app with /me 401 and refresh 401 → redirect to /signin', async () => {
  fakeApi(() => 401)
  renderApp('/app')
  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/signin'))
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
})

test.each([500, 'network' as const])('/app with /me %s → retry panel (fails closed); Try again calls /me again', async (reply) => {
  let fail = true
  const calls = fakeApi(() => (fail ? reply : 200))
  renderApp('/app')
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(screen.getByTestId('path')).toHaveTextContent('/app')
  expect(screen.queryByRole('heading', { name: 'Welcome to the application.' })).toBeNull()
  fail = false
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeInTheDocument()
  expect(calls.filter((u) => u === '/auth/me').length).toBeGreaterThanOrEqual(3)
})

test.each(['/signin', '/signup'])('%s with /me 500 → the form renders (fails open)', async (path) => {
  fakeApi(() => 500)
  renderApp(path)
  expect(await screen.findByLabelText('Email')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})

test('signed-in user visiting /signin is redirected to /app', async () => {
  fakeApi(() => 200)
  renderApp('/signin')
  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/app'))
})

test('sessionEpoch: a /me that resolves after logout cannot restore auth', async () => {
  let releaseMe: (status: number) => void = () => {}
  fakeApi((c) => (c.url === '/auth/me' ? new Promise((r) => (releaseMe = r)) : 200))
  render(
    <AuthProvider>
      <Probe rejections={[]} />
    </AuthProvider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'logout' }))
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  releaseMe(200)
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
})

test('logout failure still clears auth, rejects, and leaves no storage', async () => {
  fakeApi((c) => (c.url === '/auth/logout' ? 'network' : 200))
  const rejections: unknown[] = []
  render(
    <AuthProvider>
      <Probe rejections={rejections} />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
  await userEvent.click(screen.getByRole('button', { name: 'logout' }))
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  expect(rejections).toHaveLength(1)
  expect(localStorage.length + sessionStorage.length).toBe(0)
})
