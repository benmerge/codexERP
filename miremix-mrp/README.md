# MiRemix MRP

Production planning and fulfillment app for the shared 40 Century Grain workflow. This app reads shared CRM orders from Firestore and marks them shipped back into the CRM dataset.

## Stack

- Vite + React + TypeScript
- Firebase Auth + Firestore
- Shared Firestore contract with `foodcrm-pro`

## Local Development

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill in the Firebase app config and CRM connection values
4. Run `npm run dev`

## Important Environment Variables

- `VITE_FIREBASE_*`: Firebase web app configuration for MiRemix
- `VITE_FIREBASE_DATABASE_ID`: Firestore database id for the MRP app
- `VITE_CRM_FIRESTORE_DATABASE_ID`: Firestore database id for the CRM app
- `VITE_CRM_SHARED_ORG_ID`: Shared Firestore org id used by both apps
- `VITE_CRM_ORDERS_COLLECTION`: CRM orders subcollection name, usually `orders`
- `VITE_CRM_APP_URL`: Platform home URL used for the back-link

## Production

- Build with `npm run build`
- Preview with `npm run preview`
- Deploy Firestore rules from [firestore.rules](./firestore.rules)
