# FoodCRM Pro

Production CRM for the shared 40 Century Grain workflow. This app owns the shared CRM dataset, customer and order management, shipment email notifications, and supporting server-side integrations.

## Stack

- Vite + React + TypeScript
- Firebase Auth + Firestore
- Express server for email, Gemini-powered voice note cleanup, and other backend endpoints

## Local Development

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill in the Firebase web config values and any optional server secrets
4. Run `npm run dev`

The dev server runs through `server.ts`, which serves the Vite app and the `/api/*` endpoints together.

## Important Environment Variables

- `VITE_FIREBASE_*`: Firebase web app configuration
- `VITE_FIREBASE_DATABASE_ID`: Firestore database id for the CRM app
- `VITE_SHARED_ORG_ID`: Shared Firestore org id used by all CRM users
- `RESEND_API_KEY`: Enables real email sending
- `ORDER_STATUS_FROM_EMAIL`: Sender identity for order status emails
- `ORDER_STATUS_INTERNAL_EMAILS`: Comma-separated internal recipients for shipment updates
- `GEMINI_API_KEY`: Enables voice note cleanup in the CRM

## Production

- Build the frontend with `npm run build`
- Run the production server with `npm run start`
- Deploy Firestore rules from [firestore.rules](./firestore.rules)
