# codexERP

Shared operations platform for 40 Century Grain.

## Apps

- [foodcrm-pro](./foodcrm-pro): platform home, CRM, customers, orders, notifications, and backend integrations
- [miremix-mrp](./miremix-mrp): production planning and fulfillment interface

## Deploy Docs

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [SECRETS_TEMPLATE.md](./SECRETS_TEMPLATE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PLATFORM_DATA_MODEL.md](./PLATFORM_DATA_MODEL.md)
- [CRM_VERTICALIZATION_ARCHITECTURE.md](./CRM_VERTICALIZATION_ARCHITECTURE.md)
- [DATA_COOP_ARCHITECTURE.md](./DATA_COOP_ARCHITECTURE.md)
- [ECOSTACK_ARCHITECTURE.md](./ECOSTACK_ARCHITECTURE.md)
- [DAACAUTH_MIGRATION_MAP.md](./DAACAUTH_MIGRATION_MAP.md)

## CI/CD

GitHub Actions workflows live in `.github/workflows`.

## Runtime Model

- `foodcrm-pro` deploys to Cloud Run
- `miremix-mrp` deploys to Firebase Hosting
