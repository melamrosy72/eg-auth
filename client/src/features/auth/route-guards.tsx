import { Loader2Icon } from 'lucide-react'
import { type Location, Navigate, Outlet, useLocation } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from './auth-context'

// specs/05 §5: nothing behind a guard renders until /me has resolved. Fails closed: a /me error shows a retry panel.
export function ProtectedRoute() {
  const { status, retry } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenSpinner />
  if (status === 'error') return <RetryPanel onRetry={retry} />
  if (status === 'unauthenticated') return <Navigate to="/signin" replace state={{ from: location }} />
  return <Outlet />
}

// Fails open: on a /me error (5xx/429/network) the form still renders, since a public page reveals nothing.
export function PublicOnlyRoute() {
  const { status } = useAuth()
  // `from` only ever comes from router history state (set by ProtectedRoute), never from the URL.
  const from = (useLocation().state as { from?: Location } | null)?.from
  if (status === 'loading') return <FullScreenSpinner />
  // Signing in or up flips the status, so this redirect is also the post-submit navigation (specs/01 §3).
  if (status === 'authenticated') return <Navigate to={from ?? '/app'} replace />
  return <Outlet />
}

export function FullScreenSpinner() {
  return (
    <div role="status" className="flex min-h-svh items-center justify-center">
      <Loader2Icon aria-hidden="true" className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

function RetryPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>We couldn't check your session</AlertTitle>
          <AlertDescription>Something went wrong, please try again</AlertDescription>
        </Alert>
        <Button onClick={onRetry}>Try again</Button>
      </div>
    </main>
  )
}
