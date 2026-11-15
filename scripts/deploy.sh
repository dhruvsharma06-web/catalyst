#!/usr/bin/env bash
# Provisions the Google Cloud resources for Hearth and deploys the Cloud Run service.
# Idempotent: every step checks for existing resources before creating anything.
#
# Usage:
#   PROJECT_ID=my-project [REGION=asia-south1] ./scripts/deploy.sh
#   ./scripts/deploy.sh my-project [asia-south1]
#
# Optional SMTP: set SMTP_HOST, SMTP_USER and SMTP_PASS (MAIL_FROM is optional).
# SMTP_PASS is stored in Secret Manager and never written to the Cloud Run config.
set -euo pipefail

PROJECT_ID="${1:-${PROJECT_ID:-}}"
REGION="${2:-${REGION:-asia-south1}}"
SERVICE="hearth"
SESSION_SECRET_NAME="hearth-session-secret"
JOB_TOKEN_SECRET_NAME="hearth-job-token"
SMTP_SECRET_NAME="hearth-smtp-pass"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

[ -n "$PROJECT_ID" ] || die "PROJECT_ID is required (set the environment variable or pass it as the first argument)."
command -v gcloud >/dev/null 2>&1 || die "gcloud CLI not found on PATH."
command -v openssl >/dev/null 2>&1 || die "openssl not found on PATH."

# `--source .` must be run from the repository root.
cd "$REPO_ROOT"
info "Project: $PROJECT_ID"
info "Region:  $REGION"

log "Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project "$PROJECT_ID"

log "Checking Firestore database"
if gcloud firestore databases describe --database='(default)' --project "$PROJECT_ID" >/dev/null 2>&1; then
  info "Firestore database (default) already exists"
else
  info "Creating Firestore native database in $REGION"
  gcloud firestore databases create \
    --database='(default)' \
    --location="$REGION" \
    --type=firestore-native \
    --project "$PROJECT_ID"
fi

# ensure_secret NAME: create the secret if missing. Returns 0 if it was created.
ensure_secret() {
  local name="$1"
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    info "Secret $name already exists"
    return 1
  fi
  info "Creating secret $name"
  gcloud secrets create "$name" --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
  return 0
}

log "Ensuring application secrets"
# Generated values are piped directly to gcloud and never printed.
if ensure_secret "$SESSION_SECRET_NAME"; then
  openssl rand -hex 32 | tr -d '\n' \
    | gcloud secrets versions add "$SESSION_SECRET_NAME" --data-file=- --project "$PROJECT_ID" >/dev/null
fi
if ensure_secret "$JOB_TOKEN_SECRET_NAME"; then
  openssl rand -hex 32 | tr -d '\n' \
    | gcloud secrets versions add "$JOB_TOKEN_SECRET_NAME" --data-file=- --project "$PROJECT_ID" >/dev/null
fi

SMTP_ENABLED=false
if [ -n "${SMTP_HOST:-}" ] && [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
  SMTP_ENABLED=true
elif [ -n "${SMTP_HOST:-}${SMTP_USER:-}${SMTP_PASS:-}" ]; then
  info "SMTP skipped: set SMTP_HOST, SMTP_USER and SMTP_PASS together"
fi

if [ "$SMTP_ENABLED" = true ]; then
  ensure_secret "$SMTP_SECRET_NAME" || true
  # Always write the password supplied in the environment so the secret matches it.
  printf '%s' "$SMTP_PASS" \
    | gcloud secrets versions add "$SMTP_SECRET_NAME" --data-file=- --project "$PROJECT_ID" >/dev/null
  info "SMTP password stored in secret $SMTP_SECRET_NAME"
fi

log "Granting roles to the Cloud Run runtime service account"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in roles/datastore.user roles/aiplatform.user roles/secretmanager.secretAccessor roles/run.builder roles/logging.logWriter; do
  # add-iam-policy-binding is a no-op when the binding already exists.
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
  info "$role granted to $RUNTIME_SA"
done

log "Deploying Cloud Run service $SERVICE from source"
ENV_VARS="NODE_ENV=production,STORE=firestore,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_LOCATION=global,GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
SECRET_VARS="SESSION_SECRET=${SESSION_SECRET_NAME}:latest,JOB_TOKEN=${JOB_TOKEN_SECRET_NAME}:latest"
if [ "$SMTP_ENABLED" = true ]; then
  ENV_VARS+=",SMTP_HOST=${SMTP_HOST},SMTP_USER=${SMTP_USER}"
  # MAIL_FROM must not contain commas, because gcloud splits --set-env-vars on commas.
  if [ -n "${MAIL_FROM:-}" ]; then
    ENV_VARS+=",MAIL_FROM=${MAIL_FROM}"
  fi
  SECRET_VARS+=",SMTP_PASS=${SMTP_SECRET_NAME}:latest"
fi

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=80 \
  --set-env-vars="$ENV_VARS" \
  --set-secrets="$SECRET_VARS" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
[ -n "$SERVICE_URL" ] || die "Could not determine the service URL for $SERVICE."

log "Setting APP_URL to $SERVICE_URL"
# Applied as a separate update because the URL is only known after the first deploy.
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --update-env-vars="APP_URL=${SERVICE_URL}" \
  --quiet >/dev/null

log "Configuring Cloud Scheduler reminder job"
PROJECT_ID="$PROJECT_ID" REGION="$REGION" SERVICE_URL="$SERVICE_URL" \
  "$SCRIPT_DIR/setup-scheduler.sh"

log "Done"
info "Service URL: $SERVICE_URL"
