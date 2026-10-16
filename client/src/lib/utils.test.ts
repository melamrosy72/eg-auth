import { expect, test } from 'vitest'
import { cn } from '@/lib/utils'

// cn is pinned (see package.json); this guards the merge behaviour the shadcn components rely on.
test('cn merges conflicting Tailwind classes and drops falsy values', () => {
  expect(cn('p-2', 'p-4')).toBe('p-4')
  const active: boolean = false
  expect(cn('a', active && 'b', 'c')).toBe('a c')
})
