export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_MEDIA'
  | 'MEDIA_TOO_LARGE'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'RATE_LIMITED'
  | 'STORAGE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export type ApiError = {
  error: {
    code: ApiErrorCode | string
    message: string
    requestId?: string
  }
}
