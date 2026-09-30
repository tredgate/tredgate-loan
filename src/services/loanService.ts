import type { CreateLoanInput, LoanApplication, LoanStatus } from '../../shared/loan'

/**
 * Client for the loan API served by server/ (proxied by Vite under /api in development).
 * Every function returns a promise and throws an Error with the server's message on failure.
 */

async function request<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${route}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

/**
 * Load all loan applications
 */
export function getLoans(): Promise<LoanApplication[]> {
  return request<LoanApplication[]>('/loans')
}

/**
 * Create a new loan application
 */
export function createLoanApplication(input: CreateLoanInput): Promise<LoanApplication> {
  return request<LoanApplication>('/loans', {
    method: 'POST',
    body: JSON.stringify(input)
  })
}

/**
 * Approve or reject a loan by ID
 */
export function updateLoanStatus(id: string, status: LoanStatus): Promise<LoanApplication> {
  return request<LoanApplication>(`/loans/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })
}

/**
 * Let the server decide on a loan using the lending policy rules
 */
export function autoDecideLoan(id: string): Promise<LoanApplication> {
  return request<LoanApplication>(`/loans/${id}/auto-decide`, { method: 'POST' })
}
