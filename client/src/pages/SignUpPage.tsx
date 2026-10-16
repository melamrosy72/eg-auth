import { Link } from 'react-router'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { SignUpForm } from '@/features/auth/SignUpForm'

export function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>Create an account</h1>
          </CardTitle>
          <CardDescription>Enter your name, email and a password.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
        <CardFooter className="justify-center gap-1 text-muted-foreground">
          Already have an account?
          <Link to="/signin" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
