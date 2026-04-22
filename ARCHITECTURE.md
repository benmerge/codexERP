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

The platform is moving toward a canonical org-first model documented in [PLATFORM_DATA_MODEL.md](./PLATFORM_DATA_MODEL.md).

Current transitional collections still include:

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

Target canonical collections are:

- `orgs/{orgId}`
- `orgs/{orgId}/members`
- `orgs/{orgId}/locations`
- `orgs/{orgId}/customers`
- `orgs/{orgId}/orders`
- `orgs/{orgId}/products`
- `orgs/{orgId}/inventory`
- `orgs/{orgId}/recipes`
- `orgs/{orgId}/tasks`
- `orgs/{orgId}/submissions`
- `orgs/{orgId}/events`

## Permission Model

- Approved company users can use the apps
- Ben accounts can manage multiple locations
- Other users can still use the app, but they do not get location admin controls
- Firestore rules enforce the shared workspace and write restrictions

## Next Rebuild Steps

1. Make `orgs`, `members`, and `locations` canonical
2. Normalize `orders` as the first true cross-tool record
3. Normalize `inventory` and `recipes` under the org-first model
4. Add shared audit/event records for reporting and automation
