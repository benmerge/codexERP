# Platform Data Model

This document defines the shared data model for the Merge platform.
The goal is to treat CRM, ReMix, Customer Portal, MiData, EcoStack, and future tools as interfaces over one operational system.

## Principles

- Firestore is the system of record for shared business data.
- Tools should read and write shared records instead of creating app-specific parallel data models.
- User permissions should be role-based, not hardcoded per screen.
- Locations, orgs, and users are platform concepts, not tool-local concepts.
- Every major record should be auditable.

## Core Collections

### `orgs/{orgId}`

One document per workspace or operating entity.

Suggested fields:

- `id`
- `name`
- `slug`
- `status`
- `primaryDomain`
- `settings`
- `createdAt`
- `updatedAt`

Use for:

- shared workspace identity
- branding
- tool availability
- default policies

### `orgs/{orgId}/members/{userId}`

Membership records for people who can access the workspace.

Suggested fields:

- `userId`
- `email`
- `displayName`
- `roles`
- `defaultLocationId`
- `isActive`
- `createdAt`
- `updatedAt`

Recommended roles:

- `platform_admin`
- `tool_admin`
- `sales`
- `operations`
- `location_admin`
- `viewer`

### `orgs/{orgId}/locations/{locationId}`

Shared operational sites, warehouses, mills, facilities, or reporting locations.

Suggested fields:

- `id`
- `name`
- `code`
- `type`
- `isActive`
- `address`
- `timeZone`
- `createdAt`
- `updatedAt`
- `deactivatedAt`

Use for:

- ReMix inventory
- production
- order fulfillment
- reporting

### `orgs/{orgId}/customers/{customerId}`

Canonical customer or account record used by CRM and future tools.

Suggested fields:

- `id`
- `name`
- `company`
- `email`
- `phone`
- `category`
- `pipelineStage`
- `ownerUserId`
- `status`
- `tags`
- `notes`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/orders/{orderId}`

Canonical order record shared between CRM and operations.

Suggested fields:

- `id`
- `orderNumber`
- `customerId`
- `locationId`
- `status`
- `source`
- `lineItems`
- `currency`
- `amount`
- `requestedShipDate`
- `fulfilledDate`
- `createdAt`
- `updatedAt`

Use for:

- CRM order entry
- ReMix fulfillment
- portal order visibility
- reporting and exports

### `orgs/{orgId}/products/{productId}`

Shared sellable or manufacturable catalog item.

Suggested fields:

- `id`
- `name`
- `sku`
- `category`
- `unit`
- `status`
- `price`
- `supplierId`
- `attributes`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/inventory/{inventoryItemId}`

Location-aware stock record.

Suggested fields:

- `id`
- `productId`
- `locationId`
- `quantityOnHand`
- `quantityReserved`
- `quantityAvailable`
- `unit`
- `lastCountedAt`
- `updatedAt`

### `orgs/{orgId}/recipes/{recipeId}`

Production or formula record used by ReMix and future manufacturing/reporting tools.

Suggested fields:

- `id`
- `name`
- `finishedGoodId`
- `locationId`
- `ingredients`
- `yield`
- `status`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/tasks/{taskId}`

Shared work item record.

Suggested fields:

- `id`
- `title`
- `description`
- `type`
- `status`
- `assigneeUserId`
- `relatedRecordType`
- `relatedRecordId`
- `dueDate`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/submissions/{submissionId}`

Customer Portal intake for issue reporting, data entry, requests, and uploaded forms.

Suggested fields:

- `id`
- `type`
- `status`
- `submittedBy`
- `locationId`
- `payload`
- `attachments`
- `createdAt`
- `updatedAt`

### `orgs/{orgId}/events/{eventId}`

Audit/event log for major changes across tools.

Suggested fields:

- `id`
- `actorUserId`
- `tool`
- `action`
- `recordType`
- `recordId`
- `locationId`
- `metadata`
- `createdAt`

Use for:

- audit history
- debugging
- analytics
- downstream reporting

## Tool Registry

### `platform_tools/{toolId}`

Global launcher metadata for platform home.

Suggested fields:

- `id`
- `title`
- `description`
- `href`
- `status`
- `note`
- `accent`
- `enabled`
- `sortOrder`
- `rolesAllowed`

## Recommended Relationship Model

- `orgs` own all core business records.
- `members` define who can access an org.
- `locations` scope operational activity.
- `orders` connect customers, products, and fulfillment.
- `inventory` and `recipes` drive operations.
- `submissions` bring in external data from portals.
- `events` provide a shared audit trail.

## Migration Direction

### Current CRM shape

Current CRM data is primarily stored under:

- `users/{orgId}/customers`
- `users/{orgId}/orders`
- `users/{orgId}/products`
- `users/{orgId}/suppliers`
- `users/{orgId}/tasks`
- `users/{orgId}/team`

### Current ReMix shape

Current ReMix data is primarily stored in top-level collections:

- `locations`
- `inventory`
- `recipes`
- `logs`
- `settings`

### Target platform shape

Move over time toward:

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

## Recommended Build Sequence

1. Make `orgs`, `members`, and `locations` canonical.
2. Normalize `orders` as the first cross-tool operational record.
3. Normalize `inventory` and `recipes` under `orgs/{orgId}`.
4. Add `events` for auditability.
5. Build Customer Portal and MiData on top of the shared model instead of creating separate schemas.
