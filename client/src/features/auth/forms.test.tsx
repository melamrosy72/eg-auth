import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { toast } from 'sonner'
import { afterEach, expect, test } from 'vitest'
import { AppRoutes } from '@/app/router'
import { Toaster } from '@/components/ui/sonner'
import { fakeApi, type Script, USER } from '@/test/fake-adapter'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'

// specs/06 §2 items 1–6, 10, 11 and the server error mapping of specs/05 §3.
type User = ReturnType<typeof userEvent.setup>

afterEach(() => {
  // Item 11: no flow may leave anything in web storage.
  expect(localStorage.length + sessionStorage.length).toBe(0)
  // sonner keeps toasts in module state and replays active ones into the next test's <Toaster>.
  toast.dismiss()
})

// JSON drops the functions, so this shows exactly the data the context holds.
function AuthStateDump() {
  return <pre aria-label="auth state">{JSON.stringify(useAuth())}</pre>
}

function renderApp(path: string, script: Script) {
  const calls = fakeApi(script)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <AuthStateDump />
      </AuthProvider>
      <Toaster theme="light" />
    </MemoryRouter>,
  )
  return { calls, user: userEvent.setup() }
}

// /me 401 and refresh 401, so the public pages show their forms; `rest` answers everything else.
const signedOut =
  (rest: Script = () => 200): Script =>
  (c) =>
    c.url === '/auth/me' || c.url === '/auth/refresh' ? 401 : rest(c)

async function fillSignIn(user: User) {
  await user.type(await screen.findByLabelText('Email'), USER.email)
  await user.type(screen.getByLabelText('Password'), 'short')
}

async function fillSignUp(user: User) {
  await user.type(await screen.findByLabelText('Name'), USER.name)
  await user.type(screen.getByLabelText('Email'), USER.email)
  await user.type(screen.getByLabelText('Password'), 'abc12345!')
}

const FORMS = [
  { path: '/signin', url: '/auth/signin', button: 'Sign in', fill: fillSignIn },
  { path: '/signup', url: '/auth/signup', button: 'Create account', fill: fillSignUp },
]

const welcome = () => screen.findByRole('heading', { name: 'Welcome to the application.' })

// Item 1
test('signup: an empty submit shows each field’s first message, focuses Name, sends nothing', async () => {
  const { calls, user } = renderApp('/signup', signedOut())
  await user.click(await screen.findByRole('button', { name: 'Create account' }))
  expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name must be at least 3 characters')
  expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Please enter a valid email address')
  expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
    expect.stringContaining('Password must be at least 8 characters'),
  )
  expect(screen.getByLabelText('Name')).toHaveFocus()
  expect(calls).not.toContain('/auth/signup')
})

test.each([
  { label: 'Name', value: '  ab  ', message: 'Name must be at least 3 characters' },
  { label: 'Name', value: 'a'.repeat(51), message: 'Name must be at most 50 characters' },
  { label: 'Email', value: 'not-an-email', message: 'Please enter a valid email address' },
  { label: 'Password', value: 'abc', message: 'Password must be at least 8 characters' },
  { label: 'Password', value: 'a1!' + 'a'.repeat(126), message: 'Password must be at most 128 characters' },
  { label: 'Password', value: '12345678!', message: 'Password must contain at least one letter' },
  { label: 'Password', value: 'abcdefg!', message: 'Password must contain at least one number' },
  { label: 'Password', value: 'abcdefg1', message: 'Password must contain at least one special character' },
])('signup: $label → "$message"', async ({ label, value, message }) => {
  const { user } = renderApp('/signup', signedOut())
  await user.click(await screen.findByLabelText(label))
  await user.paste(value)
  await user.tab()
  const input = screen.getByLabelText(label)
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription(expect.stringContaining(message))
})

test('signup: the checklist rows update as the user types مرحبا123!', async () => {
  const { user } = renderApp('/signup', signedOut())
  const input = await screen.findByLabelText('Password')
  // Rows in order: length, letter, number, special.
  const rows = () =>
    within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent?.startsWith('Met:'))
  expect(rows()).toEqual([false, false, false, false])
  await user.type(input, 'مرحبا')
  expect(rows()).toEqual([false, true, false, false])
  await user.type(input, '123')
  expect(rows()).toEqual([true, true, true, false])
  await user.type(input, '!')
  expect(rows()).toEqual([true, true, true, true])
  await user.tab()
  expect(input).toHaveAttribute('aria-invalid', 'false')
})

// Item 2
test('signin: checks email format and a non-empty password only; a short password is sent', async () => {
  const { calls, user } = renderApp('/signin', signedOut())
  const email = await screen.findByLabelText('Email')
  const password = screen.getByLabelText('Password')
  await user.type(email, 'nope')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(email).toHaveAccessibleDescription('Please enter a valid email address')
  expect(password).toHaveAccessibleDescription('Password is required')
  expect(calls).not.toContain('/auth/signin')

  await user.clear(email)
  await user.type(email, USER.email)
  await user.type(password, 'short')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await welcome()).toBeInTheDocument()
  expect(calls.filter((u) => u === '/auth/signin')).toHaveLength(1)
})

