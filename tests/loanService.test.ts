import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
  getLoans,
  saveLoans,
  createLoanApplication,
  updateLoanStatus,
  calculateMonthlyPayment,
  autoDecideLoan
} from '../src/services/loanService'
import type { LoanApplication } from '../src/types/loan'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value
    }),
    clear: jest.fn(() => {
      store = {}
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key]
    }),
    get length() {
      return Object.keys(store).length
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null)
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('loanService', () => {
  beforeEach(() => {
    localStorageMock.clear()
    jest.clearAllMocks()
  })

  describe('getLoans', () => {
    it('returns empty array when nothing is stored', () => {
      const loans = getLoans()
      expect(loans).toEqual([])
    })

    it('returns stored loans', () => {
      const storedLoans: LoanApplication[] = [
        {
          id: '1',
          applicantName: 'John Doe',
          amount: 50000,
          termMonths: 24,
          interestRate: 0.08,
          status: 'pending',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      ]
      localStorageMock.setItem('tredgate_loans', JSON.stringify(storedLoans))

      const loans = getLoans()
      expect(loans).toEqual(storedLoans)
    })
  })

  describe('saveLoans', () => {
    it('saves loans to localStorage', () => {
      const loans: LoanApplication[] = [
        {
          id: '1',
          applicantName: 'Jane Doe',
          amount: 75000,
          termMonths: 36,
          interestRate: 0.06,
          status: 'approved',
          createdAt: '2024-02-01T00:00:00.000Z'
        }
      ]

      saveLoans(loans)

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'tredgate_loans',
        JSON.stringify(loans)
      )
    })
  })

  describe('createLoanApplication', () => {
    it('creates a new loan with pending status', () => {
      const input = {
        applicantName: 'Alice Smith',
        amount: 25000,
        termMonths: 12,
        interestRate: 0.05
      }

      const loan = createLoanApplication(input)

      expect(loan.applicantName).toBe('Alice Smith')
      expect(loan.amount).toBe(25000)
      expect(loan.termMonths).toBe(12)
      expect(loan.interestRate).toBe(0.05)
      expect(loan.status).toBe('pending')
      expect(loan.id).toBeDefined()
      expect(loan.createdAt).toBeDefined()
    })

    it('throws error for empty applicant name', () => {
      expect(() =>
        createLoanApplication({
          applicantName: '',
          amount: 10000,
          termMonths: 12,
          interestRate: 0.05
        })
      ).toThrow('Applicant name is required')
    })

    it('throws error for amount <= 0', () => {
      expect(() =>
        createLoanApplication({
          applicantName: 'John',
          amount: 0,
          termMonths: 12,
          interestRate: 0.05
        })
      ).toThrow('Amount must be greater than 0')
    })

    it('throws error for termMonths <= 0', () => {
      expect(() =>
        createLoanApplication({
          applicantName: 'John',
          amount: 10000,
          termMonths: 0,
          interestRate: 0.05
        })
      ).toThrow('Term months must be greater than 0')
    })

    it('throws error for negative interest rate', () => {
      expect(() =>
        createLoanApplication({
          applicantName: 'John',
          amount: 10000,
          termMonths: 12,
          interestRate: -0.05
        })
      ).toThrow('Interest rate cannot be negative')
    })
  })

  describe('updateLoanStatus', () => {
    it('updates loan status', () => {
      const loan: LoanApplication = {
        id: 'test-id',
        applicantName: 'Bob',
        amount: 50000,
        termMonths: 24,
        interestRate: 0.08,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
      saveLoans([loan])

      updateLoanStatus('test-id', 'approved')

      const loans = getLoans()
      expect(loans[0]?.status).toBe('approved')
    })

    it('throws error for non-existent loan', () => {
      expect(() => updateLoanStatus('non-existent', 'approved')).toThrow(
        'Loan with id non-existent not found'
      )
    })
  })

  describe('calculateMonthlyPayment', () => {
    it('calculates monthly payment correctly for basic case', () => {
      const loan: LoanApplication = {
        id: '1',
        applicantName: 'Test',
        amount: 10000,
        termMonths: 12,
        interestRate: 0.1, // 10%
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }

      // total = 10000 * 1.1 = 11000
      // monthly = 11000 / 12 = 916.666...
      const payment = calculateMonthlyPayment(loan)
      expect(payment).toBeCloseTo(916.67, 1)
    })

    it('calculates monthly payment for 0% interest', () => {
      const loan: LoanApplication = {
        id: '1',
        applicantName: 'Test',
        amount: 12000,
        termMonths: 12,
        interestRate: 0,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }

      // total = 12000 * 1.0 = 12000
      // monthly = 12000 / 12 = 1000
      const payment = calculateMonthlyPayment(loan)
      expect(payment).toBe(1000)
    })

    it('calculates monthly payment for large loan', () => {
      const loan: LoanApplication = {
        id: '1',
        applicantName: 'Test',
        amount: 100000,
        termMonths: 60,
        interestRate: 0.08,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }

      // total = 100000 * 1.08 = 108000
      // monthly = 108000 / 60 = 1800
      const payment = calculateMonthlyPayment(loan)
      expect(payment).toBe(1800)
    })
  })

  describe('autoDecideLoan', () => {
    it('approves loan when amount <= 100000 and termMonths <= 60', () => {
      const loan: LoanApplication = {
        id: 'auto-test',
        applicantName: 'Auto User',
        amount: 100000,
        termMonths: 60,
        interestRate: 0.08,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
      saveLoans([loan])

      autoDecideLoan('auto-test')

      const loans = getLoans()
      expect(loans[0]?.status).toBe('approved')
    })

    it('approves small, short-term loan', () => {
      const loan: LoanApplication = {
        id: 'small-loan',
        applicantName: 'Small Borrower',
        amount: 5000,
        termMonths: 6,
        interestRate: 0.05,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
      saveLoans([loan])

      autoDecideLoan('small-loan')

      const loans = getLoans()
      expect(loans[0]?.status).toBe('approved')
    })

    it('rejects loan when amount > 100000', () => {
      const loan: LoanApplication = {
        id: 'big-loan',
        applicantName: 'Big Borrower',
        amount: 150000,
        termMonths: 60,
        interestRate: 0.08,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
      saveLoans([loan])

      autoDecideLoan('big-loan')

      const loans = getLoans()
      expect(loans[0]?.status).toBe('rejected')
    })

    it('rejects loan when termMonths > 60', () => {
      const loan: LoanApplication = {
        id: 'long-loan',
        applicantName: 'Long Term Borrower',
        amount: 50000,
        termMonths: 72,
        interestRate: 0.08,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
      saveLoans([loan])

      autoDecideLoan('long-loan')

      const loans = getLoans()
      expect(loans[0]?.status).toBe('rejected')
    })

    it('rejects loan when both amount and termMonths exceed limits', () => {
      const loan: LoanApplication = {
        id: 'bad-loan',
        applicantName: 'Bad Borrower',
        amount: 200000,
        termMonths: 120,
        interestRate: 0.08,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
      saveLoans([loan])

      autoDecideLoan('bad-loan')

      const loans = getLoans()
      expect(loans[0]?.status).toBe('rejected')
    })

    it('throws error for non-existent loan', () => {
      expect(() => autoDecideLoan('non-existent')).toThrow(
        'Loan with id non-existent not found'
      )
    })
  })
})
