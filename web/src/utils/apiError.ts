export const parseApiError = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
    const firstError = response?.data?.errors ? Object.values(response.data.errors).flat().at(0) : null

    if (firstError && typeof firstError === 'string') {
      return firstError
    }

    if (response?.data?.message) {
      return response.data.message
    }
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return error.message
  }

  return fallback
}

export const isApiStatus = (error: unknown, status: number): boolean => {
  if (typeof error === 'object' && error && 'response' in error) {
    const responseStatus = (error as { response?: { status?: number } }).response?.status
    return responseStatus === status
  }

  return false
}
