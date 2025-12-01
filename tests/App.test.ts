import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { mount } from '@vue/test-utils'
import App from '../src/App.vue'
import LoanForm from '../src/components/LoanForm.vue'
import LoanList from '../src/components/LoanList.vue'
import LoanSummary from '../src/components/LoanSummary.vue'
import * as loanService from '../src/services/loanService'
import type { LoanApplication } from '../src/types/loan'

// Mock the loanService
jest.mock('../src/services/loanService', () => ({
  getLoans: jest.fn(),
  updateLoanStatus: jest.fn(),
  autoDecideLoan: jest.fn(),
  calculateMonthlyPayment: jest.fn((loan: LoanApplication) => {
    const total = loan.amount * (1 + loan.interestRate)
    return total / loan.termMonths
  })
}))

describe('App.vue', () => {
  let wrapper: ReturnType<typeof mount>
  const sampleLoans: LoanApplication[] = [
    {
      id: '1',
      applicantName: 'John Doe',
      amount: 50000,
      termMonths: 24,
      interestRate: 0.08,
      status: 'pending',
      createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: '2',
      applicantName: 'Jane Smith',
      amount: 75000,
      termMonths: 36,
      interestRate: 0.06,
      status: 'approved',
      createdAt: '2024-02-01T00:00:00.000Z'
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    mockGetLoans.mockReturnValue([])
    wrapper = mount(App)
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders the app', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('renders header with title', () => {
    expect(wrapper.find('h1').text()).toBe('Tredgate Loan')
  })

  it('renders tagline', () => {
    expect(wrapper.find('.tagline').text()).toBe('Simple loan application management')
  })

  it('renders logo image', () => {
    const logo = wrapper.find('.logo')
    expect(logo.exists()).toBe(true)
    expect(logo.attributes('src')).toBe('/tredgate-logo-original.png')
    expect(logo.attributes('alt')).toBe('Tredgate Logo')
  })

  it('renders LoanSummary component', () => {
    expect(wrapper.findComponent(LoanSummary).exists()).toBe(true)
  })

  it('renders LoanForm component', () => {
    expect(wrapper.findComponent(LoanForm).exists()).toBe(true)
  })

  it('renders LoanList component', () => {
    expect(wrapper.findComponent(LoanList).exists()).toBe(true)
  })

  it('loads loans on mount', () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    expect(mockGetLoans).toHaveBeenCalled()
  })

  it('passes loans to LoanSummary component', async () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    mockGetLoans.mockReturnValue(sampleLoans)

    wrapper = mount(App)
    await wrapper.vm.$nextTick()

    const loanSummary = wrapper.findComponent(LoanSummary)
    expect(loanSummary.props('loans')).toEqual(sampleLoans)
  })

  it('passes loans to LoanList component', async () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    mockGetLoans.mockReturnValue(sampleLoans)

    wrapper = mount(App)
    await wrapper.vm.$nextTick()

    const loanList = wrapper.findComponent(LoanList)
    expect(loanList.props('loans')).toEqual(sampleLoans)
  })

  it('refreshes loans when LoanForm emits created event', async () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    mockGetLoans.mockReturnValue([])

    wrapper = mount(App)
    const initialCallCount = mockGetLoans.mock.calls.length

    const loanForm = wrapper.findComponent(LoanForm)
    await loanForm.vm.$emit('created')

    expect(mockGetLoans.mock.calls.length).toBe(initialCallCount + 1)
  })

  it('calls updateLoanStatus and refreshes when approve event emitted', async () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    const mockUpdateLoanStatus = loanService.updateLoanStatus as jest.MockedFunction<typeof loanService.updateLoanStatus>
    mockGetLoans.mockReturnValue(sampleLoans)

    wrapper = mount(App)
    const initialCallCount = mockGetLoans.mock.calls.length

    const loanList = wrapper.findComponent(LoanList)
    await loanList.vm.$emit('approve', '1')

    expect(mockUpdateLoanStatus).toHaveBeenCalledWith('1', 'approved')
    expect(mockGetLoans.mock.calls.length).toBe(initialCallCount + 1)
  })

  it('calls updateLoanStatus and refreshes when reject event emitted', async () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    const mockUpdateLoanStatus = loanService.updateLoanStatus as jest.MockedFunction<typeof loanService.updateLoanStatus>
    mockGetLoans.mockReturnValue(sampleLoans)

    wrapper = mount(App)
    const initialCallCount = mockGetLoans.mock.calls.length

    const loanList = wrapper.findComponent(LoanList)
    await loanList.vm.$emit('reject', '2')

    expect(mockUpdateLoanStatus).toHaveBeenCalledWith('2', 'rejected')
    expect(mockGetLoans.mock.calls.length).toBe(initialCallCount + 1)
  })

  it('calls autoDecideLoan and refreshes when autoDecide event emitted', async () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    const mockAutoDecideLoan = loanService.autoDecideLoan as jest.MockedFunction<typeof loanService.autoDecideLoan>
    mockGetLoans.mockReturnValue(sampleLoans)

    wrapper = mount(App)
    const initialCallCount = mockGetLoans.mock.calls.length

    const loanList = wrapper.findComponent(LoanList)
    await loanList.vm.$emit('auto-decide', '1')

    expect(mockAutoDecideLoan).toHaveBeenCalledWith('1')
    expect(mockGetLoans.mock.calls.length).toBe(initialCallCount + 1)
  })

  it('renders main content in flex layout', () => {
    expect(wrapper.find('.main-content').exists()).toBe(true)
  })

  it('renders app header', () => {
    expect(wrapper.find('.app-header').exists()).toBe(true)
  })

  it('updates displayed loans after refresh', async () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    mockGetLoans.mockReturnValue([])

    wrapper = mount(App)
    let loanList = wrapper.findComponent(LoanList)
    expect(loanList.props('loans')).toEqual([])

    // Update mock to return loans
    mockGetLoans.mockReturnValue(sampleLoans)

    // Trigger refresh by emitting created event
    const loanForm = wrapper.findComponent(LoanForm)
    await loanForm.vm.$emit('created')
    await wrapper.vm.$nextTick()

    loanList = wrapper.findComponent(LoanList)
    expect(loanList.props('loans')).toEqual(sampleLoans)
  })

  it('handles empty loan list initially', () => {
    const mockGetLoans = loanService.getLoans as jest.MockedFunction<typeof loanService.getLoans>
    mockGetLoans.mockReturnValue([])

    wrapper = mount(App)

    const loanList = wrapper.findComponent(LoanList)
    expect(loanList.props('loans')).toEqual([])
  })

  it('integrates all components properly', () => {
    expect(wrapper.findComponent(LoanForm).exists()).toBe(true)
    expect(wrapper.findComponent(LoanList).exists()).toBe(true)
    expect(wrapper.findComponent(LoanSummary).exists()).toBe(true)
    expect(wrapper.find('.app-header').exists()).toBe(true)
    expect(wrapper.find('.main-content').exists()).toBe(true)
  })
})
