<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { LoanApplication } from './types/loan'
import { getLoans, updateLoanStatus, autoDecideLoan, deleteLoan } from './services/loanService'
import LoanForm from './components/LoanForm.vue'
import LoanList from './components/LoanList.vue'
import LoanSummary from './components/LoanSummary.vue'

const loans = ref<LoanApplication[]>([])

function refreshLoans() {
  loans.value = getLoans()
}

function handleApprove(id: string) {
  updateLoanStatus(id, 'approved')
  refreshLoans()
}

function handleReject(id: string) {
  updateLoanStatus(id, 'rejected')
  refreshLoans()
}

function handleAutoDecide(id: string) {
  autoDecideLoan(id)
  refreshLoans()
}

function handleDelete(id: string) {
  deleteLoan(id)
  refreshLoans()
}

onMounted(() => {
  refreshLoans()
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <img src="/tredgate-logo-original.png" alt="Tredgate Logo" class="logo" />
      <h1>Tredgate Loan</h1>
      <p class="tagline">Simple loan application management</p>
    </header>

    <LoanSummary :loans="loans" />

    <main class="main-content">
      <LoanForm @created="refreshLoans" />
      <LoanList
        :loans="loans"
        @approve="handleApprove"
        @reject="handleReject"
        @auto-decide="handleAutoDecide"
        @delete="handleDelete"
      />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
}

.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

.logo {
  width: 80px;
  height: auto;
  margin-bottom: 0.5rem;
}

.tagline {
  color: var(--tagline-color);
  margin-top: -0.5rem;
}

.main-content {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
}

@media (max-width: 900px) {
  .main-content {
    flex-direction: column;
  }

  .main-content > :first-child {
    max-width: 100%;
    width: 100%;
  }
}
</style>
