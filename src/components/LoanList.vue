<script setup lang="ts">
import type { LoanApplication } from '../types/loan'
import { calculateMonthlyPayment } from '../services/loanService'

defineProps<{
  loans: LoanApplication[]
}>()

const emit = defineEmits<{
  approve: [id: string]
  reject: [id: string]
  autoDecide: [id: string]
  delete: [id: string]
}>()

function handleDelete(id: string, applicantName: string) {
  if (confirm(`Are you sure you want to delete the loan application for ${applicantName}?`)) {
    emit('delete', id)
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>

<template>
  <div class="loan-list card">
    <h2>Loan Applications</h2>
    
    <div v-if="loans.length === 0" class="empty-state">
      <p>No loan applications yet. Create one using the form.</p>
    </div>

    <div v-else class="table-container">
      <table>
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Amount</th>
            <th>Term</th>
            <th>Rate</th>
            <th>Monthly Payment</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="loan in loans" :key="loan.id">
            <td>{{ loan.applicantName }}</td>
            <td>{{ formatCurrency(loan.amount) }}</td>
            <td>{{ loan.termMonths }} mo</td>
            <td>{{ formatPercent(loan.interestRate) }}</td>
            <td>{{ formatCurrency(calculateMonthlyPayment(loan)) }}</td>
            <td>
              <span :class="['status-badge', `status-${loan.status}`]">
                {{ loan.status }}
              </span>
            </td>
            <td>{{ formatDate(loan.createdAt) }}</td>
            <td class="actions">
              <button
                v-if="loan.status === 'pending'"
                class="action-btn success"
                @click="emit('approve', loan.id)"
                title="Approve"
              >
                ✓
              </button>
              <button
                v-if="loan.status === 'pending'"
                class="action-btn danger"
                @click="emit('reject', loan.id)"
                title="Reject"
              >
                ✗
              </button>
              <button
                v-if="loan.status === 'pending'"
                class="action-btn secondary"
                @click="emit('autoDecide', loan.id)"
                title="Auto-decide"
              >
                ⚡
              </button>
              <button
                class="action-btn danger"
                @click="handleDelete(loan.id, loan.applicantName)"
                title="Delete"
              >
                🗑️
              </button>
              <span v-if="loan.status !== 'pending'" class="no-actions">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.loan-list {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.table-container {
  overflow-x: auto;
}

.actions {
  white-space: nowrap;
}

.action-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  margin-right: 0.25rem;
}

.action-btn:last-child {
  margin-right: 0;
}

.no-actions {
  color: var(--text-secondary);
}
</style>
