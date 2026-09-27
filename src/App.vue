<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { LoanApplication } from '../shared/loan'
import { getLoans, updateLoanStatus, autoDecideLoan } from './services/loanService'
import LoanForm from './components/LoanForm.vue'
import LoanList from './components/LoanList.vue'
import LoanSummary from './components/LoanSummary.vue'

const loans = ref<LoanApplication[]>([])
const error = ref('')

async function refreshLoans() {
  try {
    loans.value = await getLoans()
    error.value = ''
  } catch (e) {
    error.value = toMessage(e, 'Failed to load loan applications')
  }
}

async function runAction(action: () => Promise<unknown>) {
  try {
    await action()
    await refreshLoans()
  } catch (e) {
    error.value = toMessage(e, 'Action failed')
  }
}

function handleApprove(id: string) {
  return runAction(() => updateLoanStatus(id, 'approved'))
}

function handleReject(id: string) {
  return runAction(() => updateLoanStatus(id, 'rejected'))
}

function handleAutoDecide(id: string) {
  return runAction(() => autoDecideLoan(id))
}

function toMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? `${fallback}: ${e.message}` : fallback
}

onMounted(refreshLoans)
</script>

<template>
  <div class="app">
    <header class="app-header">
      <img src="/tredgate-logo-original.png" alt="Tredgate Logo" class="logo" />
      <h1>Tredgate Loan</h1>
      <p class="tagline">Simple loan application management</p>
    </header>

    <div v-if="error" class="error-banner" role="alert">
      <span>{{ error }}</span>
      <button class="secondary retry-btn" @click="refreshLoans">Retry</button>
    </div>

    <LoanSummary :loans="loans" />

    <main class="main-content">
      <LoanForm @created="refreshLoans" />
      <LoanList
        :loans="loans"
        @approve="handleApprove"
        @reject="handleReject"
        @auto-decide="handleAutoDecide"
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

.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  color: #721c24;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: var(--border-radius);
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
}

.retry-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.875rem;
  white-space: nowrap;
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
