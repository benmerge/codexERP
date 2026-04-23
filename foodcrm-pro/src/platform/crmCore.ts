import type {
  AccountType,
  ContactType,
  CrmAccount,
  CrmAccountLocationLink,
  CrmContact,
  CrmLocation,
  CrmTerritory,
  Customer,
  CustomerCategory,
  LocationType,
  PipelineStage,
} from '../types';

// ---------------------------------------------------------------------------
// Territory label normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a territory label to consistent title-case with trimmed whitespace.
 * Prevents duplicates like "dallas, tx" vs "Dallas, TX" from creating separate
 * territory records.
 */
export const normalizeTerritoryLabel = (raw: string): string =>
  raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(
      /\w\S*/g,
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );

export type CrmImportRow = {
  accountName: string;
  legalName?: string;
  accountType?: AccountType;
  territoryLabel?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  locationName?: string;
  locationType?: LocationType;
  role?: 'buyer-office' | 'door' | 'both';
  rawAddress?: string;
  city?: string;
  state?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
};

export type NormalizedCrmImportRecord = {
  rowIndex: number;
  account: CrmAccount;
  contact: CrmContact | null;
  location: CrmLocation;
  link: CrmAccountLocationLink;
  territory: CrmTerritory;
};

export const CRM_CORE_COLLECTIONS = {
  accounts: 'accounts',
  contacts: 'contacts',
  locations: 'locations',
  accountLocationLinks: 'account_location_links',
  territories: 'territories',
} as const;

export const DEFAULT_VERTICAL_PACK = 'core' as const;

export const defaultLocationVisibility = {
  showOnMap: true,
  isBuyerOffice: false,
  isDoor: true,
} as const;

const CATEGORY_TO_ACCOUNT_TYPE: Record<CustomerCategory, AccountType> = {
  Retail: 'retailer',
  Wholesale: 'distributor',
  Distributor: 'distributor',
  Partner: 'broker',
  Government: 'institution',
  'Non-Profit': 'institution',
  Agriculture: 'other',
  Science: 'other',
  Maintenance: 'other',
};

export const inferAccountTypeFromCategory = (category?: CustomerCategory): AccountType =>
  (category && CATEGORY_TO_ACCOUNT_TYPE[category]) || 'other';

export const inferAccountStatus = (customer: Customer): CrmAccount['status'] =>
  customer.isProspect ? 'prospect' : 'active';

export const normalizeAccountDisplayName = (customer: Customer) =>
  customer.company?.trim() || customer.name.trim();

export const buildCanonicalAccountFromCustomer = (customer: Customer, orgId: string): CrmAccount => ({
  id: customer.id,
  orgId,
  displayName: normalizeAccountDisplayName(customer),
  legalName: customer.company?.trim() || undefined,
  accountType: inferAccountTypeFromCategory(customer.category),
  verticalPack: DEFAULT_VERTICAL_PACK,
  ownerUserId: customer.salesRepId || undefined,
  ownerEmail: customer.salesRepEmail || undefined,
  pipelineStage: customer.pipelineStage as PipelineStage,
  customerCategory: customer.category,
  status: inferAccountStatus(customer),
  tags: customer.company ? ['parent-account'] : ['direct-contact-account'],
  createdAt: customer.lastContact || undefined,
  updatedAt: customer.lastContact || undefined,
  sourceApp: 'foodcrm-pro',
});

export const buildPrimaryContactFromCustomer = (customer: Customer, orgId: string): CrmContact => ({
  id: `${customer.id}-primary`,
  orgId,
  accountId: customer.id,
  name: customer.name.trim(),
  email: customer.email || undefined,
  phone: customer.phone || undefined,
  contactType: 'buyer' as ContactType,
  isPrimaryBuyer: true,
  isActive: true,
  createdAt: customer.lastContact || undefined,
  updatedAt: customer.lastContact || undefined,
  sourceApp: 'foodcrm-pro',
});

export const buildStubLocationForAccount = (accountId: string, orgId: string, name: string): CrmLocation => ({
  id: `${accountId}-hq`,
  orgId,
  name: `${name} Primary Location`,
  locationType: 'hq' as LocationType,
  showOnMap: defaultLocationVisibility.showOnMap,
  isBuyerOffice: true,
  isDoor: false,
  sourceApp: 'foodcrm-pro',
});

