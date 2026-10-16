import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      {/* Not <Button render={<Link />}>: Base UI then sets role="button" and the link loses link semantics. */}
      <Link to="/" className={buttonVariants()}>
        Go home
      </Link>
    </main>
  )
}
