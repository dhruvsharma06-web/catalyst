#!/usr/bin/env bash
# Creates or updates the Cloud Scheduler job that triggers Hearth reminder emails.
# The job POSTs to $SERVICE_URL/api/v1/jobs/reminders every 5 minutes (UTC),
# authenticated with the X-Job-Token header taken from Secret Manager.
#
# Usage:
#   PROJECT_ID=my-project [REGION=asia-south1] [SERVICE_URL=https://...] ./scripts/setup-scheduler.sh
#
# If SERVICE_URL is not set, it is looked up from the Cloud Run service "hearth".
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required}"
REGION="${REGION:-asia-south1}"
JOB_NAME="hearth-reminders"
JOB_TOKEN_SECRET_NAME="hearth-job-token"
SCHEDULE="*/5 * * * *"
TIME_ZONE="Etc/UTC"
ATTEMPT_DEADLINE="120s"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || die "gcloud CLI not found on PATH."

if [ -z "${SERVICE_URL:-}" ]; then
  SERVICE_URL="$(gcloud run services describe hearth \
    --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi
[ -n "$SERVICE_URL" ] || die "SERVICE_URL is empty; deploy the service first."
TARGET_URL="${SERVICE_URL%/}/api/v1/jobs/reminders"

# Read the token at run time so it is never stored in this repository.
JOB_TOKEN="$(gcloud secrets versions access latest \
  --secret="$JOB_TOKEN_SECRET_NAME" --project "$PROJECT_ID")"
[ -n "$JOB_TOKEN" ] || die "Secret $JOB_TOKEN_SECRET_NAME is empty."

# Flags shared by create and update.
common_flags=(
  --location="$REGION"
  --project="$PROJECT_ID"
  --schedule="$SCHEDULE"
  --time-zone="$TIME_ZONE"
  --uri="$TARGET_URL"
  --http-method=POST
  --attempt-deadline="$ATTEMPT_DEADLINE"
)

printf '==> Creating or updating Cloud Scheduler job %s (%s)\n' "$JOB_NAME" "$SCHEDULE"
# Create first; if the job already exists, update it instead.
gcloud scheduler jobs create http "$JOB_NAME" "${common_flags[@]}" \
    --headers="X-Job-Token=${JOB_TOKEN}" \
  || gcloud scheduler jobs update http "$JOB_NAME" "${common_flags[@]}" \
    --update-headers="X-Job-Token=${JOB_TOKEN}"

printf '    Job %s targets %s\n' "$JOB_NAME" "$TARGET_URL"
