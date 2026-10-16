import { Navigate, Route, Routes } from 'react-router'
import { AppPage } from '@/pages/AppPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SignInPage } from '@/pages/SignInPage'
import { SignUpPage } from '@/pages/SignUpPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/app" element={<AppPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
