import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/auth-context'
import { toApiError } from '@/lib/http'

export function AppPage() {
  const auth = useAuth()
  const [pending, setPending] = useState(false)
  // ProtectedRoute renders this page only when authenticated; the check narrows the type.
  if (auth.status !== 'authenticated') return null

  // Auth state is cleared either way and the guard redirects to /signin (specs/01 §6). The HttpOnly
  // cookies can only be cleared by the server, so a failed request may leave the session alive.
  const onLogout = async () => {
    setPending(true)
    try {
      await auth.logout()
    } catch (e) {
      toApiError(e)
      // One message for every failure: on a network error or a proxy 502/503/504 no clearing Set-Cookie
      // reached the browser; only an API-generated 500 would carry it, and we don't branch on that.
      toast.error("We couldn't confirm sign-out with the server. You may still be signed in on this device. Please try again.")
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>Welcome to the application.</h1>
          </CardTitle>
          <CardDescription>Signed in as {auth.user.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" disabled={pending} onClick={onLogout}>
            {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Log out
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
