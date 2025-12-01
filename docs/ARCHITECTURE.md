# Architecture Overview

This document describes the architecture of the Tredgate Loan application.

## Overview

Tredgate Loan is a frontend-only Vue 3 application that manages loan applications. It uses localStorage for data persistence and has no backend dependencies.

## Technology Stack

| Technology | Purpose |
|------------|---------|
| Vue 3 | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool |
| Vitest | Testing |
| ESLint | Code Quality |

## Project Structure

```
tredgate-loan/
├── src/
│   ├── assets/          # Global styles
│   ├── components/      # Vue components
│   ├── services/        # Business logic
│   ├── types/           # TypeScript definitions
│   ├── App.vue          # Root component
│   └── main.ts          # Entry point
├── tests/               # Unit tests
├── public/              # Static assets
└── docs/                # Documentation
```

## Key Components

### LoanForm

Handles user input for creating new loan applications. Collects:
- Applicant name
- Loan amount
- Loan term (months)
- Interest rate

### LoanList

Displays all loan applications in a table format with actions for approval/rejection.

### LoanSummary

Shows aggregate statistics about the loan portfolio.

## Data Flow

1. User submits loan application via LoanForm
2. LoanService processes and stores the application
3. Data is persisted to localStorage
4. LoanList and LoanSummary components react to changes

## Business Rules

Loans are auto-decided based on:
- **Approved**: Amount ≤ $100,000 AND term ≤ 60 months
- **Rejected**: Otherwise

## Data Persistence

All loan data is stored in the browser's localStorage under the key `tredgate_loans`. This means:
- Data persists across page refreshes
- Data is browser-specific
- No server synchronization
