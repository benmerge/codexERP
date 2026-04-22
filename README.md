# codexERP

Shared operations platform for 40 Century Grain.

## Apps

- [foodcrm-pro](./foodcrm-pro): platform home, CRM, customers, orders, notifications, and backend integrations
- [miremix-mrp](./miremix-mrp): production planning and fulfillment interface

## Deploy Docs

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [SECRETS_TEMPLATE.md](./SECRETS_TEMPLATE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)

## CI/CD

GitHub Actions workflows live in `.github/workflows`.

## Runtime Model

- `foodcrm-pro` deploys to Cloud Run
- `miremix-mrp` deploys to Firebase Hosting