export const buildPrimaryAccountLocationLink = (
  accountId: string,
  locationId: string,
  orgId: string,
  locationType: LocationType = 'hq'
): CrmAccountLocationLink => ({
  id: `${accountId}-${locationId}`,
  orgId,
  accountId,
  locationId,
  locationType,
  isBuyerOffice: locationType === 'buyer-office' || locationType === 'hq',
  isDoor: locationType === 'store-door',
  showOnMap: true,
  isPrimary: true,
  sourceApp: 'foodcrm-pro',
});

export const buildTerritoryLabel = ({
  city,
  state,
  region,
}: Pick<CrmLocation, 'city' | 'state' | 'region'>) => {
  const raw = region
    ? region
    : city && state
      ? `${city}, ${state}`
      : state || city || 'Unassigned territory';
  return normalizeTerritoryLabel(raw);
};

export const buildTerritoryFromLocation = (
  location: Pick<CrmLocation, 'id' | 'orgId' | 'city' | 'state' | 'region'>,
): CrmTerritory => ({
  id: `${location.id}-territory`,
  orgId: location.orgId,
  label: buildTerritoryLabel(location),
  scope: location.region ? 'region' : location.city ? 'city' : 'state',
  state: location.state,
  city: location.city,
  region: location.region,
  sourceApp: 'foodcrm-pro',
});

export const slugifyCrmId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'record';

const parseImportNumber = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const coerceLocationType = (value?: string): LocationType => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'buyer-office' || normalized === 'buyer office') return 'buyer-office';
  if (normalized === 'store-door' || normalized === 'door' || normalized === 'store door') return 'store-door';
  if (normalized === 'warehouse') return 'warehouse';
  if (normalized === 'hq' || normalized === 'headquarters') return 'hq';
  return 'other';
};

const coerceImportRole = (value?: string): 'buyer-office' | 'door' | 'both' => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'buyer-office' || normalized === 'buyer office') return 'buyer-office';
  if (normalized === 'both') return 'both';
  return 'door';
};

/**
 * Declarative column-alias map.
 * Each canonical CRM field name maps to an array of accepted header variations.
 * All matching is case-insensitive; the resolver also strips non-alphanumeric
 * characters so "Account Name", "account_name", and "accountName" all resolve.
 */
export const COLUMN_ALIAS_MAP: Record<string, string[]> = {
  accountName: [
    'account_name', 'account', 'accountname', 'parent_account', 'parent account',
    'company', 'company_name', 'companyname', 'customer', 'customer_name',
    'customername', 'acct', 'acct_name',
  ],
  legalName: ['legal_name', 'legalname', 'legal name', 'dba', 'doing_business_as'],
  accountType: [
    'account_type', 'accounttype', 'type', 'acct_type', 'customer_type',
    'customertype', 'category',
  ],
  territoryLabel: [
    'territory', 'territory_label', 'territorylabel', 'territory_name',
    'sales_territory', 'salesterritory', 'zone',
  ],
  contactName: [
    'contact_name', 'contactname', 'contact', 'buyer_name', 'buyername',
    'buyer', 'primary_contact', 'rep_name',
  ],
  contactEmail: [
    'contact_email', 'contactemail', 'email', 'buyer_email', 'buyeremail',
    'email_address', 'emailaddress',
  ],
  contactPhone: [
    'contact_phone', 'contactphone', 'phone', 'phone_number', 'phonenumber',
    'buyer_phone', 'tel', 'telephone',
  ],
  locationName: [
    'location_name', 'locationname', 'location', 'door_name', 'doorname',
    'office_name', 'officename', 'site', 'site_name', 'sitename',
    'store_name', 'storename', 'branch', 'branch_name',
  ],
  locationType: [
    'location_type', 'locationtype', 'loc_type', 'site_type', 'sitetype',
  ],
  role: ['role', 'location_role', 'locationrole', 'loc_role'],
  rawAddress: [
    'raw_address', 'rawaddress', 'address', 'street_address', 'streetaddress',
    'street', 'addr', 'full_address',
  ],
  city: ['city', 'town', 'municipality'],
  state: ['state', 'province', 'st', 'state_code', 'statecode'],
  region: ['region', 'area', 'district', 'territory_region'],
  latitude: ['latitude', 'lat', 'y'],
  longitude: ['longitude', 'lng', 'lon', 'long', 'x'],
} as const;

/** Normalize a header string for alias comparison. */
const normalizeHeader = (header: string) =>
  header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

/** Resolve a raw header string to a canonical CRM field name, or null if unrecognized. */
export const resolveColumnAlias = (rawHeader: string): string | null => {
  const normalized = normalizeHeader(rawHeader);
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIAS_MAP)) {
    if (normalizeHeader(canonical) === normalized) return canonical;
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return canonical;
  }
  return null;
};

