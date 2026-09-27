<script setup lang="ts">
import { ref } from 'vue'
import { createLoanApplication } from '../services/loanService'

const emit = defineEmits<{
  created: []
}>()

const applicantName = ref('')
const amount = ref<number | null>(null)
const termMonths = ref<number | null>(null)
const interestRate = ref<number | null>(null)
const error = ref('')

async function handleSubmit() {
  error.value = ''

  // Basic validation
  if (!applicantName.value.trim()) {
    error.value = 'Applicant name is required'
    return
  }
  if (!amount.value || amount.value <= 0) {
    error.value = 'Amount must be greater than 0'
    return
  }
  if (!termMonths.value || termMonths.value <= 0) {
    error.value = 'Term months must be greater than 0'
    return
  }
  if (interestRate.value === null || interestRate.value < 0) {
    error.value = 'Interest rate is required and cannot be negative'
    return
  }

  try {
    await createLoanApplication({
      applicantName: applicantName.value.trim(),
      amount: amount.value,
      termMonths: termMonths.value,
      interestRate: interestRate.value
    })

    // Reset form
    applicantName.value = ''
    amount.value = null
    termMonths.value = null
    interestRate.value = null

    // Notify parent
    emit('created')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create loan application'
  }
}
</script>

<template>
  <div class="loan-form card">
    <h2>New Loan Application</h2>
    
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label for="applicantName">Applicant Name</label>
        <input
          id="applicantName"
          v-model="applicantName"
          type="text"
          placeholder="Enter applicant name"
          required
        />
      </div>

      <div class="form-group">
        <label for="amount">Loan Amount ($)</label>
        <input
          id="amount"
          v-model.number="amount"
          type="number"
          min="1"
          step="1"
          placeholder="Enter loan amount"
          required
        />
      </div>

      <div class="form-group">
        <label for="termMonths">Term (Months)</label>
        <input
          id="termMonths"
          v-model.number="termMonths"
          type="number"
          min="1"
          step="1"
          placeholder="Enter term in months"
          required
        />
      </div>

      <div class="form-group">
        <label for="interestRate">Interest Rate (e.g., 0.08 for 8%)</label>
        <input
          id="interestRate"
          v-model.number="interestRate"
          type="number"
          min="0"
          max="1"
          step="0.001"
          placeholder="Enter interest rate"
          required
        />
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <button type="submit" class="primary submit-btn">
        Create Application
      </button>
    </form>
  </div>
</template>

<style scoped>
.loan-form {
  max-width: 400px;
}

.form-group {
  margin-bottom: 1rem;
}

.submit-btn {
  width: 100%;
  margin-top: 0.5rem;
}

.error-message {
  color: var(--danger-color);
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: var(--border-radius);
  padding: 0.75rem;
  margin-bottom: 1rem;
}
</style>
