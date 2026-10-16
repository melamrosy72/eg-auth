import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { AppRoutes } from '@/app/router'

test('unknown path renders NotFoundPage with a link home', async () => {
  render(
    <MemoryRouter initialEntries={['/nope']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  // Pages are lazy-loaded, so wait for the chunk.
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
})