export type ImportHeaderAnalysis = {
  /** Map from original header → canonical field name (null = unrecognized). */
  mapping: Record<string, string | null>;
  /** Headers that resolved to a known CRM field. */
  recognized: string[];
  /** Headers that did not resolve to any known CRM field. */
  unrecognized: string[];
};

/** Analyze the first line of a pasted import to show which columns were recognized. */
export const analyzeImportHeaders = (rawText: string): ImportHeaderAnalysis => {
  const trimmed = rawText.trim();
  if (!trimmed) return { mapping: {}, recognized: [], unrecognized: [] };

  const firstLine = trimmed.split(/\r?\n/)[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes('|') ? '|' : ',';
  const rawHeaders = firstLine.split(delimiter).map((header) => header.trim());

  const mapping: Record<string, string | null> = {};
  const recognized: string[] = [];
  const unrecognized: string[] = [];

  for (const rawHeader of rawHeaders) {
    if (!rawHeader) continue;
    const resolved = resolveColumnAlias(rawHeader);
    mapping[rawHeader] = resolved;
    if (resolved) {
      recognized.push(rawHeader);
    } else {
      unrecognized.push(rawHeader);
    }
  }

  return { mapping, recognized, unrecognized };
};

export type ImportConflictEntry = {
  type: 'duplicate-account' | 'duplicate-location' | 'missing-account-name' | 'territory-mismatch';
  severity: 'error' | 'warning';
  rowIndices: number[];
  message: string;
};

export type ImportConflictReport = {
  conflicts: ImportConflictEntry[];
  hasErrors: boolean;
  hasWarnings: boolean;
  duplicateAccountCount: number;
  duplicateLocationCount: number;
};

/** Detect duplicates and conflicts in normalized import data before committing. */
export const detectImportConflicts = (rows: NormalizedCrmImportRecord[]): ImportConflictReport => {
  const conflicts: ImportConflictEntry[] = [];

  // --- Missing account name (rows that parsed with empty displayName) ---
  rows.forEach((row) => {
    if (!row.account.displayName.trim()) {
      conflicts.push({
        type: 'missing-account-name',
        severity: 'error',
        rowIndices: [row.rowIndex],
        message: `Row ${row.rowIndex + 1} has no account name and will be skipped.`,
      });
    }
  });

  // --- Duplicate accounts (same generated ID appears on multiple rows) ---
  const accountIdToRows = new Map<string, number[]>();
  for (const row of rows) {
    const existing = accountIdToRows.get(row.account.id) || [];
    existing.push(row.rowIndex);
    accountIdToRows.set(row.account.id, existing);
  }

  let duplicateAccountCount = 0;
  for (const [accountId, rowIndices] of accountIdToRows) {
    if (rowIndices.length > 1) {
      duplicateAccountCount++;
      const displayName = rows[rowIndices[0]].account.displayName;
      conflicts.push({
        type: 'duplicate-account',
        severity: 'warning',
        rowIndices,
        message: `"${displayName}" appears on ${rowIndices.length} rows (rows ${rowIndices.map((i) => i + 1).join(', ')}). They will merge into a single account (${accountId}).`,
      });
    }
  }

  // --- Duplicate locations (same generated location ID on multiple rows) ---
  const locationIdToRows = new Map<string, number[]>();
  for (const row of rows) {
    const existing = locationIdToRows.get(row.location.id) || [];
    existing.push(row.rowIndex);
    locationIdToRows.set(row.location.id, existing);
  }

  let duplicateLocationCount = 0;
  for (const [locationId, rowIndices] of locationIdToRows) {
    if (rowIndices.length > 1) {
      duplicateLocationCount++;
      const locationName = rows[rowIndices[0]].location.name;
      conflicts.push({
        type: 'duplicate-location',
        severity: 'warning',
        rowIndices,
        message: `Location "${locationName}" appears on ${rowIndices.length} rows (rows ${rowIndices.map((i) => i + 1).join(', ')}). Later rows will overwrite earlier ones for location ${locationId}.`,
      });
    }
  }

  // --- Territory mismatch (same account, different territory labels) ---
  const accountTerritories = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!accountTerritories.has(row.account.id)) {
      accountTerritories.set(row.account.id, new Set());
    }
    accountTerritories.get(row.account.id)!.add(row.territory.label);
  }

  for (const [accountId, labels] of accountTerritories) {
    if (labels.size > 1) {
      const rowIndices = accountIdToRows.get(accountId) || [];
      const displayName = rows[rowIndices[0]]?.account.displayName || accountId;
      conflicts.push({
        type: 'territory-mismatch',
        severity: 'warning',
        rowIndices,
        message: `"${displayName}" has conflicting territory labels: ${Array.from(labels).join(', ')}. The last row's territory will win.`,
      });
    }
  }

  return {
    conflicts,
    hasErrors: conflicts.some((conflict) => conflict.severity === 'error'),
    hasWarnings: conflicts.some((conflict) => conflict.severity === 'warning'),
    duplicateAccountCount,
    duplicateLocationCount,
  };
};

