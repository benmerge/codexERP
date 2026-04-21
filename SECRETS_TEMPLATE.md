# CI/CD Secrets Template

Add these secrets before enabling the deploy workflows.

## GitHub Actions: `deploy-foodcrm-pro.yml`

- `GCP_SA_KEY`
- `GCP_REGION`
- `GCP_PROJECT_ID`

## GitHub Actions: `deploy-miremix-mrp.yml`

- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_PROJECT_ID`

## App Runtime Secrets

### `foodcrm-pro`

- `RESEND_API_KEY`
- `ORDER_STATUS_FROM_EMAIL`
- `ORDER_STATUS_INTERNAL_EMAILS`
- `GEMINI_API_KEY`

### `miremix-mrp`

No server-side runtime secrets are required if it is deployed as static hosting, but its build environment still needs the `VITE_*` Firebase and CRM values from [.env.example](/Users/baimac/Documents/Playground/miremix-mrp/.env.example).
