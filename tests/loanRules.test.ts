import { describe, it, expect } from 'vitest'
import {
  validateLoanInput,
  decideLoan,
  calculateMonthlyPayment,
  LoanValidationError
} from '../shared/loanRules'
import type { CreateLoanInput } from '../shared/loan'

const validInput: CreateLoanInput = {
  applicantName: 'Alice Smith',
  amount: 25000,
  termMonths: 12,
  interestRate: 0.05
}

describe('loanRules', () => {
  describe('validateLoanInput', () => {
    it('accepts a valid application', () => {
      expect(() => validateLoanInput(validInput)).not.toThrow()
    })

    it('throws LoanValidationError so the API can map it to 400', () => {
      expect(() => validateLoanInput({ ...validInput, amount: 0 })).toThrow(LoanValidationError)
    })

    it('rejects a missing body', () => {
      expect(() => validateLoanInput(undefined as unknown as CreateLoanInput)).toThrow(
        'Request body must be a JSON object'
      )
    })

    it('rejects an empty applicant name', () => {
      expect(() => validateLoanInput({ ...validInput, applicantName: '   ' })).toThrow(
        'Applicant name is required'
      )
    })

    it('rejects amount <= 0', () => {
      expect(() => validateLoanInput({ ...validInput, amount: 0 })).toThrow(
        'Amount must be a number greater than 0'
      )
    })

    it('rejects a non-numeric amount, e.g. a string from a raw HTTP request', () => {
      const input = { ...validInput, amount: '50000' as unknown as number }
      expect(() => validateLoanInput(input)).toThrow('Amount must be a number greater than 0')
    })

    it('rejects termMonths <= 0', () => {
      expect(() => validateLoanInput({ ...validInput, termMonths: 0 })).toThrow(
        'Term months must be a whole number greater than 0'
      )
    })

    it('rejects a fractional term', () => {
      expect(() => validateLoanInput({ ...validInput, termMonths: 12.5 })).toThrow(
        'Term months must be a whole number greater than 0'
      )
    })

    it('rejects a negative interest rate', () => {
      expect(() => validateLoanInput({ ...validInput, interestRate: -0.05 })).toThrow(
        'Interest rate must be between 0 and 1'
      )
    })

    it('rejects an interest rate above 1, e.g. 8 instead of 0.08', () => {
      expect(() => validateLoanInput({ ...validInput, interestRate: 8 })).toThrow(
        'Interest rate must be between 0 and 1'
      )
    })
  })

  describe('decideLoan', () => {
    it('approves a loan exactly at both limits (amount 100000, term 60)', () => {
      expect(decideLoan({ amount: 100000, termMonths: 60 })).toBe('approved')
    })

    it('approves a small, short-term loan', () => {
      expect(decideLoan({ amount: 5000, termMonths: 6 })).toBe('approved')
    })

    it('rejects a loan when amount > 100000', () => {
      expect(decideLoan({ amount: 100001, termMonths: 60 })).toBe('rejected')
    })

    it('rejects a loan when termMonths > 60', () => {
      expect(decideLoan({ amount: 50000, termMonths: 61 })).toBe('rejected')
    })

    it('rejects a loan when both limits are exceeded', () => {
      expect(decideLoan({ amount: 200000, termMonths: 120 })).toBe('rejected')
    })
  })

  describe('calculateMonthlyPayment', () => {
    it('calculates monthly payment for a basic case', () => {
      // total = 10000 * 1.1 = 11000, monthly = 11000 / 12 = 916.67
      const payment = calculateMonthlyPayment({ amount: 10000, termMonths: 12, interestRate: 0.1 })
      expect(payment).toBeCloseTo(916.67, 1)
    })

    it('calculates monthly payment for 0% interest', () => {
      expect(calculateMonthlyPayment({ amount: 12000, termMonths: 12, interestRate: 0 })).toBe(1000)
    })

    it('calculates monthly payment for a large loan', () => {
      // total = 100000 * 1.08 = 108000, monthly = 108000 / 60 = 1800
      expect(calculateMonthlyPayment({ amount: 100000, termMonths: 60, interestRate: 0.08 })).toBe(1800)
    })
  })
})
