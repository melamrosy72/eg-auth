import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { AppRoutes } from '@/app/router'

test('unknown path renders NotFoundPage with a link home', () => {
  render(
    <MemoryRouter initialEntries={['/nope']}>
      <AppRoutes />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
})
