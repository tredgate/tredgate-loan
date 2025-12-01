# Testing Documentation

This document provides comprehensive information about testing in the Tredgate Loan application.

## Overview

The application uses **Jest** as the testing framework with full support for TypeScript and Vue 3 components. Tests are comprehensive, covering both business logic and user interface components.

## Test Coverage

### Business Logic Tests (`loanService.test.ts`)

Tests all functions in the loan service:

- **getLoans**: Loading loans from localStorage
- **saveLoans**: Persisting loans to localStorage
- **createLoanApplication**: Creating new loan applications with validation
- **updateLoanStatus**: Changing loan status (pending/approved/rejected)
- **calculateMonthlyPayment**: Computing monthly payment amounts
- **autoDecideLoan**: Automatic loan decision based on business rules

### Component Tests

#### LoanForm Component (`LoanForm.test.ts`)

- Form rendering and input fields
- Field validation (name, amount, term, interest rate)
- Error message display
- Form submission and event emission
- Form reset after successful submission
- Error handling for service exceptions

#### LoanList Component (`LoanList.test.ts`)

- Empty state display
- Table rendering with loan data
- Currency and percentage formatting
- Date formatting
- Status badges (pending/approved/rejected)
- Action buttons for pending loans
- Event emission for approve/reject/auto-decide actions

#### LoanSummary Component (`LoanSummary.test.ts`)

- Statistics calculation (total, pending, approved, rejected)
- Total approved amount calculation
- Currency formatting
- Reactive updates when loan data changes
- Edge cases (empty list, single loan, all same status)

#### App Component (`App.test.ts`)

- Component integration
- Initial data loading on mount
- Event handling between parent and child components
- Data refresh after mutations
- Props passing to child components

## Running Tests

### Run All Tests

```bash
npm test
```

This executes all test suites and generates:
- Console output with test results
- Coverage report in `coverage/` directory
- HTML test report in `test-report/` directory

### Run Tests in Watch Mode

```bash
npm run test:watch
```

Runs tests in interactive watch mode. Tests automatically re-run when files change.

### Run Tests with Coverage

```bash
npm run test:coverage
```

Generates detailed code coverage reports showing:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

## Test Reports

### HTML Test Report

After running tests, open `test-report/index.html` in a browser to view:
- Test suite results
- Individual test status
- Execution time
- Failure messages and stack traces

### Coverage Report

Open `coverage/index.html` in a browser to view:
- Overall coverage percentages
- File-by-file coverage details
- Uncovered lines highlighted
- Branch coverage visualization

## Test Structure

### Test Files Location

All test files are in the `tests/` directory with `.test.ts` extension:

```
tests/
├── loanService.test.ts    # Business logic tests
├── LoanForm.test.ts       # LoanForm component tests
├── LoanList.test.ts       # LoanList component tests
├── LoanSummary.test.ts    # LoanSummary component tests
└── App.test.ts            # App component tests
```

### Test Organization

Each test file follows this structure:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals'

describe('Component/Service Name', () => {
  beforeEach(() => {
    // Setup before each test
  })

  describe('Feature/Function Name', () => {
    it('should do something specific', () => {
      // Test implementation
    })
  })
})
```

## Adding New Tests

### 1. Create Test File

Create a new file in `tests/` directory with `.test.ts` extension:

```typescript
import { describe, it, expect } from '@jest/globals'

describe('YourFeature', () => {
  it('should work correctly', () => {
    // Your test
  })
})
```

### 2. Test Vue Components

For Vue components, use `@vue/test-utils`:

```typescript
import { mount } from '@vue/test-utils'
import YourComponent from '../src/components/YourComponent.vue'

describe('YourComponent.vue', () => {
  it('renders props correctly', () => {
    const wrapper = mount(YourComponent, {
      props: {
        message: 'Hello'
      }
    })
    
    expect(wrapper.text()).toContain('Hello')
  })
})
```

### 3. Mock Dependencies

Use Jest mocks to isolate tests:

```typescript
import { jest } from '@jest/globals'
import * as service from '../src/services/yourService'

jest.mock('../src/services/yourService', () => ({
  someFunction: jest.fn()
}))

describe('With Mocks', () => {
  it('calls mocked function', () => {
    const mockFn = service.someFunction as jest.MockedFunction<typeof service.someFunction>
    mockFn.mockReturnValue('mocked value')
    
    // Your test
  })
})
```

### 4. Test Async Operations

Use `async/await` for asynchronous tests:

```typescript
it('handles async operations', async () => {
  const wrapper = mount(Component)
  await wrapper.find('button').trigger('click')
  await wrapper.vm.$nextTick()
  
  expect(wrapper.find('.result').text()).toBe('Updated')
})
```

## Best Practices

### Keep It Simple (KISS)

- One assertion per test when possible
- Clear, descriptive test names
- Minimal setup and teardown
- Focus on behavior, not implementation

### Test Independence

- Each test should run independently
- Use `beforeEach` to reset state
- Don't rely on test execution order
- Clean up after tests with `afterEach`

### Good Test Names

Use descriptive names that explain what's being tested:

```typescript
// ✅ Good
it('displays error when applicant name is empty', () => {})

// ❌ Bad
it('test1', () => {})
```

### Mock External Dependencies

- Mock localStorage, APIs, and external services
- Isolate the code under test
- Make tests fast and reliable
- Avoid side effects

### Test Edge Cases

Don't just test the happy path:

- Empty inputs
- Null/undefined values
- Boundary conditions (0, negative numbers)
- Maximum values
- Error conditions

## Configuration Files

### jest.config.cjs

Main Jest configuration:
- Test environment (jsdom for Vue)
- File transformations (TypeScript, Vue)
- Coverage collection
- HTML reporter settings
- Module name mappings

### tsconfig.jest.json

TypeScript configuration for tests:
- Compiler options for Jest
- Module resolution
- Type definitions

### babel.config.cjs

Babel configuration for transpiling:
- ES6+ syntax support
- CommonJS module output

## Continuous Integration

Tests run automatically on:
- Pull requests to main branch
- Via GitHub Actions workflow

See `.github/workflows/test.yml` for CI configuration.

## Troubleshooting

### Tests Not Running

1. Ensure dependencies are installed:
   ```bash
   npm install
   ```

2. Check Node.js version (requires Node 18+)

### Import Errors

If you see module resolution errors:
- Check import paths are correct
- Verify `tsconfig.jest.json` includes test files
- Ensure Vue component imports have `.vue` extension

### Mock Not Working

If mocks aren't being applied:
- Call `jest.mock()` before importing the module
- Use `jest.clearAllMocks()` in `beforeEach`
- Check mock function types with TypeScript

### Coverage Too Low

To increase coverage:
- Add tests for uncovered lines (shown in red in HTML report)
- Test error branches and edge cases
- Remove unnecessary code

## Support

For issues or questions about testing:
1. Check this documentation
2. Review existing test files for examples
3. Consult [Jest documentation](https://jestjs.io/)
4. Consult [Vue Test Utils documentation](https://test-utils.vuejs.org/)
