import { Link } from 'react-router'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInForm } from '@/features/auth/SignInForm'

export function SignInPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>Sign in</h1>
          </CardTitle>
          <CardDescription>Enter your email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
        <CardFooter className="justify-center gap-1 text-muted-foreground">
          No account yet?
          <Link to="/signup" className="text-foreground underline underline-offset-4">
            Sign up
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
