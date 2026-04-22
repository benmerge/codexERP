# Platform Architecture

This repo is being rebuilt as one shared Firebase-backed operations platform.

## Core Idea

All tools read and write the same business data model in Firestore.

- `Firebase Auth` handles login
- `Firestore` stores org data, orders, inventory, recipes, locations, and logs
- `Cloud Run` handles server-side tasks like email, imports, and webhooks
- Each app is just a different user interface over the same shared data

## Apps

- `foodcrm-pro`
  - CRM and order entry
  - Customers, sales reps, notifications, and backend integrations
  - Writes the authoritative order records

- `miremix-mrp`
  - Production planning, inventory, recipes, and fulfillment
  - Reads shared CRM orders
  - Writes shipment status back to CRM

## Shared Platform Layer

The shared platform model lives in `platform/shared.ts`.

It defines:

- Shared workspace domains
- The shared org id
- The Ben-only location admin accounts
- Org resolution rules for users

## Data Model

The preferred shared collections are:

- `users/{uid}`
- `users/{orgId}/team`
- `users/{orgId}/customers`
- `users/{orgId}/orders`
- `users/{orgId}/products`
- `users/{orgId}/suppliers`
- `users/{orgId}/tasks`
- `locations`
- `inventory`
- `recipes`
- `logs`

## Permission Model

- Approved company users can use the apps
- Ben accounts can manage multiple locations
- Other users can still use the app, but they do not get location admin controls
- Firestore rules enforce the shared workspace and write restrictions

## Next Rebuild Steps

1. Move all email and role checks to shared helpers
2. Standardize location and org behavior across both apps
3. Introduce a single platform navigation/data shell for future tools
4. Keep Firestore as the system of record unless a new service is clearly needed