export const parseDelimitedCrmImport = (rawText: string): CrmImportRow[] => {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ',';
  const rawHeaders = lines[0].split(delimiter).map((header) => header.trim());

  // Resolve each raw header to a canonical field name via the alias map.
  const resolvedHeaders = rawHeaders.map((header) => resolveColumnAlias(header));

  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(delimiter).map((cell) => cell.trim());
      const get = (canonicalField: string) => {
        const index = resolvedHeaders.indexOf(canonicalField);
        return index >= 0 ? cells[index] : undefined;
      };

      return {
        accountName: get('accountName') || '',
        legalName: get('legalName'),
        accountType: (get('accountType') as AccountType | undefined) || undefined,
        territoryLabel: get('territoryLabel'),
        contactName: get('contactName'),
        contactEmail: get('contactEmail'),
        contactPhone: get('contactPhone'),
        locationName: get('locationName'),
        locationType: coerceLocationType(get('locationType')),
        role: coerceImportRole(get('role')),
        rawAddress: get('rawAddress'),
        city: get('city'),
        state: get('state'),
        region: get('region'),
        latitude: parseImportNumber(get('latitude')),
        longitude: parseImportNumber(get('longitude')),
      };
    })
    .filter((row) => row.accountName);
};

export const buildCanonicalAccountFromImportRow = (row: CrmImportRow, orgId: string): CrmAccount => ({
  id: `acct-${slugifyCrmId(row.accountName)}`,
  orgId,
  displayName: row.accountName,
  legalName: row.legalName || row.accountName,
  accountType: row.accountType || 'other',
  verticalPack: DEFAULT_VERTICAL_PACK,
  territoryId: row.territoryLabel ? `territory-${slugifyCrmId(row.territoryLabel)}` : undefined,
  territoryLabel: row.territoryLabel || buildTerritoryLabel({ city: row.city, state: row.state, region: row.region }),
  status: 'active',
  tags: ['imported-account'],
  sourceApp: 'foodcrm-pro',
});

export const buildContactFromImportRow = (row: CrmImportRow, orgId: string, accountId: string): CrmContact | null => {
  if (!row.contactName && !row.contactEmail) return null;

  const contactName = row.contactName || row.contactEmail || 'Imported Contact';
  return {
    id: `contact-${slugifyCrmId(`${accountId}-${contactName}`)}`,
    orgId,
    accountId,
    name: contactName,
    email: row.contactEmail,
    phone: row.contactPhone,
    contactType: 'buyer',
    isPrimaryBuyer: true,
    isActive: true,
    sourceApp: 'foodcrm-pro',
  };
};

export const buildLocationFromImportRow = (row: CrmImportRow, orgId: string, accountId: string): CrmLocation => {
  const locationName = row.locationName || `${row.accountName} ${row.role === 'buyer-office' ? 'Office' : 'Door'}`;
  const linkType = row.locationType || (row.role === 'buyer-office' ? 'buyer-office' : 'store-door');
  const isBuyerOffice = row.role === 'buyer-office' || row.role === 'both' || linkType === 'buyer-office' || linkType === 'hq';
  const isDoor = row.role === 'door' || row.role === 'both' || linkType === 'store-door';

  return {
    id: `loc-${slugifyCrmId(`${accountId}-${locationName}`)}`,
    orgId,
    name: locationName,
    locationType: linkType,
    rawAddress: row.rawAddress,
    city: row.city,
    state: row.state,
    region: row.region,
    territoryLabel: row.territoryLabel || buildTerritoryLabel({ city: row.city, state: row.state, region: row.region }),
    latitude: row.latitude,
    longitude: row.longitude,
    geoProvider: row.latitude != null && row.longitude != null ? 'google-maps' : undefined,
    showOnMap: true,
    isBuyerOffice,
    isDoor,
    sourceApp: 'foodcrm-pro',
  };
};

