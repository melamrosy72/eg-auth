import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { FullScreenSpinner, ProtectedRoute, PublicOnlyRoute } from '@/features/auth/route-guards'

// Pages are split into their own chunks; the guards stay in the main bundle so the auth check starts at once.
const AppPage = lazy(() => import('@/pages/AppPage').then((m) => ({ default: m.AppPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const SignInPage = lazy(() => import('@/pages/SignInPage').then((m) => ({ default: m.SignInPage })))
const SignUpPage = lazy(() => import('@/pages/SignUpPage').then((m) => ({ default: m.SignUpPage })))

export function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/signin" element={<SignInPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
