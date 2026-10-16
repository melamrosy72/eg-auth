import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
})

// specs/05 §5. Network failures (no response) get status 0.
export type ApiError = { status: number; message: string | string[]; requestId?: string }

type ErrorBody = { message?: string | string[]; requestId?: string }

// Anything that is not an Axios error is a bug, so it is rethrown instead of being turned into an ApiError.
export function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError<ErrorBody>(error)) throw error
  if (!error.response) return { status: 0, message: error.message }
  const { status, data } = error.response
  return { status, message: data?.message ?? error.message, requestId: data?.requestId }
}
