/**
 * Loan domain types shared by the frontend (src/) and the backend (server/).
 */

/**
 * Union type for loan application status
 */
export type LoanStatus = 'pending' | 'approved' | 'rejected'

/**
 * Represents a loan application
 */
export interface LoanApplication {
  id: string
  applicantName: string
  amount: number        // loan amount
  termMonths: number    // number of months to repay
  interestRate: number  // e.g. 0.08 for 8% p.a.
  status: LoanStatus
  createdAt: string     // ISO timestamp
}

/**
 * Input for creating a new loan application
 */
export interface CreateLoanInput {
  applicantName: string
  amount: number
  termMonths: number
  interestRate: number
}
