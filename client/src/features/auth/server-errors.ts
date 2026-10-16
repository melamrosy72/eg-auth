import { toast } from 'sonner'
import type { ApiError } from '@/lib/http'

// specs/05 §3, after each form has handled its own status (signin 401, signup 409).
// Returns the lines for the form-level alert, or null when a toast was shown instead.
export function reportServerError(error: ApiError): string[] | null {
  if (error.status === 400) return Array.isArray(error.message) ? error.message : [error.message]
  if (error.status === 429) return ['Too many attempts, please wait a minute']
  toast.error(error.status === 403 ? 'Request blocked, please reload the page' : 'Something went wrong, please try again')
  return null
}
