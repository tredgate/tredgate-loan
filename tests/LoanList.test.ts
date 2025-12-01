import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { mount } from '@vue/test-utils'
import LoanList from '../src/components/LoanList.vue'
import type { LoanApplication } from '../src/types/loan'

describe('LoanList.vue', () => {
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
      status: 'rejected',
      createdAt: '2024-03-01T00:00:00.000Z'
    }
  ]

  beforeEach(() => {
    wrapper = mount(LoanList, {
      props: {
        loans: []
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('renders component title', () => {
    expect(wrapper.find('h2').text()).toBe('Loan Applications')
  })

  it('displays empty state when no loans', () => {
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.empty-state p').text()).toBe('No loan applications yet. Create one using the form.')
  })

  it('does not display empty state when loans exist', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: sampleLoans
      }
    })

    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('renders table with headers when loans exist', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: sampleLoans
      }
    })

    const headers = wrapper.findAll('th')
    expect(headers.length).toBe(8)
    expect(headers[0].text()).toBe('Applicant')
    expect(headers[1].text()).toBe('Amount')
    expect(headers[2].text()).toBe('Term')
    expect(headers[3].text()).toBe('Rate')
    expect(headers[4].text()).toBe('Monthly Payment')
    expect(headers[5].text()).toBe('Status')
    expect(headers[6].text()).toBe('Created')
    expect(headers[7].text()).toBe('Actions')
  })

  it('renders correct number of loan rows', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: sampleLoans
      }
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(3)
  })

  it('displays loan details correctly', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    const cells = wrapper.findAll('tbody td')
    expect(cells[0].text()).toBe('John Doe')
    expect(cells[1].text()).toContain('$50,000')
    expect(cells[2].text()).toBe('24 mo')
    expect(cells[3].text()).toBe('8.0%')
    expect(cells[4].text()).toContain('$2,250')
    expect(cells[5].text()).toBe('pending')
    expect(cells[6].text()).toBe('Jan 1, 2024')
  })

  it('shows action buttons for pending loans', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    const actionButtons = wrapper.findAll('.action-btn')
    expect(actionButtons.length).toBe(3)
    expect(actionButtons[0].classes()).toContain('success')
    expect(actionButtons[0].attributes('title')).toBe('Approve')
    expect(actionButtons[1].classes()).toContain('danger')
    expect(actionButtons[1].attributes('title')).toBe('Reject')
    expect(actionButtons[2].classes()).toContain('secondary')
    expect(actionButtons[2].attributes('title')).toBe('Auto-decide')
  })

  it('does not show action buttons for approved loans', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[1]]
      }
    })

    expect(wrapper.findAll('.action-btn').length).toBe(0)
    expect(wrapper.find('.no-actions').exists()).toBe(true)
  })

  it('does not show action buttons for rejected loans', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[2]]
      }
    })

    expect(wrapper.findAll('.action-btn').length).toBe(0)
    expect(wrapper.find('.no-actions').exists()).toBe(true)
  })

  it('emits approve event when approve button clicked', async () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    const approveButton = wrapper.findAll('.action-btn')[0]
    await approveButton.trigger('click')

    expect(wrapper.emitted('approve')).toBeTruthy()
    expect(wrapper.emitted('approve')?.[0]).toEqual(['1'])
  })

  it('emits reject event when reject button clicked', async () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    const rejectButton = wrapper.findAll('.action-btn')[1]
    await rejectButton.trigger('click')

    expect(wrapper.emitted('reject')).toBeTruthy()
    expect(wrapper.emitted('reject')?.[0]).toEqual(['1'])
  })

  it('emits autoDecide event when auto-decide button clicked', async () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    const autoDecideButton = wrapper.findAll('.action-btn')[2]
    await autoDecideButton.trigger('click')

    expect(wrapper.emitted('autoDecide')).toBeTruthy()
    expect(wrapper.emitted('autoDecide')?.[0]).toEqual(['1'])
  })

  it('formats currency with dollar sign and commas', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[1]]
      }
    })

    const amountCell = wrapper.findAll('tbody td')[1]
    expect(amountCell.text()).toMatch(/\$75,000/)
  })

  it('formats percentage with percent sign', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[1]]
      }
    })

    const rateCell = wrapper.findAll('tbody td')[3]
    expect(rateCell.text()).toBe('6.0%')
  })

  it('calculates and displays monthly payment', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    // amount: 50000, rate: 0.08, term: 24
    // total = 50000 * 1.08 = 54000
    // monthly = 54000 / 24 = 2250
    const monthlyPaymentCell = wrapper.findAll('tbody td')[4]
    expect(monthlyPaymentCell.text()).toContain('$2,250')
  })

  it('displays status badges with correct classes', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: sampleLoans
      }
    })

    const statusBadges = wrapper.findAll('.status-badge')
    expect(statusBadges.length).toBe(3)
    expect(statusBadges[0].classes()).toContain('status-pending')
    expect(statusBadges[1].classes()).toContain('status-approved')
    expect(statusBadges[2].classes()).toContain('status-rejected')
  })

  it('formats date in readable format', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: [sampleLoans[0]]
      }
    })

    const dateCell = wrapper.findAll('tbody td')[6]
    expect(dateCell.text()).toBe('Jan 1, 2024')
  })

  it('handles multiple loans correctly', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: sampleLoans
      }
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(3)

    // Check first loan
    const firstRowCells = rows[0].findAll('td')
    expect(firstRowCells[0].text()).toBe('John Doe')

    // Check second loan
    const secondRowCells = rows[1].findAll('td')
    expect(secondRowCells[0].text()).toBe('Jane Smith')

    // Check third loan
    const thirdRowCells = rows[2].findAll('td')
    expect(thirdRowCells[0].text()).toBe('Bob Johnson')
  })

  it('renders table in scrollable container', () => {
    wrapper = mount(LoanList, {
      props: {
        loans: sampleLoans
      }
    })

    expect(wrapper.find('.table-container').exists()).toBe(true)
    expect(wrapper.find('.table-container table').exists()).toBe(true)
  })
})
