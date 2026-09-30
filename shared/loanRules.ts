import type { CreateLoanInput, LoanApplication, LoanStatus } from './loan'

/**
 * Business rules of the Tredgate lending policy.
 * Pure functions with no I/O: the server uses them for decisions,
 * the UI uses them for display.
 */

/**
 * Thrown when a loan application does not satisfy the lending policy
 */
export class LoanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanValidationError'
  }
}

/**
 * Auto-decision limits: a loan within both limits is approved, anything else is rejected
 */
export const AUTO_APPROVE_MAX_AMOUNT = 100_000
export const AUTO_APPROVE_MAX_TERM_MONTHS = 60

/**
 * Validate the input for a new loan application.
 * The input may come straight from an HTTP request, so types are checked as well.
 */
export function validateLoanInput(input: CreateLoanInput): void {
  if (typeof input !== 'object' || input === null) {
    throw new LoanValidationError('Request body must be a JSON object')
  }
  if (typeof input.applicantName !== 'string' || input.applicantName.trim() === '') {
    throw new LoanValidationError('Applicant name is required')
  }
  if (typeof input.amount !== 'number' || !(input.amount > 0)) {
    throw new LoanValidationError('Amount must be a number greater than 0')
  }
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
    throw new LoanValidationError('Term months must be a whole number greater than 0')
  }
  if (typeof input.interestRate !== 'number' || !(input.interestRate >= 0 && input.interestRate <= 1)) {
    throw new LoanValidationError('Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)')
  }
}

/**
 * Decide on a loan automatically:
 * - amount <= 100000 AND termMonths <= 60 → approved
 * - otherwise → rejected
 */
export function decideLoan(loan: Pick<LoanApplication, 'amount' | 'termMonths'>): LoanStatus {
  if (loan.amount <= AUTO_APPROVE_MAX_AMOUNT && loan.termMonths <= AUTO_APPROVE_MAX_TERM_MONTHS) {
    return 'approved'
  }
  return 'rejected'
}

/**
 * Calculate the monthly payment for a loan
 * Uses a simple formula: total = amount * (1 + interestRate), monthly = total / termMonths
 */
export function calculateMonthlyPayment(
  loan: Pick<LoanApplication, 'amount' | 'termMonths' | 'interestRate'>
): number {
  const total = loan.amount * (1 + loan.interestRate)
  return total / loan.termMonths
}
