import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { mount } from '@vue/test-utils'
import LoanForm from '../src/components/LoanForm.vue'
import * as loanService from '../src/services/loanService'

// Mock the loanService
jest.mock('../src/services/loanService', () => ({
  createLoanApplication: jest.fn()
}))

describe('LoanForm.vue', () => {
  let wrapper: ReturnType<typeof mount>

  beforeEach(() => {
    jest.clearAllMocks()
    wrapper = mount(LoanForm)
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders form with all input fields', () => {
    expect(wrapper.find('#applicantName').exists()).toBe(true)
    expect(wrapper.find('#amount').exists()).toBe(true)
    expect(wrapper.find('#termMonths').exists()).toBe(true)
    expect(wrapper.find('#interestRate').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })

  it('renders form title', () => {
    expect(wrapper.find('h2').text()).toBe('New Loan Application')
  })

  it('displays error when applicant name is empty', async () => {
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Applicant name is required')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when amount is empty', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Amount must be greater than 0')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when amount is zero', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(0)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Amount must be greater than 0')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when amount is negative', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(-1000)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Amount must be greater than 0')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when termMonths is empty', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Term months must be greater than 0')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when termMonths is zero', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(0)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Term months must be greater than 0')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when termMonths is negative', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(-12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Term months must be greater than 0')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when interest rate is null', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Interest rate is required and cannot be negative')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('displays error when interest rate is negative', async () => {
    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(-0.05)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Interest rate is required and cannot be negative')
    expect(loanService.createLoanApplication).not.toHaveBeenCalled()
  })

  it('creates loan application with valid input', async () => {
    const mockCreateLoan = loanService.createLoanApplication as jest.MockedFunction<typeof loanService.createLoanApplication>
    mockCreateLoan.mockReturnValue({
      id: 'test-id',
      applicantName: 'John Doe',
      amount: 10000,
      termMonths: 12,
      interestRate: 0.08,
      status: 'pending',
      createdAt: new Date().toISOString()
    })

    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(mockCreateLoan).toHaveBeenCalledWith({
      applicantName: 'John Doe',
      amount: 10000,
      termMonths: 12,
      interestRate: 0.08
    })
  })

  it('emits created event after successful submission', async () => {
    const mockCreateLoan = loanService.createLoanApplication as jest.MockedFunction<typeof loanService.createLoanApplication>
    mockCreateLoan.mockReturnValue({
      id: 'test-id',
      applicantName: 'Jane Smith',
      amount: 25000,
      termMonths: 24,
      interestRate: 0.06,
      status: 'pending',
      createdAt: new Date().toISOString()
    })

    await wrapper.find('#applicantName').setValue('Jane Smith')
    await wrapper.find('#amount').setValue(25000)
    await wrapper.find('#termMonths').setValue(24)
    await wrapper.find('#interestRate').setValue(0.06)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.emitted('created')).toBeTruthy()
    expect(wrapper.emitted('created')?.length).toBe(1)
  })

  it('resets form after successful submission', async () => {
    const mockCreateLoan = loanService.createLoanApplication as jest.MockedFunction<typeof loanService.createLoanApplication>
    mockCreateLoan.mockReturnValue({
      id: 'test-id',
      applicantName: 'Test User',
      amount: 5000,
      termMonths: 6,
      interestRate: 0.05,
      status: 'pending',
      createdAt: new Date().toISOString()
    })

    await wrapper.find('#applicantName').setValue('Test User')
    await wrapper.find('#amount').setValue(5000)
    await wrapper.find('#termMonths').setValue(6)
    await wrapper.find('#interestRate').setValue(0.05)
    await wrapper.find('form').trigger('submit.prevent')

    // Wait for next tick to let the form reset
    await wrapper.vm.$nextTick()

    expect((wrapper.find('#applicantName').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#amount').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#termMonths').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#interestRate').element as HTMLInputElement).value).toBe('')
  })

  it('displays error when service throws exception', async () => {
    const mockCreateLoan = loanService.createLoanApplication as jest.MockedFunction<typeof loanService.createLoanApplication>
    mockCreateLoan.mockImplementation(() => {
      throw new Error('Database error')
    })

    await wrapper.find('#applicantName').setValue('Test User')
    await wrapper.find('#amount').setValue(5000)
    await wrapper.find('#termMonths').setValue(6)
    await wrapper.find('#interestRate').setValue(0.05)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Database error')
  })

  it('displays generic error when non-Error exception is thrown', async () => {
    const mockCreateLoan = loanService.createLoanApplication as jest.MockedFunction<typeof loanService.createLoanApplication>
    mockCreateLoan.mockImplementation(() => {
      throw 'Unknown error'
    })

    await wrapper.find('#applicantName').setValue('Test User')
    await wrapper.find('#amount').setValue(5000)
    await wrapper.find('#termMonths').setValue(6)
    await wrapper.find('#interestRate').setValue(0.05)
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('Failed to create loan application')
  })

  it('trims whitespace from applicant name', async () => {
    const mockCreateLoan = loanService.createLoanApplication as jest.MockedFunction<typeof loanService.createLoanApplication>
    mockCreateLoan.mockReturnValue({
      id: 'test-id',
      applicantName: 'John Doe',
      amount: 10000,
      termMonths: 12,
      interestRate: 0.08,
      status: 'pending',
      createdAt: new Date().toISOString()
    })

    await wrapper.find('#applicantName').setValue('  John Doe  ')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    expect(mockCreateLoan).toHaveBeenCalledWith({
      applicantName: 'John Doe',
      amount: 10000,
      termMonths: 12,
      interestRate: 0.08
    })
  })

  it('clears error message on successful submission', async () => {
    const mockCreateLoan = loanService.createLoanApplication as jest.MockedFunction<typeof loanService.createLoanApplication>
    
    // First submission with error
    await wrapper.find('#applicantName').setValue('')
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.find('.error-message').exists()).toBe(true)

    // Second submission successful
    mockCreateLoan.mockReturnValue({
      id: 'test-id',
      applicantName: 'John Doe',
      amount: 10000,
      termMonths: 12,
      interestRate: 0.08,
      status: 'pending',
      createdAt: new Date().toISOString()
    })

    await wrapper.find('#applicantName').setValue('John Doe')
    await wrapper.find('#amount').setValue(10000)
    await wrapper.find('#termMonths').setValue(12)
    await wrapper.find('#interestRate').setValue(0.08)
    await wrapper.find('form').trigger('submit.prevent')

    await wrapper.vm.$nextTick()
    expect(wrapper.find('.error-message').exists()).toBe(false)
  })
})
