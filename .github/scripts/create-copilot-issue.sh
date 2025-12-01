#!/bin/bash
set -e

LOG_FILE="$1"
RUN_ID="$2"
COMMIT_SHA="$3"

REPO_OWNER=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f1)
REPO_NAME=$(echo "$GITHUB_REPOSITORY" | cut -d'/' -f2)

# Read logs
if [ -f "$LOG_FILE" ]; then
  LOGS=$(tail -100 "$LOG_FILE")
else
  LOGS="No logs available"
fi

# Build issue body with @copilot mention as the trigger
ISSUE_BODY=$(cat <<EOF
## 🔴 Self-Healing Required

@copilot Please analyze and fix this failing test. 

### Failure Details
| Detail | Value |
|--------|-------|
| **Workflow Run** | [View Run](https://github.com/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}) |
| **Commit** | \`${COMMIT_SHA}\` |
| **Branch** | \`${GITHUB_REF_NAME}\` |

### Error Logs
\`\`\`
${LOGS}
\`\`\`

### Instructions for Copilot
1.  Analyze the error logs above
2. Identify the root cause of the failure
3.  Fix the failing test or the code it tests
4. Create a pull request with the fix
5.  Ensure all tests pass
EOF
)

ISSUE_TITLE="🤖 Self-Healing: Test failure on ${GITHUB_REF_NAME}"

echo "Creating new self-healing issue..."

# Create the issue WITHOUT labels (to avoid failure if labels don't exist)
# and WITHOUT assignee (use @copilot mention instead)
ISSUE_URL=$(gh issue create \
  --title "$ISSUE_TITLE" \
  --body "$ISSUE_BODY")

echo "Issue created: $ISSUE_URL"
echo "Copilot should pick up the issue via the @copilot mention in the body."