// Item 3
test.each(FORMS)('$path: while pending the button is disabled and a double click sends one request', async (form) => {
  let release: (status: number) => void = () => {}
  const { calls, user } = renderApp(
    form.path,
    signedOut((c) => (c.url === form.url ? new Promise((r) => (release = r)) : 200)),
  )
  await form.fill(user)
  await user.dblClick(screen.getByRole('button', { name: form.button }))
  expect(screen.getByRole('button', { name: form.button })).toBeDisabled()
  release(200)
  expect(await welcome()).toBeInTheDocument()
  expect(calls.filter((u) => u === form.url)).toHaveLength(1)
})

// Item 4
test.each(FORMS)('$path: success lands on /app with the welcome text', async (form) => {
  const { user } = renderApp(form.path, signedOut())
  await form.fill(user)
  await user.click(screen.getByRole('button', { name: form.button }))
  expect(await welcome()).toBeInTheDocument()
  expect(screen.getByText('Signed in as Ann')).toBeInTheDocument()
})

// Item 5
test('signin 401 → generic alert, email kept, password cleared, no refresh call', async () => {
  const { calls, user } = renderApp('/signin', signedOut((c) => (c.url === '/auth/signin' ? 401 : 200)))
  await fillSignIn(user)
  const before = calls.length
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  expect(screen.getByLabelText('Email')).toHaveValue(USER.email)
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(calls.slice(before)).toEqual(['/auth/signin'])
})

// Item 6
test('signup 409 → the error appears under the email field; values are kept', async () => {
  const { user } = renderApp('/signup', signedOut((c) => (c.url === '/auth/signup' ? 409 : 200)))
  await fillSignUp(user)
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  const email = screen.getByLabelText('Email')
  await waitFor(() => expect(email).toHaveAccessibleDescription('Email is already registered'))
  expect(email).toHaveAttribute('aria-invalid', 'true')
  expect(email).toHaveFocus()
  expect(screen.getByLabelText('Name')).toHaveValue(USER.name)
  expect(screen.getByLabelText('Password')).toHaveValue('abc12345!')
})

// Server error mapping (specs/05 §3), both forms.
test.each(FORMS)('$path 400 → a form alert lists every message; values are kept', async (form) => {
  const message = ['Please enter a valid email address', 'Password is required']
  const { user } = renderApp(
    form.path,
    signedOut((c) => (c.url === form.url ? { status: 400, data: { message } } : 200)),
  )
  await form.fill(user)
  await user.click(screen.getByRole('button', { name: form.button }))
  const alert = await screen.findByRole('alert')
  expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual(message)
  expect(screen.getByLabelText('Email')).toHaveValue(USER.email)
})

test.each(FORMS)('$path 429 → form alert "Too many attempts, please wait a minute"', async (form) => {
  const { user } = renderApp(form.path, signedOut((c) => (c.url === form.url ? 429 : 200)))
  await form.fill(user)
  await user.click(screen.getByRole('button', { name: form.button }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts, please wait a minute')
})

const GENERIC = 'Something went wrong, please try again'
const TOASTS = [
  { reply: 403, message: 'Request blocked, please reload the page' },
  { reply: 500, message: GENERIC },
  { reply: 503, message: GENERIC },
  { reply: 'network' as const, message: GENERIC },
]
test.each(FORMS.flatMap((form) => TOASTS.map((t) => ({ ...form, ...t }))))(
  '$path $reply → toast "$message", no alert',
  async ({ path, url, button, fill, reply, message }) => {
    const { user } = renderApp(path, signedOut((c) => (c.url === url ? reply : 200)))
    await fill(user)
    await user.click(screen.getByRole('button', { name: button }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Email')).toHaveValue(USER.email)
  },
)

// Item 10
test.each([500, 503, 'network' as const])('logout failing with %s still clears auth, lands on /signin, shows the toast', async (reply) => {
  const { calls, user } = renderApp('/app', (c) => (c.url === '/auth/logout' ? reply : 200))
  await user.click(await screen.findByRole('button', { name: 'Log out' }))
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(
    await screen.findByText(
      "We couldn't confirm sign-out with the server. You may still be signed in on this device. Please try again.",
    ),
  ).toBeInTheDocument()
  expect(JSON.parse(screen.getByLabelText('auth state').textContent ?? '')).toEqual({ status: 'unauthenticated', user: null })
  expect(calls).toContain('/auth/logout')
})

// Item 11 (storage is checked after every test above)
test('context holds only status and the safe user, even if a response carried a token', async () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'
  const { user } = renderApp(
    '/signin',
    signedOut((c) => (c.url === '/auth/signin' ? { status: 200, data: { user: USER, accessToken: token } } : 200)),
  )
  await fillSignIn(user)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await welcome()).toBeInTheDocument()
  expect(JSON.parse(screen.getByLabelText('auth state').textContent ?? '')).toEqual({ status: 'authenticated', user: USER })
})
