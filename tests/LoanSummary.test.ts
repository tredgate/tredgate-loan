import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { mount } from '@vue/test-utils'
import LoanSummary from '../src/components/LoanSummary.vue'
import type { LoanApplication } from '../src/types/loan'

describe('LoanSummary.vue', () => {
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
    },
    {
      id: '3',
      applicantName: 'Bob Johnson',
      amount: 100000,
      termMonths: 60,
      interestRate: 0.07,
      status: 'approved',
      createdAt: '2024-03-01T00:00:00.000Z'
    },
    {
      id: '4',
      applicantName: 'Alice Brown',
      amount: 30000,
      termMonths: 12,
      interestRate: 0.05,
      status: 'rejected',
      createdAt: '2024-04-01T00:00:00.000Z'
    }
  ]

  beforeEach(() => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: []
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders all stat cards', () => {
    const statCards = wrapper.findAll('.stat-card')
    expect(statCards.length).toBe(5)
  })

  it('displays zero for all stats when no loans', () => {
    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[0].text()).toBe('0')
    expect(statValues[1].text()).toBe('0')
    expect(statValues[2].text()).toBe('0')
    expect(statValues[3].text()).toBe('0')
    expect(statValues[4].text()).toBe('$0')
  })

  it('displays correct stat labels', () => {
    const statLabels = wrapper.findAll('.stat-label')
    expect(statLabels[0].text()).toBe('Total Applications')
    expect(statLabels[1].text()).toBe('Pending')
    expect(statLabels[2].text()).toBe('Approved')
    expect(statLabels[3].text()).toBe('Rejected')
    expect(statLabels[4].text()).toBe('Total Approved')
  })

  it('calculates total applications correctly', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: sampleLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[0].text()).toBe('4')
  })

  it('calculates pending loans correctly', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: sampleLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[1].text()).toBe('1')
  })

  it('calculates approved loans correctly', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: sampleLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[2].text()).toBe('2')
  })

  it('calculates rejected loans correctly', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: sampleLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[3].text()).toBe('1')
  })

  it('calculates total approved amount correctly', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: sampleLoans
      }
    })

    // Approved loans: 75000 + 100000 = 175000
    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[4].text()).toBe('$175,000')
  })

  it('formats currency with dollar sign and commas', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: sampleLoans
      }
    })

    const amountStatValue = wrapper.findAll('.stat-value')[4]
    expect(amountStatValue.text()).toMatch(/\$[\d,]+/)
  })

  it('applies correct CSS class to pending stat card', () => {
    const statCards = wrapper.findAll('.stat-card')
    expect(statCards[1].classes()).toContain('pending')
  })

  it('applies correct CSS class to approved stat card', () => {
    const statCards = wrapper.findAll('.stat-card')
    expect(statCards[2].classes()).toContain('approved')
  })

  it('applies correct CSS class to rejected stat card', () => {
    const statCards = wrapper.findAll('.stat-card')
    expect(statCards[3].classes()).toContain('rejected')
  })

  it('applies correct CSS class to amount stat card', () => {
    const statCards = wrapper.findAll('.stat-card')
    expect(statCards[4].classes()).toContain('amount')
  })

  it('updates stats when loans prop changes', async () => {
    expect(wrapper.findAll('.stat-value')[0].text()).toBe('0')

    await wrapper.setProps({ loans: sampleLoans })

    expect(wrapper.findAll('.stat-value')[0].text()).toBe('4')
  })

  it('handles single loan correctly', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[0].text()).toBe('1')
    expect(statValues[1].text()).toBe('1')
    expect(statValues[2].text()).toBe('0')
    expect(statValues[3].text()).toBe('0')
    expect(statValues[4].text()).toBe('$0')
  })

  it('calculates total approved amount as zero when no approved loans', () => {
    wrapper = mount(LoanSummary, {
      props: {
        loans: [sampleLoans[0], sampleLoans[3]]
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[4].text()).toBe('$0')
  })

  it('handles all pending loans', () => {
    const pendingLoans: LoanApplication[] = [
      { ...sampleLoans[0], status: 'pending' },
      { ...sampleLoans[1], status: 'pending' },
      { ...sampleLoans[2], status: 'pending' }
    ]

    wrapper = mount(LoanSummary, {
      props: {
        loans: pendingLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[0].text()).toBe('3')
    expect(statValues[1].text()).toBe('3')
    expect(statValues[2].text()).toBe('0')
    expect(statValues[3].text()).toBe('0')
  })

  it('handles all approved loans', () => {
    const approvedLoans: LoanApplication[] = [
      { ...sampleLoans[0], status: 'approved' },
      { ...sampleLoans[1], status: 'approved' },
      { ...sampleLoans[2], status: 'approved' }
    ]

    wrapper = mount(LoanSummary, {
      props: {
        loans: approvedLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[0].text()).toBe('3')
    expect(statValues[1].text()).toBe('0')
    expect(statValues[2].text()).toBe('3')
    expect(statValues[3].text()).toBe('0')
    // Total: 50000 + 75000 + 100000 = 225000
    expect(statValues[4].text()).toBe('$225,000')
  })

  it('handles all rejected loans', () => {
    const rejectedLoans: LoanApplication[] = [
      { ...sampleLoans[0], status: 'rejected' },
      { ...sampleLoans[1], status: 'rejected' },
      { ...sampleLoans[2], status: 'rejected' }
    ]

    wrapper = mount(LoanSummary, {
      props: {
        loans: rejectedLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[0].text()).toBe('3')
    expect(statValues[1].text()).toBe('0')
    expect(statValues[2].text()).toBe('0')
    expect(statValues[3].text()).toBe('3')
  })

  it('formats large amounts correctly', () => {
    const largeLoans: LoanApplication[] = [
      { ...sampleLoans[0], amount: 1000000, status: 'approved' },
      { ...sampleLoans[1], amount: 2500000, status: 'approved' }
    ]

    wrapper = mount(LoanSummary, {
      props: {
        loans: largeLoans
      }
    })

    const statValues = wrapper.findAll('.stat-value')
    expect(statValues[4].text()).toBe('$3,500,000')
  })

  it('displays stat cards in a flex container', () => {
    expect(wrapper.find('.loan-summary').exists()).toBe(true)
  })
})
