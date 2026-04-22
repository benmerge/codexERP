# Deployment Guide

This repo contains two production apps with different deployment targets:

- `foodcrm-pro`: platform home + CRM frontend + Express backend, deployed to Cloud Run
- `miremix-mrp`: React SPA deployed to Firebase Hosting

Current production URLs:

- Platform home / CRM: `https://foodcrm-pro-1015963821956.us-west1.run.app/`
- ReMix: `https://gen-lang-client-0021754998.web.app/`

## 1. Shared Prerequisites

- Node `20+`
- Firebase CLI installed locally when publishing Firestore rules or Hosting
- Google Cloud project access for Cloud Run deploys
- Firestore rules publish access for both app databases

## 2. Firestore Rules

Publish rules after any change to access control:

### FoodCRM Pro

Use [foodcrm-pro/firestore.rules](/Users/baimac/Documents/Playground/foodcrm-pro/firestore.rules) against database `ai-studio-af887f16-decc-48d2-b6b7-47c85e2eed76`.

### MiRemix MRP

Use [miremix-mrp/firestore.rules](/Users/baimac/Documents/Playground/miremix-mrp/firestore.rules) against database `ai-studio-eb8d88f4-51e8-4643-b410-dd1062becfc3`.

## 3. Deploy FoodCRM Pro

Recommended target: Cloud Run

### Required env vars

Set the values from [foodcrm-pro/.env.example](/Users/baimac/Documents/Playground/foodcrm-pro/.env.example).
Include the `VITE_MIREMIX_APP_URL` so the platform launcher can send users into ReMix.
The current production ReMix URL is `https://gen-lang-client-0021754998.web.app/`.

### Local build and run

```bash
cd foodcrm-pro
npm ci
npm run build
npm run start
```

### Cloud Run deploy

```bash
cd foodcrm-pro
gcloud run deploy foodcrm-pro \
  --source . \
  --region YOUR_REGION \
  --project YOUR_PROJECT_ID \
  --allow-unauthenticated
```

## 4. Deploy MiRemix MRP

Recommended target: Firebase Hosting

### Required env vars

Set the values from [miremix-mrp/.env.example](/Users/baimac/Documents/Playground/miremix-mrp/.env.example).
The current production platform-home URL is `https://foodcrm-pro-1015963821956.us-west1.run.app/`.

### Local build

```bash
cd miremix-mrp
npm ci
npm run build
```

### Firebase Hosting deploy

```bash
cd miremix-mrp
firebase deploy --only hosting
```

## 5. Launch Smoke Test

1. Open `foodcrm-pro`
2. Click `Reset Test Org`
3. Create a new order in CRM
4. Open `miremix-mrp`
5. Confirm the order appears in the pending queue
6. Mark the order shipped
7. Confirm CRM updates to `Shipped`
8. Confirm customer/internal shipment email is sent
