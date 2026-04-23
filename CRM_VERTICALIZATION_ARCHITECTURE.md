# CRM Verticalization Architecture

This document defines the intended CRM-core direction for Merge OS.

## Product Rule

Do not build separate CRMs by industry.

Build one CRM core and let each workspace activate the right vertical pack on top of that shared foundation.

## Core Stance

The CRM core should own:

- parent accounts
- buyer contacts
- linked locations
- account-to-location relationships
- orders and imports
- tasks
- passive timeline/events
- analytics and exports

Mapping stays inside CRM. It does not become a separate product.

## Vertical Packs

The current working model is:

- `core`
  - shared CRM records and generic sales workflows
- `food`
  - food-oriented labels, distributor/retail views, shipment context, inventory-adjacent analytics
- `fiber`
  - buyer-centered contacts, all-door visibility, seasonal selling views, rep territory filters

Packs should extend the core record model, not fork it.

## Canonical CRM-Core Records

The first shared CRM-core collections should be:

### `orgs/{orgId}/accounts/{accountId}`

Parent account is the canonical operating record for CRM.

Suggested fields:

- `displayName`
- `legalName`
- `accountType`
- `verticalPack`
- `ownerUserId`
- `pipelineStage`
- `status`
- `territoryId`
- `hasCurrentQuarterOrder`
- `lastOrderDate`

### `orgs/{orgId}/contacts/{contactId}`

Managed people linked to the parent account and optionally to a location.

Suggested fields:

- `accountId`
- `linkedLocationId`
- `name`
- `email`
- `phone`
- `contactType`
- `isPrimaryBuyer`
- `isActive`

### `orgs/{orgId}/locations/{locationId}`

Shared geographic sites used by CRM and later by other tools.

Suggested fields:

- `name`
- `locationType`
- `rawAddress`
- `normalizedAddress`
- `city`
- `state`
- `region`
- `latitude`
- `longitude`
- `geoProvider`
- `providerPlaceId`
- `showOnMap`
- `isBuyerOffice`
- `isDoor`

### `orgs/{orgId}/account_location_links/{linkId}`

Explicit relationship between an account and a location.

Suggested fields:

- `accountId`
- `locationId`
- `locationType`
- `isBuyerOffice`
- `isDoor`
- `showOnMap`
- `isPrimary`
- `travelPriority`

### `orgs/{orgId}/territories/{territoryId}`

Optional shared geography/rep filter layer.

Suggested fields:

- `label`
- `scope`
- `state`
- `city`
- `region`
- `customRule`

## Geo Service Boundary

Use Google Maps Platform for v1, but keep the provider behind a stable internal contract.

The long-term geo boundary should:

- geocode and normalize addresses
- return map-ready payloads
- preserve Merge-owned canonical location records
- keep provider-specific IDs as secondary attributes

That lets CRM use Google now while preserving a clean path to a shared geo service later for MiData, Marketplace, and EcoStack.

## Delivery Order

1. Canonical CRM-core records
2. Account/location relationship model
3. CRM map-ready list/split/map views
4. Geography and territory filters
5. Vertical-pack overlays
