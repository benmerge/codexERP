import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '../firebase';
import { useAppContext } from '../data/AppContext';
import { canManagePlatform, resolveOrgId } from '../platform/shared';
import { crmAppConfig } from '../config';
import type { AccountType, ContactType, CrmAccount, CrmAccountLocationLink, CrmContact, CrmLocation, CrmTerritory } from '../types';
import {
  analyzeImportHeaders,
  buildTerritoryFromLocation,
  detectImportConflicts,
  normalizeCrmImportRows,
  normalizeTerritoryLabel,
  parseDelimitedCrmImport,
  slugifyCrmId,
} from '../platform/crmCore';
import { Search, MapPinned, Building2, Users, Warehouse, Rows3, PanelsTopLeft, Route, Upload, Pencil, Save, Eye, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

type CrmCoreFeedbackCategory = 'bug' | 'idea' | 'data' | 'ui' | 'import' | 'other';
type CrmCoreFeedbackStatus = 'new' | 'triaged' | 'resolved';

type CrmCoreFeedback = {
  id: string;
  orgId: string;
  category: CrmCoreFeedbackCategory;
  title: string;
  details: string;
  status: CrmCoreFeedbackStatus;
  relatedAccountId?: string | null;
  sourcePage: string;
  submittedByEmail?: string | null;
  submittedByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type DerivedAccountSummary = {
  account: CrmAccount;
  contacts: CrmContact[];
  locations: CrmLocation[];
  links: CrmAccountLocationLink[];
  buyerOfficeCount: number;
  doorCount: number;
  geographyLabel: string;
};

type EditableLocationDraft = {
  name: string;
  city: string;
  state: string;
  region: string;
  latitude: string;
  longitude: string;
  locationType: CrmLocation['locationType'];
  role: 'buyer-office' | 'door' | 'both';
  showOnMap: boolean;
};

const buildLocationDraft = (
  location: CrmLocation,
  link: CrmAccountLocationLink | undefined
): EditableLocationDraft => ({
  name: location.name,
  city: location.city || '',
  state: location.state || '',
  region: location.region || '',
  latitude: location.latitude != null ? String(location.latitude) : '',
  longitude: location.longitude != null ? String(location.longitude) : '',
  locationType: location.locationType,
  role: link?.isBuyerOffice && link?.isDoor ? 'both' : link?.isBuyerOffice ? 'buyer-office' : 'door',
  showOnMap: link?.showOnMap ?? location.showOnMap,
});

const parseCoordinate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

type EditableAccountDraft = {
  displayName: string;
  legalName: string;
  accountType: AccountType;
  status: CrmAccount['status'];
  customerCategory: string;
  ownerEmail: string;
};

const buildAccountDraft = (account: CrmAccount): EditableAccountDraft => ({
  displayName: account.displayName,
  legalName: account.legalName || '',
  accountType: account.accountType,
  status: account.status,
  customerCategory: account.customerCategory || '',
  ownerEmail: account.ownerEmail || '',
});

type EditableContactDraft = {
  name: string;
  email: string;
  phone: string;
  contactType: ContactType;
  isPrimaryBuyer: boolean;
  linkedLocationId: string;
};

type ExistingImportCollision = {
  kind: 'account-update' | 'location-update' | 'territory-reuse';
  severity: 'info' | 'warning';
  rowIndex: number;
  message: string;
};

type ImportRowOverride = {
  accountMode: 'merge' | 'create-new';
  locationMode: 'merge' | 'create-new';
  territoryMode: 'reuse' | 'create-new';
  pasteCollisionMode: 'merge' | 'create-new' | 'skip';
};

const defaultImportOverride: ImportRowOverride = {
  accountMode: 'merge',
  locationMode: 'merge',
  territoryMode: 'reuse',
  pasteCollisionMode: 'merge',
};

const buildContactDraft = (contact: CrmContact): EditableContactDraft => ({
  name: contact.name,
  email: contact.email || '',
  phone: contact.phone || '',
  contactType: contact.contactType,
  isPrimaryBuyer: contact.isPrimaryBuyer,
  linkedLocationId: contact.linkedLocationId || '',
});

export function CrmCore() {
  const { user } = useAppContext();
  const [accounts, setAccounts] = useState<CrmAccount[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [locations, setLocations] = useState<CrmLocation[]>([]);
  const [links, setLinks] = useState<CrmAccountLocationLink[]>([]);
  const [territories, setTerritories] = useState<CrmTerritory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedTerritory, setSelectedTerritory] = useState<string>('all');
  const [locationView, setLocationView] = useState<'all' | 'buyer-offices' | 'doors'>('all');
  const [viewMode, setViewMode] = useState<'split' | 'list' | 'map'>('split');
  const [territoryDraft, setTerritoryDraft] = useState('');
  const [locationDrafts, setLocationDrafts] = useState<Record<string, EditableLocationDraft>>({});
  const [activeMapLocationId, setActiveMapLocationId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importOverrides, setImportOverrides] = useState<Record<number, ImportRowOverride>>({});
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [accountDraft, setAccountDraft] = useState<EditableAccountDraft | null>(null);
  const [contactDrafts, setContactDrafts] = useState<Record<string, EditableContactDraft>>({});
  const [feedbackEntries, setFeedbackEntries] = useState<CrmCoreFeedback[]>([]);
  const [feedbackCategory, setFeedbackCategory] = useState<CrmCoreFeedbackCategory>('idea');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDetails, setFeedbackDetails] = useState('');
  const [feedbackRelatedAccountId, setFeedbackRelatedAccountId] = useState<string>('none');
  const [feedbackStatusMessage, setFeedbackStatusMessage] = useState<string | null>(null);
  const orgId = resolveOrgId(user, crmAppConfig.sharedOrgId);
  const canAdmin = canManagePlatform(user?.email);

  useEffect(() => {
    if (!orgId) {
      setAccounts([]);
      setContacts([]);
      setLocations([]);
      setLinks([]);
      setTerritories([]);
      setFeedbackEntries([]);
      return;
    }

    const unsubAccounts = onSnapshot(collection(db, `orgs/${orgId}/accounts`), (snapshot) => {
      setAccounts(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CrmAccount)));
    });
    const unsubContacts = onSnapshot(collection(db, `orgs/${orgId}/contacts`), (snapshot) => {
      setContacts(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CrmContact)));
    });
    const unsubLocations = onSnapshot(collection(db, `orgs/${orgId}/locations`), (snapshot) => {
      setLocations(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CrmLocation)));
    });
    const unsubLinks = onSnapshot(collection(db, `orgs/${orgId}/account_location_links`), (snapshot) => {
      setLinks(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CrmAccountLocationLink)));
    });
    const unsubTerritories = onSnapshot(collection(db, `orgs/${orgId}/territories`), (snapshot) => {
      setTerritories(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CrmTerritory)));
    });
    const unsubFeedback = onSnapshot(collection(db, `orgs/${orgId}/crm_core_feedback`), (snapshot) => {
      setFeedbackEntries(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as CrmCoreFeedback)));
    });

    return () => {
      unsubAccounts();
      unsubContacts();
      unsubLocations();
      unsubLinks();
      unsubTerritories();
      unsubFeedback();
    };
  }, [orgId]);

  const accountSummaries = useMemo<DerivedAccountSummary[]>(() => {
    return accounts
      .map((account) => {
        const accountContacts = contacts.filter((entry) => entry.accountId === account.id);
        const accountLinks = links.filter((entry) => entry.accountId === account.id);
        const accountLocations = accountLinks
          .map((link) => locations.find((location) => location.id === link.locationId))
          .filter((entry): entry is CrmLocation => !!entry);
        const states = Array.from(new Set(accountLocations.map((location) => location.state).filter(Boolean)));
        const cities = Array.from(new Set(accountLocations.map((location) => location.city).filter(Boolean)));

        return {
          account,
          contacts: accountContacts,
          locations: accountLocations,
          links: accountLinks,
          buyerOfficeCount: accountLinks.filter((entry) => entry.isBuyerOffice).length,
          doorCount: accountLinks.filter((entry) => entry.isDoor).length,
          geographyLabel:
            states.length > 0
              ? states.join(', ')
              : cities.length > 0
                ? cities.join(', ')
                : account.territoryLabel || 'Unassigned geography',
        };
      })
      .sort((left, right) => left.account.displayName.localeCompare(right.account.displayName));
  }, [accounts, contacts, links, locations]);

  const filteredAccounts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return accountSummaries.filter(({ account, geographyLabel, contacts: accountContacts, locations: accountLocations, links: accountLinks }) => {
      const matchesQuery =
        !query ||
        account.displayName.toLowerCase().includes(query) ||
        (account.legalName || '').toLowerCase().includes(query) ||
        geographyLabel.toLowerCase().includes(query) ||
        (account.territoryLabel || '').toLowerCase().includes(query) ||
        accountContacts.some((contact) => contact.name.toLowerCase().includes(query) || (contact.email || '').toLowerCase().includes(query));

      const matchesState =
        selectedState === 'all' ||
        accountLocations.some((location) => (location.state || '') === selectedState);

      const matchesCity =
        selectedCity === 'all' ||
        accountLocations.some((location) => (location.city || '') === selectedCity);

      const matchesTerritory =
        selectedTerritory === 'all' ||
        account.territoryLabel === selectedTerritory ||
        geographyLabel === selectedTerritory;

      const matchesLocationView =
        locationView === 'all' ||
        (locationView === 'buyer-offices'
          ? accountLinks.some((link) => link.isBuyerOffice)
          : accountLinks.some((link) => link.isDoor));

      return matchesQuery && matchesState && matchesCity && matchesTerritory && matchesLocationView;
    });
  }, [accountSummaries, locationView, searchTerm, selectedCity, selectedState, selectedTerritory]);

  const availableStates = useMemo(
    () => Array.from(new Set(locations.map((location) => location.state).filter(Boolean))).sort(),
    [locations]
  );
  const availableCities = useMemo(
    () => Array.from(new Set(locations.map((location) => location.city).filter(Boolean))).sort(),
    [locations]
  );
  const availableTerritories = useMemo(
    () => Array.from(new Set(accounts.map((account) => account.territoryLabel).filter(Boolean))).sort(),
    [accounts]
  );
  const normalizedImportRows = useMemo(
    () => (orgId ? normalizeCrmImportRows(parseDelimitedCrmImport(importText), orgId) : []),
    [importText, orgId]
  );
  const headerAnalysis = useMemo(() => analyzeImportHeaders(importText), [importText]);
  const conflictReport = useMemo(() => detectImportConflicts(normalizedImportRows), [normalizedImportRows]);
  const samePasteDuplicateRows = useMemo(() => {
    const accountCounts = new Map<string, number>();
    const locationCounts = new Map<string, number>();

    normalizedImportRows.forEach((row) => {
      accountCounts.set(row.account.id, (accountCounts.get(row.account.id) || 0) + 1);
      locationCounts.set(row.location.id, (locationCounts.get(row.location.id) || 0) + 1);
    });

    return normalizedImportRows
      .filter((row) => (accountCounts.get(row.account.id) || 0) > 1 || (locationCounts.get(row.location.id) || 0) > 1)
      .map((row) => ({
        rowIndex: row.rowIndex,
        accountDuplicate: (accountCounts.get(row.account.id) || 0) > 1,
        locationDuplicate: (locationCounts.get(row.location.id) || 0) > 1,
        accountName: row.account.displayName,
        locationName: row.location.name,
      }));
  }, [normalizedImportRows]);
  const existingImportCollisions = useMemo<ExistingImportCollision[]>(() => {
    if (!normalizedImportRows.length) return [];

    return normalizedImportRows.flatMap((row) => {
      const collisions: ExistingImportCollision[] = [];
      const existingAccount = accounts.find((entry) => entry.id === row.account.id);
      const existingLocation = locations.find((entry) => entry.id === row.location.id);
      const existingTerritory =
        territories.find((entry) => entry.id === row.territory.id || normalizeTerritoryLabel(entry.label) === normalizeTerritoryLabel(row.territory.label)) || null;

      if (existingAccount) {
        const changedFields: string[] = [];
        if ((existingAccount.displayName || '') !== (row.account.displayName || '')) changedFields.push('display name');
        if ((existingAccount.accountType || '') !== (row.account.accountType || '')) changedFields.push('account type');
        if ((existingAccount.territoryLabel || '') !== (row.account.territoryLabel || '')) changedFields.push('territory');

        collisions.push({
          kind: 'account-update',
          severity: changedFields.length ? 'warning' : 'info',
          rowIndex: row.rowIndex,
          message: changedFields.length
            ? `Row ${row.rowIndex + 1} will update existing account ${existingAccount.displayName} (${changedFields.join(', ')}).`
            : `Row ${row.rowIndex + 1} matches existing account ${existingAccount.displayName} and will merge cleanly.`,
        });
      }

      if (existingLocation) {
        const changedFields: string[] = [];
        if ((existingLocation.name || '') !== (row.location.name || '')) changedFields.push('location name');
        if ((existingLocation.locationType || '') !== (row.location.locationType || '')) changedFields.push('location type');
        if ((existingLocation.city || '') !== (row.location.city || '')) changedFields.push('city');
        if ((existingLocation.state || '') !== (row.location.state || '')) changedFields.push('state');

        collisions.push({
          kind: 'location-update',
          severity: changedFields.length ? 'warning' : 'info',
          rowIndex: row.rowIndex,
          message: changedFields.length
            ? `Row ${row.rowIndex + 1} will update existing location ${existingLocation.name} (${changedFields.join(', ')}).`
            : `Row ${row.rowIndex + 1} matches existing location ${existingLocation.name} and will merge cleanly.`,
        });
      }

      if (existingTerritory && normalizeTerritoryLabel(existingTerritory.label) === normalizeTerritoryLabel(row.territory.label)) {
        collisions.push({
          kind: 'territory-reuse',
          severity: 'info',
          rowIndex: row.rowIndex,
          message: `Row ${row.rowIndex + 1} reuses territory ${row.territory.label} instead of creating a new duplicate.`,
        });
      }

      return collisions;
    });
  }, [accounts, locations, normalizedImportRows, territories]);

  useEffect(() => {
    if (!normalizedImportRows.length) {
      setImportOverrides({});
      return;
    }

    setImportOverrides((current) =>
      Object.fromEntries(
        normalizedImportRows.map((row) => [row.rowIndex, current[row.rowIndex] || defaultImportOverride])
      )
    );
  }, [normalizedImportRows]);

  useEffect(() => {
    if (!filteredAccounts.length) {
      setSelectedAccountId(null);
      return;
    }

    if (selectedAccountId && filteredAccounts.some((entry) => entry.account.id === selectedAccountId)) return;
    setSelectedAccountId(filteredAccounts[0].account.id);
  }, [filteredAccounts, selectedAccountId]);

  const selectedAccount = filteredAccounts.find((entry) => entry.account.id === selectedAccountId) || filteredAccounts[0] || null;

  useEffect(() => {
    if (!selectedAccount) {
      setTerritoryDraft('');
      setLocationDrafts({});
      setAccountDraft(null);
      setContactDrafts({});
      return;
    }

    setTerritoryDraft(selectedAccount.account.territoryLabel || selectedAccount.geographyLabel);
    setAccountDraft(buildAccountDraft(selectedAccount.account));
    setLocationDrafts(
      Object.fromEntries(
        selectedAccount.locations.map((location) => [
          location.id,
          buildLocationDraft(location, selectedAccount.links.find((entry) => entry.locationId === location.id)),
        ])
      )
    );
    setContactDrafts(
      Object.fromEntries(
        selectedAccount.contacts.map((contact) => [
          contact.id,
          buildContactDraft(contact),
        ])
      )
    );
  }, [selectedAccount]);

  const visibleLocations = useMemo(() => {
    if (!selectedAccount) return [];
    return selectedAccount.locations.filter((location) => {
      const link = selectedAccount.links.find((entry) => entry.locationId === location.id);
      if (!link) return false;
      if (locationView === 'buyer-offices') return link.isBuyerOffice;
      if (locationView === 'doors') return link.isDoor;
      return true;
    });
  }, [locationView, selectedAccount]);
  const mappedLocations = visibleLocations.filter((location) => typeof location.latitude === 'number' && typeof location.longitude === 'number');
  const stateFootprint = Array.from(new Set(selectedAccount?.locations.map((location) => location.state).filter(Boolean) || []));
  const cityFootprint = Array.from(new Set(selectedAccount?.locations.map((location) => location.city).filter(Boolean) || []));

  // Resolve the user-selected map location, falling back to the first mapped location
  const activeMapLocation = useMemo(() => {
    if (activeMapLocationId) {
      const found = mappedLocations.find((location) => location.id === activeMapLocationId);
      if (found) return found;
    }
    return mappedLocations[0] || null;
  }, [activeMapLocationId, mappedLocations]);

  // Reset active map location when the account or filter changes and the selection is no longer valid
  useEffect(() => {
    if (!activeMapLocationId) return;
    const stillValid = mappedLocations.some((location) => location.id === activeMapLocationId);
    if (!stillValid) setActiveMapLocationId(null);
  }, [activeMapLocationId, mappedLocations]);

  const activeMapLocationLink = selectedAccount?.links.find((entry) => entry.locationId === activeMapLocation?.id) || null;

  const googleEmbedUrl = activeMapLocation
    ? `https://www.google.com/maps?q=${activeMapLocation.latitude},${activeMapLocation.longitude}&z=12&output=embed`
    : null;

  const updateLocationDraft = (locationId: string, patch: Partial<EditableLocationDraft>) => {
    setLocationDrafts((current) => ({
      ...current,
      [locationId]: {
        ...current[locationId],
        ...patch,
      },
    }));
  };

  const updateImportOverride = (rowIndex: number, patch: Partial<ImportRowOverride>) => {
    setImportOverrides((current) => ({
      ...current,
      [rowIndex]: {
        ...(current[rowIndex] || defaultImportOverride),
        ...patch,
      },
    }));
  };

  const updateAccountDraft = (patch: Partial<EditableAccountDraft>) => {
    setAccountDraft((current) => current ? { ...current, ...patch } : current);
  };

  const updateContactDraft = (contactId: string, patch: Partial<EditableContactDraft>) => {
    setContactDrafts((current) => ({
      ...current,
      [contactId]: {
        ...current[contactId],
        ...patch,
      },
    }));
  };

  const saveAccountDraft = async () => {
    if (!orgId || !selectedAccount || !accountDraft) return;

    setIsSaving(true);
    setImportNotice(null);
    try {
      await updateDoc(doc(db, `orgs/${orgId}/accounts/${selectedAccount.account.id}`), {
        displayName: accountDraft.displayName.trim() || selectedAccount.account.displayName,
        legalName: accountDraft.legalName.trim() || null,
        accountType: accountDraft.accountType,
        status: accountDraft.status,
        customerCategory: accountDraft.customerCategory || null,
        ownerEmail: accountDraft.ownerEmail.trim() || null,
        updatedAt: new Date().toISOString(),
      });
      setImportNotice(`Updated account details for ${accountDraft.displayName || selectedAccount.account.displayName}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const saveContactDraft = async (contactId: string) => {
    if (!orgId || !selectedAccount) return;

    const draft = contactDrafts[contactId];
    const contact = selectedAccount.contacts.find((entry) => entry.id === contactId);
    if (!draft || !contact) return;

    setIsSaving(true);
    setImportNotice(null);
    try {
      await updateDoc(doc(db, `orgs/${orgId}/contacts/${contactId}`), {
        name: draft.name.trim() || contact.name,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        contactType: draft.contactType,
        isPrimaryBuyer: draft.isPrimaryBuyer,
        linkedLocationId: draft.linkedLocationId || null,
        updatedAt: new Date().toISOString(),
      });
      setImportNotice(`Updated contact ${draft.name || contact.name} for ${selectedAccount.account.displayName}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const saveTerritoryAssignment = async () => {
    if (!orgId || !selectedAccount) return;

    setIsSaving(true);
    setImportNotice(null);
    try {
      const territoryLabel = normalizeTerritoryLabel(territoryDraft.trim() || selectedAccount.geographyLabel);
      const primaryLocation = selectedAccount.locations[0];
      const territoryId = `territory-${territoryLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || selectedAccount.account.id}`;
      const territory = primaryLocation
        ? {
            ...buildTerritoryFromLocation({ id: territoryId, orgId, city: primaryLocation.city, state: primaryLocation.state, region: primaryLocation.region }),
            id: territoryId,
            label: territoryLabel,
          }
        : {
            id: territoryId,
            orgId,
            label: territoryLabel,
            scope: 'custom' as const,
            customRule: `Assigned manually in CRM Core for ${selectedAccount.account.displayName}`,
            sourceApp: 'foodcrm-pro',
          };

      await setDoc(doc(db, `orgs/${orgId}/territories/${territory.id}`), territory);
      await updateDoc(doc(db, `orgs/${orgId}/accounts/${selectedAccount.account.id}`), {
        territoryId: territory.id,
        territoryLabel: territory.label,
        updatedAt: new Date().toISOString(),
      });
      setImportNotice(`Assigned ${territory.label} to ${selectedAccount.account.displayName}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const saveLocationDraft = async (locationId: string) => {
    if (!orgId || !selectedAccount) return;

    const draft = locationDrafts[locationId];
    const location = selectedAccount.locations.find((entry) => entry.id === locationId);
    const link = selectedAccount.links.find((entry) => entry.locationId === locationId);
    if (!draft || !location || !link) return;

    const roleIsBuyerOffice = draft.role === 'buyer-office' || draft.role === 'both';
    const roleIsDoor = draft.role === 'door' || draft.role === 'both';
    const territoryLabelForLocation = territoryDraft.trim() || buildTerritoryFromLocation({
      id: `${locationId}-territory`,
      orgId,
      city: draft.city || undefined,
      state: draft.state || undefined,
      region: draft.region || undefined,
    }).label;

    setIsSaving(true);
    setImportNotice(null);
    try {
      await updateDoc(doc(db, `orgs/${orgId}/locations/${locationId}`), {
        name: draft.name.trim() || location.name,
        city: draft.city.trim() || null,
        state: draft.state.trim() || null,
        region: draft.region.trim() || null,
        latitude: parseCoordinate(draft.latitude) ?? null,
        longitude: parseCoordinate(draft.longitude) ?? null,
        locationType: draft.locationType,
        territoryLabel: territoryLabelForLocation,
        isBuyerOffice: roleIsBuyerOffice,
        isDoor: roleIsDoor,
        showOnMap: draft.showOnMap,
        geoProvider: parseCoordinate(draft.latitude) != null && parseCoordinate(draft.longitude) != null ? 'google-maps' : null,
        updatedAt: new Date().toISOString(),
      });

      await updateDoc(doc(db, `orgs/${orgId}/account_location_links/${link.id}`), {
        locationType: draft.locationType,
        isBuyerOffice: roleIsBuyerOffice,
        isDoor: roleIsDoor,
        showOnMap: draft.showOnMap,
        updatedAt: new Date().toISOString(),
      });

      setImportNotice(`Updated ${draft.name || location.name} for ${selectedAccount.account.displayName}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const submitFeedback = async () => {
    if (!orgId || !user) return;

    const title = feedbackTitle.trim();
    const details = feedbackDetails.trim();
    if (!title || !details) {
      setFeedbackStatusMessage('Please add both a title and details before submitting feedback.');
      return;
    }

    setIsSaving(true);
    setFeedbackStatusMessage(null);
    try {
      const feedbackId = `feedback-${Date.now()}`;
      const payload: CrmCoreFeedback = {
        id: feedbackId,
        orgId,
        category: feedbackCategory,
        title,
        details,
        status: 'new',
        relatedAccountId: feedbackRelatedAccountId === 'none' ? null : feedbackRelatedAccountId,
        sourcePage: 'crm-core',
        submittedByEmail: user.email || null,
        submittedByUserId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, `orgs/${orgId}/crm_core_feedback/${feedbackId}`), payload);
      setFeedbackTitle('');
      setFeedbackDetails('');
      setFeedbackRelatedAccountId('none');
      setFeedbackStatusMessage('Feedback submitted. It is now stored inside the org workspace for review.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateFeedbackStatus = async (feedbackId: string, status: CrmCoreFeedbackStatus) => {
    if (!orgId || !canAdmin) return;

    setIsSaving(true);
    setFeedbackStatusMessage(null);
    try {
      await updateDoc(doc(db, `orgs/${orgId}/crm_core_feedback/${feedbackId}`), {
        status,
        updatedAt: new Date().toISOString(),
      });
      setFeedbackStatusMessage(`Feedback ${feedbackId} marked as ${status}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const importNormalizedRows = async () => {
    if (!orgId || !normalizedImportRows.length) return;

    setIsSaving(true);
    setImportNotice(null);
    try {
      for (const row of normalizedImportRows) {
        const override = importOverrides[row.rowIndex] || defaultImportOverride;
        if (override.pasteCollisionMode === 'skip') {
          continue;
        }
        const existingTerritory =
          territories.find((entry) => entry.id === row.territory.id || normalizeTerritoryLabel(entry.label) === normalizeTerritoryLabel(row.territory.label)) || null;

        const forceNewFromPaste = override.pasteCollisionMode === 'create-new';
        const accountId =
          (forceNewFromPaste || (override.accountMode === 'create-new' && accounts.some((entry) => entry.id === row.account.id)))
            ? `${row.account.id}-import-${row.rowIndex + 1}`
            : row.account.id;

        const locationId =
          (forceNewFromPaste || (override.locationMode === 'create-new' && locations.some((entry) => entry.id === row.location.id)))
            ? `${row.location.id}-import-${row.rowIndex + 1}`
            : row.location.id;

        const territoryId =
          override.territoryMode === 'reuse' && existingTerritory
            ? existingTerritory.id
            : override.territoryMode === 'create-new' && existingTerritory
              ? `${row.territory.id}-import-${row.rowIndex + 1}`
              : row.territory.id;

        const territoryLabel =
          override.territoryMode === 'reuse' && existingTerritory
            ? existingTerritory.label
            : normalizeTerritoryLabel(row.territory.label);

        const accountPayload = {
          ...row.account,
          id: accountId,
          territoryId,
          territoryLabel,
          tags: override.accountMode === 'create-new'
            ? Array.from(new Set([...(row.account.tags || []), 'import-created']))
            : row.account.tags,
        };

        const locationPayload = {
          ...row.location,
          id: locationId,
          territoryLabel,
          name:
            override.locationMode === 'create-new' && locations.some((entry) => entry.id === row.location.id)
              ? `${row.location.name} (Import ${row.rowIndex + 1})`
              : row.location.name,
        };

        const linkPayload = {
          ...row.link,
          id: `${accountId}-${locationId}`,
          accountId,
          locationId,
        };

        const territoryPayload = {
          ...row.territory,
          id: territoryId,
          label: territoryLabel,
        };

        await setDoc(doc(db, `orgs/${orgId}/accounts/${accountPayload.id}`), accountPayload, { merge: true });
        if (row.contact) {
          const contactPayload = {
            ...row.contact,
            id:
              override.accountMode === 'create-new'
                ? `contact-${slugifyCrmId(`${accountId}-${row.contact.name}`)}`
                : row.contact.id,
            accountId,
          };
          await setDoc(doc(db, `orgs/${orgId}/contacts/${contactPayload.id}`), contactPayload, { merge: true });
        }
        await setDoc(doc(db, `orgs/${orgId}/locations/${locationPayload.id}`), locationPayload, { merge: true });
        await setDoc(doc(db, `orgs/${orgId}/account_location_links/${linkPayload.id}`), linkPayload, { merge: true });
        await setDoc(doc(db, `orgs/${orgId}/territories/${territoryPayload.id}`), territoryPayload, { merge: true });
      }

      setImportNotice(`Imported ${normalizedImportRows.length} normalized CRM row${normalizedImportRows.length === 1 ? '' : 's'} into CRM Core.`);
      setImportText('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-700">CRM Core</div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Accounts, Contacts, and Locations</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            This is the thin shared CRM-core surface. Parent accounts stay canonical while linked buyer offices, doors, and location relationships are available for the future map and vertical packs.
          </p>
        </div>
      </div>

      {importNotice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {importNotice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-600">Parent Accounts</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-slate-900">{accounts.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-600">Managed Contacts</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-slate-900">{contacts.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-600">Linked Locations</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-slate-900">{locations.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-600">Account-Location Links</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-slate-900">{links.length}</CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search accounts, contacts, or geography..."
            className="border-slate-200 bg-white pl-9"
          />
        </div>
        <select value={selectedState} onChange={(event) => setSelectedState(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <option value="all">All states</option>
          {availableStates.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
        <select value={selectedCity} onChange={(event) => setSelectedCity(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <option value="all">All cities</option>
          {availableCities.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
        <select value={selectedTerritory} onChange={(event) => setSelectedTerritory(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <option value="all">All territories</option>
          {availableTerritories.map((territory) => <option key={territory} value={territory}>{territory}</option>)}
        </select>
        <select value={locationView} onChange={(event) => setLocationView(event.target.value as typeof locationView)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <option value="all">Buyer offices + doors</option>
          <option value="buyer-offices">Buyer offices only</option>
          <option value="doors">Doors only</option>
        </select>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            <div className="flex items-center gap-2"><Rows3 className="h-3.5 w-3.5" />List</div>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${viewMode === 'split' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            <div className="flex items-center gap-2"><PanelsTopLeft className="h-3.5 w-3.5" />Split</div>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${viewMode === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            <div className="flex items-center gap-2"><MapPinned className="h-3.5 w-3.5" />Map</div>
          </button>
        </div>
      </div>

      <div className={`grid gap-6 ${viewMode === 'split' ? 'xl:grid-cols-[0.95fr_1.05fr]' : 'xl:grid-cols-1'}`}>
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-slate-50/70">
            <CardTitle>Account List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {filteredAccounts.length ? filteredAccounts.map((summary) => (
              <button
                key={summary.account.id}
                type="button"
                onClick={() => setSelectedAccountId(summary.account.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${selectedAccount?.account.id === summary.account.id ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-slate-900">{summary.account.displayName}</div>
                    <div className="mt-1 text-sm text-slate-600">{summary.geographyLabel}</div>
                  </div>
                  <Badge variant="outline" className="border-slate-200 text-slate-700">
                    {summary.account.verticalPack}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span>{summary.contacts.length} contacts</span>
                  <span>•</span>
                  <span>{summary.buyerOfficeCount} buyer offices</span>
                  <span>•</span>
                  <span>{summary.doorCount} doors</span>
                </div>
              </button>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">
                No CRM-core accounts yet. Existing customer actions will now start filling this shared layer.
              </div>
            )}
          </CardContent>
        </Card>

        {viewMode !== 'list' ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b bg-slate-50/70">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-emerald-700" />
                <CardTitle>{selectedAccount?.account.displayName || 'Select an account'}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              {selectedAccount ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Pencil className="h-4 w-4" />
                      Account details
                    </div>
                    {accountDraft ? (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="account-displayName">Display name</Label>
                            <Input
                              id="account-displayName"
                              value={accountDraft.displayName}
                              onChange={(event) => updateAccountDraft({ displayName: event.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="account-legalName">Legal name</Label>
                            <Input
                              id="account-legalName"
                              value={accountDraft.legalName}
                              onChange={(event) => updateAccountDraft({ legalName: event.target.value })}
                              placeholder="Optional legal entity name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="account-accountType">Account type</Label>
                            <select
                              id="account-accountType"
                              value={accountDraft.accountType}
                              onChange={(event) => updateAccountDraft({ accountType: event.target.value as AccountType })}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                            >
                              <option value="retailer">Retailer</option>
                              <option value="distributor">Distributor</option>
                              <option value="brand">Brand</option>
                              <option value="broker">Broker</option>
                              <option value="institution">Institution</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="account-status">Status</Label>
                            <select
                              id="account-status"
                              value={accountDraft.status}
                              onChange={(event) => updateAccountDraft({ status: event.target.value as CrmAccount['status'] })}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                            >
                              <option value="active">Active</option>
                              <option value="prospect">Prospect</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="account-category">Customer category</Label>
                            <Input
                              id="account-category"
                              value={accountDraft.customerCategory}
                              onChange={(event) => updateAccountDraft({ customerCategory: event.target.value })}
                              placeholder="e.g. Retail, Wholesale"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="account-ownerEmail">Owner email</Label>
                            <Input
                              id="account-ownerEmail"
                              value={accountDraft.ownerEmail}
                              onChange={(event) => updateAccountDraft({ ownerEmail: event.target.value })}
                              placeholder="sales-rep@company.com"
                            />
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            <Badge variant="outline" className="border-slate-200">{selectedAccount.account.verticalPack}</Badge>
                            {selectedAccount.account.tags?.map((tag) => (
                              <Badge key={tag} variant="outline" className="border-slate-200">{tag}</Badge>
                            ))}
                          </div>
                          <Button type="button" onClick={saveAccountDraft} disabled={isSaving}>
                            <Save className="mr-2 h-4 w-4" />
                            Save Account
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Route className="h-4 w-4" />
                      Territory assignment
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                      <div className="space-y-2">
                        <Label htmlFor="territory-draft">Territory label</Label>
                        <Input
                          id="territory-draft"
                          value={territoryDraft}
                          onChange={(event) => setTerritoryDraft(event.target.value)}
                          placeholder="Upper Midwest Buyers"
                        />
                      </div>
                      <Button type="button" onClick={saveTerritoryAssignment} disabled={isSaving}>
                        Save Territory
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Use this to make parent-account geography explicit before we start layering route planning and richer map logic on top.
                    </p>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Users className="h-4 w-4" />
                        Contacts
                      </div>
                      <div className="space-y-3">
                        {selectedAccount.contacts.length ? selectedAccount.contacts.map((contact) => {
                          const draft = contactDrafts[contact.id] || buildContactDraft(contact);
                          const linkedLocation = draft.linkedLocationId
                            ? selectedAccount.locations.find((loc) => loc.id === draft.linkedLocationId)
                            : null;
                          return (
                            <div key={contact.id} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold text-slate-900">{contact.name}</div>
                                <div className="flex items-center gap-2">
                                  {contact.isPrimaryBuyer ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Primary buyer</Badge> : null}
                                  <Badge variant="outline" className="border-slate-200 text-slate-600">{contact.contactType}</Badge>
                                </div>
                              </div>
                              {linkedLocation ? (
                                <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                                  <MapPinned className="h-3 w-3" />
                                  Linked to {linkedLocation.name}
                                </div>
                              ) : null}
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor={`${contact.id}-name`}>Name</Label>
                                  <Input
                                    id={`${contact.id}-name`}
                                    value={draft.name}
                                    onChange={(event) => updateContactDraft(contact.id, { name: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${contact.id}-email`}>Email</Label>
                                  <Input
                                    id={`${contact.id}-email`}
                                    value={draft.email}
                                    onChange={(event) => updateContactDraft(contact.id, { email: event.target.value })}
                                    placeholder="email@example.com"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${contact.id}-phone`}>Phone</Label>
                                  <Input
                                    id={`${contact.id}-phone`}
                                    value={draft.phone}
                                    onChange={(event) => updateContactDraft(contact.id, { phone: event.target.value })}
                                    placeholder="(555) 123-4567"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${contact.id}-contactType`}>Contact type</Label>
                                  <select
                                    id={`${contact.id}-contactType`}
                                    value={draft.contactType}
                                    onChange={(event) => updateContactDraft(contact.id, { contactType: event.target.value as ContactType })}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                  >
                                    <option value="buyer">Buyer</option>
                                    <option value="operations">Operations</option>
                                    <option value="finance">Finance</option>
                                    <option value="executive">Executive</option>
                                    <option value="other">Other</option>
                                  </select>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <Label htmlFor={`${contact.id}-linkedLocation`}>Linked location</Label>
                                  <select
                                    id={`${contact.id}-linkedLocation`}
                                    value={draft.linkedLocationId}
                                    onChange={(event) => updateContactDraft(contact.id, { linkedLocationId: event.target.value })}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                  >
                                    <option value="">No linked location</option>
                                    {selectedAccount.locations.map((loc) => (
                                      <option key={loc.id} value={loc.id}>{loc.name} ({loc.locationType})</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-sm text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={draft.isPrimaryBuyer}
                                    onChange={(event) => updateContactDraft(contact.id, { isPrimaryBuyer: event.target.checked })}
                                  />
                                  Primary buyer
                                </label>
                                <Button type="button" variant="outline" onClick={() => saveContactDraft(contact.id)} disabled={isSaving}>
                                  Save Contact
                                </Button>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                            No linked contacts yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Warehouse className="h-4 w-4" />
                        Linked locations
                      </div>
                      <div className="space-y-3">
                        {selectedAccount.locations.length ? selectedAccount.locations.map((location) => {
                          const link = selectedAccount.links.find((entry) => entry.locationId === location.id);
                          const draft = locationDrafts[location.id] || buildLocationDraft(location, link);
                          return (
                            <div key={location.id} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold text-slate-900">{location.name}</div>
                                {link?.isBuyerOffice ? <Badge variant="outline">Buyer office</Badge> : null}
                                {link?.isDoor ? <Badge variant="outline">Door</Badge> : null}
                              </div>
                              <div className="mt-2 text-sm text-slate-600">
                                {[location.city, location.state, location.region].filter(Boolean).join(', ') || 'No geography set yet'}
                              </div>
                              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                                {location.locationType} • {location.showOnMap ? 'map visible' : 'hidden from map'}
                              </div>
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-name`}>Location name</Label>
                                  <Input
                                    id={`${location.id}-name`}
                                    value={draft.name}
                                    onChange={(event) => updateLocationDraft(location.id, { name: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-type`}>Location type</Label>
                                  <select
                                    id={`${location.id}-type`}
                                    value={draft.locationType}
                                    onChange={(event) => updateLocationDraft(location.id, { locationType: event.target.value as CrmLocation['locationType'] })}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                  >
                                    <option value="buyer-office">Buyer office</option>
                                    <option value="store-door">Store door</option>
                                    <option value="warehouse">Warehouse</option>
                                    <option value="hq">HQ</option>
                                    <option value="other">Other</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-city`}>City</Label>
                                  <Input
                                    id={`${location.id}-city`}
                                    value={draft.city}
                                    onChange={(event) => updateLocationDraft(location.id, { city: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-state`}>State</Label>
                                  <Input
                                    id={`${location.id}-state`}
                                    value={draft.state}
                                    onChange={(event) => updateLocationDraft(location.id, { state: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-region`}>Region</Label>
                                  <Input
                                    id={`${location.id}-region`}
                                    value={draft.region}
                                    onChange={(event) => updateLocationDraft(location.id, { region: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-role`}>Account relationship</Label>
                                  <select
                                    id={`${location.id}-role`}
                                    value={draft.role}
                                    onChange={(event) => updateLocationDraft(location.id, { role: event.target.value as EditableLocationDraft['role'] })}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                  >
                                    <option value="buyer-office">Buyer office</option>
                                    <option value="door">Door</option>
                                    <option value="both">Buyer office + door</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-latitude`}>Latitude</Label>
                                  <Input
                                    id={`${location.id}-latitude`}
                                    value={draft.latitude}
                                    onChange={(event) => updateLocationDraft(location.id, { latitude: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`${location.id}-longitude`}>Longitude</Label>
                                  <Input
                                    id={`${location.id}-longitude`}
                                    value={draft.longitude}
                                    onChange={(event) => updateLocationDraft(location.id, { longitude: event.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-sm text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={draft.showOnMap}
                                    onChange={(event) => updateLocationDraft(location.id, { showOnMap: event.target.checked })}
                                  />
                                  Show on map
                                </label>
                                <Button type="button" variant="outline" onClick={() => saveLocationDraft(location.id)} disabled={isSaving}>
                                  Save Location
                                </Button>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                            No linked locations yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-sm text-slate-500">
                  Select an account to inspect the shared CRM-core detail.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-slate-50/70">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <MapPinned className="h-5 w-5 text-emerald-700" />
                  <CardTitle>Map-Ready Footprint</CardTitle>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Showing:</span>
                  <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                    {locationView === 'all' ? 'All types' : locationView === 'buyer-offices' ? 'Buyer offices' : 'Doors'}
                  </Badge>
                  <span>•</span>
                  <span>{mappedLocations.length} mappable</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 md:col-span-2">
                {googleEmbedUrl ? (
                  <iframe
                    title="CRM account map"
                    src={googleEmbedUrl}
                    className="h-[380px] w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="flex h-[380px] items-center justify-center p-6 text-center text-sm text-slate-500">
                    This account does not yet have mapped coordinates. Once linked locations carry latitude and longitude, the first Google-backed map view will render here.
                  </div>
                )}
              </div>

              {/* Selected location detail card */}
              {activeMapLocation ? (
                <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/50 p-4 md:col-span-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    <Eye className="h-3.5 w-3.5" />
                    Active map location
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">{activeMapLocation.name}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {activeMapLocationLink?.isBuyerOffice ? <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Buyer office</Badge> : null}
                        {activeMapLocationLink?.isDoor ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Door</Badge> : null}
                        <Badge variant="outline" className="text-slate-600">{activeMapLocation.locationType}</Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Geography</div>
                      <div className="mt-1 text-sm text-slate-700">
                        {[activeMapLocation.city, activeMapLocation.state, activeMapLocation.region].filter(Boolean).join(', ') || 'No geography set'}
                      </div>
                      {activeMapLocation.territoryLabel ? (
                        <div className="mt-1 text-xs text-slate-500">Territory: {activeMapLocation.territoryLabel}</div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Coordinates</div>
                      <div className="mt-1 font-mono text-sm text-slate-700">
                        {activeMapLocation.latitude?.toFixed(4)}, {activeMapLocation.longitude?.toFixed(4)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {activeMapLocation.showOnMap ? 'Visible on map' : 'Hidden from map'}
                        {activeMapLocation.geoProvider ? ` • ${activeMapLocation.geoProvider}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">State footprint</div>
                <div className="mt-2 text-sm text-slate-700">
                  {stateFootprint.length ? stateFootprint.join(', ') : 'No state assignments yet'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">City footprint</div>
                <div className="mt-2 text-sm text-slate-700">
                  {cityFootprint.length ? cityFootprint.join(', ') : 'No city assignments yet'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Mapped coordinates</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{mappedLocations.length}</div>
                <div className="mt-1 text-sm text-slate-600">locations currently have latitude and longitude</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Buyer office vs doors</div>
                <div className="mt-2 text-sm text-slate-700">
                  {selectedAccount ? `${selectedAccount.buyerOfficeCount} offices • ${selectedAccount.doorCount} doors` : 'Select an account first'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Visible locations in current map mode</div>
                  <div className="text-xs text-slate-400">{visibleLocations.length} location{visibleLocations.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="mt-3 grid gap-3">
                  {visibleLocations.length ? visibleLocations.map((location) => {
                    const link = selectedAccount?.links.find((entry) => entry.locationId === location.id);
                    const hasCords = typeof location.latitude === 'number' && typeof location.longitude === 'number';
                    const isActive = activeMapLocation?.id === location.id;
                    return (
                      <button
                        key={location.id}
                        type="button"
                        disabled={!hasCords}
                        onClick={() => hasCords && setActiveMapLocationId(location.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                          isActive
                            ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                            : hasCords
                              ? 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30 cursor-pointer'
                              : 'border-dashed border-slate-200 bg-white opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">{location.name}</div>
                          <div className="flex items-center gap-1.5">
                            {link?.isBuyerOffice ? <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700">Office</Badge> : null}
                            {link?.isDoor ? <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700">Door</Badge> : null}
                            {isActive ? <MapPinned className="h-3.5 w-3.5 text-emerald-600" /> : null}
                            {!hasCords ? <span className="text-[10px] uppercase tracking-wider text-slate-400">No coords</span> : null}
                          </div>
                        </div>
                        <div className="mt-1 text-slate-600">{[location.city, location.state, location.region].filter(Boolean).join(', ') || 'No geography set yet'}</div>
                      </button>
                    );
                  }) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                      No visible locations match the current office/door filter.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-slate-50/70">
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-emerald-700" />
                <CardTitle>Import Normalization Studio</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2">
                <Label htmlFor="crm-import">Paste CSV, TSV, or pipe-delimited CRM rows</Label>
                <textarea
                  id="crm-import"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={'account_name,contact_name,contact_email,location_name,city,state,role,latitude,longitude\nNorthwind Buying Group,Alex Rivera,alex@northwind.com,Dallas Office,Dallas,TX,buyer-office,32.7767,-96.7970'}
                  className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {/* Column recognition badges */}
              {(headerAnalysis.recognized.length > 0 || headerAnalysis.unrecognized.length > 0) && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Column recognition</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {headerAnalysis.recognized.map((header) => (
                      <span key={header} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        {header}
                        <span className="text-emerald-500">→ {headerAnalysis.mapping[header]}</span>
                      </span>
                    ))}
                    {headerAnalysis.unrecognized.map((header) => (
                      <span key={header} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3 w-3" />
                        {header}
                        <span className="text-amber-500">— ignored</span>
                      </span>
                    ))}
                  </div>
                  {headerAnalysis.unrecognized.length > 0 && (
                    <p className="mt-2 text-xs text-amber-700">
                      Unrecognized columns will be skipped during import. Rename them to a supported alias or add custom mappings.
                    </p>
                  )}
                </div>
              )}

              {/* Conflict / duplicate preview */}
              {conflictReport.conflicts.length > 0 && (
                <div className={`rounded-2xl border p-4 ${
                  conflictReport.hasErrors
                    ? 'border-red-200 bg-red-50'
                    : 'border-amber-200 bg-amber-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${conflictReport.hasErrors ? 'text-red-600' : 'text-amber-600'}`} />
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${
                      conflictReport.hasErrors ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {conflictReport.hasErrors ? 'Import errors' : 'Duplicate / conflict preview'}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
                    {conflictReport.duplicateAccountCount > 0 && (
                      <span className="text-amber-800">{conflictReport.duplicateAccountCount} duplicate account{conflictReport.duplicateAccountCount === 1 ? '' : 's'}</span>
                    )}
                    {conflictReport.duplicateLocationCount > 0 && (
                      <span className="text-amber-800">{conflictReport.duplicateLocationCount} duplicate location{conflictReport.duplicateLocationCount === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {conflictReport.conflicts.map((conflict, index) => (
                      <div
                        key={`conflict-${index}`}
                        className={`rounded-xl px-3 py-2 text-xs ${
                          conflict.severity === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {conflict.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {samePasteDuplicateRows.length > 0 ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-violet-700" />
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">
                      Same-paste duplicate decisions
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {samePasteDuplicateRows.slice(0, 6).map((row) => {
                      const override = importOverrides[row.rowIndex] || defaultImportOverride;
                      return (
                        <div key={`paste-duplicate-${row.rowIndex}`} className="rounded-xl border border-violet-200 bg-white p-4">
                          <div className="text-sm font-semibold text-slate-900">
                            Row {row.rowIndex + 1}: {row.accountName} / {row.locationName}
                          </div>
                          <div className="mt-1 text-xs text-violet-700">
                            {row.accountDuplicate ? 'Account collides within this paste. ' : ''}
                            {row.locationDuplicate ? 'Location collides within this paste.' : ''}
                          </div>
                          <div className="mt-3 space-y-2">
                            <Label htmlFor={`paste-collision-${row.rowIndex}`}>How should this row behave?</Label>
                            <select
                              id={`paste-collision-${row.rowIndex}`}
                              value={override.pasteCollisionMode}
                              onChange={(event) => updateImportOverride(row.rowIndex, { pasteCollisionMode: event.target.value as ImportRowOverride['pasteCollisionMode'] })}
                              className="h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-sm text-slate-700"
                            >
                              <option value="merge">Merge into the same account/location</option>
                              <option value="create-new">Create separate imported records</option>
                              <option value="skip">Skip this row</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                    {samePasteDuplicateRows.length > 6 ? (
                      <div className="text-xs text-violet-700">
                        Decision controls are shown for the first 6 duplicate rows. Remaining duplicate rows keep the default `merge` behavior unless we add pagination next.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {existingImportCollisions.length > 0 && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-sky-700" />
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                      Existing CRM-core impact
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-sky-800">
                    <span>
                      {existingImportCollisions.filter((entry) => entry.kind === 'account-update').length} account merge
                      {existingImportCollisions.filter((entry) => entry.kind === 'account-update').length === 1 ? '' : 's'}
                    </span>
                    <span>
                      {existingImportCollisions.filter((entry) => entry.kind === 'location-update').length} location merge
                      {existingImportCollisions.filter((entry) => entry.kind === 'location-update').length === 1 ? '' : 's'}
                    </span>
                    <span>
                      {existingImportCollisions.filter((entry) => entry.kind === 'territory-reuse').length} territory reuse
                      {existingImportCollisions.filter((entry) => entry.kind === 'territory-reuse').length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {existingImportCollisions.slice(0, 8).map((entry, index) => (
                      <div
                        key={`existing-impact-${index}`}
                        className={`rounded-xl px-3 py-2 text-xs ${
                          entry.severity === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {entry.message}
                      </div>
                    ))}
                    {existingImportCollisions.length > 8 ? (
                      <div className="text-xs text-sky-700">
                        …and {existingImportCollisions.length - 8} more existing-record impact note
                        {existingImportCollisions.length - 8 === 1 ? '' : 's'}.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {normalizedImportRows.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Import decisions</div>
                  <div className="mt-3 space-y-3">
                    {normalizedImportRows.slice(0, 6).map((row) => {
                      const override = importOverrides[row.rowIndex] || defaultImportOverride;
                      const accountExists = accounts.some((entry) => entry.id === row.account.id);
                      const locationExists = locations.some((entry) => entry.id === row.location.id);
                      const territoryExists = territories.some(
                        (entry) => entry.id === row.territory.id || normalizeTerritoryLabel(entry.label) === normalizeTerritoryLabel(row.territory.label)
                      );

                      if (!accountExists && !locationExists && !territoryExists) return null;

                      return (
                        <div key={`override-${row.rowIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 text-sm font-semibold text-slate-900">
                            Row {row.rowIndex + 1}: {row.account.displayName} / {row.location.name}
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label htmlFor={`account-mode-${row.rowIndex}`}>Account</Label>
                              <select
                                id={`account-mode-${row.rowIndex}`}
                                value={override.accountMode}
                                onChange={(event) => updateImportOverride(row.rowIndex, { accountMode: event.target.value as ImportRowOverride['accountMode'] })}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                              >
                                <option value="merge">Merge into existing</option>
                                <option value="create-new">Create new account</option>
                              </select>
                              <div className="text-xs text-slate-500">
                                {accountExists ? 'An account with this normalized id already exists.' : 'No existing account collision.'}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`location-mode-${row.rowIndex}`}>Location</Label>
                              <select
                                id={`location-mode-${row.rowIndex}`}
                                value={override.locationMode}
                                onChange={(event) => updateImportOverride(row.rowIndex, { locationMode: event.target.value as ImportRowOverride['locationMode'] })}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                              >
                                <option value="merge">Merge into existing</option>
                                <option value="create-new">Create new location</option>
                              </select>
                              <div className="text-xs text-slate-500">
                                {locationExists ? 'A location with this normalized id already exists.' : 'No existing location collision.'}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`territory-mode-${row.rowIndex}`}>Territory</Label>
                              <select
                                id={`territory-mode-${row.rowIndex}`}
                                value={override.territoryMode}
                                onChange={(event) => updateImportOverride(row.rowIndex, { territoryMode: event.target.value as ImportRowOverride['territoryMode'] })}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                              >
                                <option value="reuse">Reuse normalized territory</option>
                                <option value="create-new">Create new territory record</option>
                              </select>
                              <div className="text-xs text-slate-500">
                                {territoryExists ? 'A matching normalized territory already exists.' : 'This will create a fresh territory record.'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {normalizedImportRows.length > 6 ? (
                      <div className="text-xs text-slate-500">
                        Decision controls are shown for the first 6 rows with collisions. The same merge defaults will apply to the remaining rows unless we add per-row pagination next.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Normalization preview</div>
                <div className="mt-3 space-y-3">
                  {normalizedImportRows.length ? normalizedImportRows.slice(0, 5).map((row) => (
                    <div key={`${row.account.id}-${row.location.id}`} className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                      <div className="font-semibold text-slate-900">{row.account.displayName}</div>
                      <div className="mt-1">
                        {row.location.name} • {row.territory.label}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {row.location.locationType} • {row.link.isBuyerOffice ? 'buyer office' : 'door'}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                      Paste structured rows to preview how they will normalize into accounts, locations, links, and territories.
                    </div>
                  )}
                  {normalizedImportRows.length > 5 && (
                    <div className="text-xs text-slate-500 text-center">
                      …and {normalizedImportRows.length - 5} more row{normalizedImportRows.length - 5 === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  {conflictReport.hasErrors
                    ? 'Fix the errors above before importing.'
                    : conflictReport.hasWarnings || samePasteDuplicateRows.length > 0
                      ? 'Review the duplicate decisions above. You can merge rows, split them into new imported records, or skip them before import.'
                      : existingImportCollisions.some((entry) => entry.severity === 'warning')
                        ? 'This import will update some existing CRM-core records. Review the impact notes above before importing.'
                        : 'This is the first import seam. It keeps raw rows from becoming ad hoc CRM records by normalizing them into the shared core model first.'}
                </p>
                <Button
                  type="button"
                  onClick={importNormalizedRows}
                  disabled={isSaving || !normalizedImportRows.length || conflictReport.hasErrors}
                >
                  Import Normalized Rows
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-slate-50/70">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-700" />
                <CardTitle>Local Feedback Loop</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm leading-6 text-slate-600">
                Use this panel to test the CRM-core flow locally and submit feedback directly into the org workspace. That makes it easier to validate the experience without juggling chat notes separately.
              </p>
              {feedbackStatusMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {feedbackStatusMessage}
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="feedback-title">Feedback title</Label>
                  <Input
                    id="feedback-title"
                    value={feedbackTitle}
                    onChange={(event) => setFeedbackTitle(event.target.value)}
                    placeholder="What should we improve?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feedback-category">Category</Label>
                  <select
                    id="feedback-category"
                    value={feedbackCategory}
                    onChange={(event) => setFeedbackCategory(event.target.value as CrmCoreFeedbackCategory)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="idea">Idea</option>
                    <option value="bug">Bug</option>
                    <option value="data">Data</option>
                    <option value="ui">UI</option>
                    <option value="import">Import</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="feedback-related-account">Related account</Label>
                  <select
                    id="feedback-related-account"
                    value={feedbackRelatedAccountId}
                    onChange={(event) => setFeedbackRelatedAccountId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="none">No related account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="feedback-details">Details</Label>
                  <textarea
                    id="feedback-details"
                    value={feedbackDetails}
                    onChange={(event) => setFeedbackDetails(event.target.value)}
                    placeholder="Tell us what felt confusing, what worked, and what you want next."
                    className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={submitFeedback} disabled={isSaving}>
                  Submit Feedback
                </Button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Recent feedback</div>
                <div className="mt-3 space-y-3">
                  {feedbackEntries.length ? feedbackEntries.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">{entry.title}</div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-slate-200 text-slate-700">
                            {entry.category}
                          </Badge>
                          <Badge variant="outline" className="border-slate-200 text-slate-700">
                            {entry.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">{entry.details}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Status: {entry.status}</span>
                        {entry.relatedAccountId ? <span>• Related account: {accounts.find((account) => account.id === entry.relatedAccountId)?.displayName || entry.relatedAccountId}</span> : null}
                        {entry.submittedByEmail ? <span>• By: {entry.submittedByEmail}</span> : null}
                      </div>
                      {canAdmin ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => updateFeedbackStatus(entry.id, 'triaged')} disabled={isSaving || entry.status === 'triaged'}>
                            Mark triaged
                          </Button>
                          <Button type="button" variant="outline" onClick={() => updateFeedbackStatus(entry.id, 'resolved')} disabled={isSaving || entry.status === 'resolved'}>
                            Mark resolved
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                      No feedback submitted yet. Use this panel to leave the first local test note.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        ) : null}
      </div>
    </div>
  );
}
