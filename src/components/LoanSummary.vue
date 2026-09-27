<script setup lang="ts">
import { computed } from 'vue'
import type { LoanApplication } from '../../shared/loan'

const props = defineProps<{
  loans: LoanApplication[]
}>()

const stats = computed(() => {
  const pending = props.loans.filter(l => l.status === 'pending')
  const approved = props.loans.filter(l => l.status === 'approved')
  const rejected = props.loans.filter(l => l.status === 'rejected')

  const totalApprovedAmount = approved.reduce((sum, l) => sum + l.amount, 0)

  return {
    total: props.loans.length,
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    totalApprovedAmount
  }
})

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}
</script>

<template>
  <div class="loan-summary">
    <div class="stat-card">
      <div class="stat-value">{{ stats.total }}</div>
      <div class="stat-label">Total Applications</div>
    </div>
    <div class="stat-card pending">
      <div class="stat-value">{{ stats.pending }}</div>
      <div class="stat-label">Pending</div>
    </div>
    <div class="stat-card approved">
      <div class="stat-value">{{ stats.approved }}</div>
      <div class="stat-label">Approved</div>
    </div>
    <div class="stat-card rejected">
      <div class="stat-value">{{ stats.rejected }}</div>
      <div class="stat-label">Rejected</div>
    </div>
    <div class="stat-card amount">
      <div class="stat-value">{{ formatCurrency(stats.totalApprovedAmount) }}</div>
      <div class="stat-label">Total Approved</div>
    </div>
  </div>
</template>

<style scoped>
.loan-summary {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.stat-card {
  background-color: var(--card-background);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow);
  padding: 1rem 1.5rem;
  text-align: center;
  min-width: 120px;
  flex: 1;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--primary-color);
}

.stat-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
}

.stat-card.pending .stat-value {
  color: #856404;
}

.stat-card.approved .stat-value {
  color: #155724;
}

.stat-card.rejected .stat-value {
  color: #721c24;
}

.stat-card.amount .stat-value {
  font-size: 1.25rem;
}

@media (max-width: 768px) {
  .stat-card {
    min-width: 80px;
    padding: 0.75rem 1rem;
  }

  .stat-value {
    font-size: 1.25rem;
  }
}
</style>