export const buildLinkFromImportRow = (
  row: CrmImportRow,
  orgId: string,
  accountId: string,
  locationId: string
): CrmAccountLocationLink => {
  const locationType = row.locationType || (row.role === 'buyer-office' ? 'buyer-office' : 'store-door');
  return {
    id: `${accountId}-${locationId}`,
    orgId,
    accountId,
    locationId,
    locationType,
    isBuyerOffice: row.role === 'buyer-office' || row.role === 'both' || locationType === 'buyer-office' || locationType === 'hq',
    isDoor: row.role === 'door' || row.role === 'both' || locationType === 'store-door',
    showOnMap: true,
    isPrimary: false,
    sourceApp: 'foodcrm-pro',
  };
};

export const buildTerritoryFromImportRow = (row: CrmImportRow, orgId: string): CrmTerritory => {
  const rawLabel = row.territoryLabel || buildTerritoryLabel({ city: row.city, state: row.state, region: row.region });
  const label = normalizeTerritoryLabel(rawLabel);
  return {
    id: `territory-${slugifyCrmId(label)}`,
    orgId,
    label,
    scope: row.region ? 'region' : row.city ? 'city' : 'state',
    state: row.state,
    city: row.city,
    region: row.region,
    sourceApp: 'foodcrm-pro',
  };
};

export const normalizeCrmImportRows = (rows: CrmImportRow[], orgId: string): NormalizedCrmImportRecord[] =>
  rows.map((row, index) => {
    const account = buildCanonicalAccountFromImportRow(row, orgId);
    const contact = buildContactFromImportRow(row, orgId, account.id);
    const location = buildLocationFromImportRow(row, orgId, account.id);
    const link = buildLinkFromImportRow(row, orgId, account.id, location.id);
    const territory = buildTerritoryFromImportRow(row, orgId);

    return {
      rowIndex: index,
      account: {
        ...account,
        territoryId: territory.id,
        territoryLabel: territory.label,
      },
      contact,
      location: {
        ...location,
        territoryLabel: territory.label,
      },
      link,
      territory,
    };
  });

// ---------------------------------------------------------------------------
// Territory deduplication for import batches
// ---------------------------------------------------------------------------

/**
 * Given an array of normalized import records, returns a deduplicated map of
 * territory ID → CrmTerritory. This prevents redundant Firestore writes when
 * many import rows resolve to the same territory.
 */
export const deduplicateImportTerritories = (
  records: NormalizedCrmImportRecord[]
): Map<string, CrmTerritory> => {
  const map = new Map<string, CrmTerritory>();
  for (const record of records) {
    if (!map.has(record.territory.id)) {
      map.set(record.territory.id, record.territory);
    }
  }
  return map;
};

// ---------------------------------------------------------------------------
// Smart territory suggestions
// ---------------------------------------------------------------------------

export type TerritorySuggestion = {
  label: string;
  source: 'existing' | 'geography';
  /** Lower = better match. Used for stable sort order. */
  rank: number;
};

/**
 * Derives ranked territory suggestions for a given account by combining:
 *  1. Existing territory labels already in the org (source: 'existing')
 *  2. Geography-derived labels from the account's linked locations
 *     (source: 'geography') — only added if they don't duplicate an existing one
 *
 * Results are sorted best-match-first when a `currentDraft` is provided.
 */
export const suggestTerritoryLabels = (
  existingTerritoryLabels: string[],
  accountLocations: Pick<CrmLocation, 'city' | 'state' | 'region'>[],
  currentDraft: string = ''
): TerritorySuggestion[] => {
  const seen = new Set<string>();
  const suggestions: TerritorySuggestion[] = [];

  // 1. Existing territories
  for (const label of existingTerritoryLabels) {
    const normalized = normalizeTerritoryLabel(label);
    if (normalized && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      suggestions.push({ label: normalized, source: 'existing', rank: 0 });
    }
  }

  // 2. Geography-derived from linked locations
  for (const loc of accountLocations) {
    const derived = buildTerritoryLabel(loc);
    if (derived && derived !== 'Unassigned territory' && !seen.has(derived.toLowerCase())) {
      seen.add(derived.toLowerCase());
      suggestions.push({ label: derived, source: 'geography', rank: 1 });
    }
  }

  // 3. Rank by relevance to current draft
  const draftLower = normalizeTerritoryLabel(currentDraft).toLowerCase();
  if (draftLower) {
    for (const suggestion of suggestions) {
      const labelLower = suggestion.label.toLowerCase();
      if (labelLower === draftLower) {
        suggestion.rank = -2; // exact match
      } else if (labelLower.startsWith(draftLower)) {
        suggestion.rank = -1; // prefix match
      } else if (labelLower.includes(draftLower)) {
        suggestion.rank = 0; // substring match
      }
      // otherwise keep original rank
    }
  }

  return suggestions.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
};
