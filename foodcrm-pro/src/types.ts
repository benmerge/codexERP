export type PipelineStage = 'Lead' | 'Contacted' | 'Proposal' | 'Closed Won' | 'Closed Lost';
export type CustomerCategory = 'Retail' | 'Wholesale' | 'Distributor' | 'Partner' | 'Government' | 'Non-Profit' | 'Agriculture' | 'Science' | 'Maintenance';
export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Done';
export type CrmVerticalPack = 'core' | 'food' | 'fiber';
export type AccountType = 'retailer' | 'distributor' | 'brand' | 'broker' | 'institution' | 'other';
export type ContactType = 'buyer' | 'operations' | 'finance' | 'executive' | 'other';
export type LocationType = 'buyer-office' | 'store-door' | 'warehouse' | 'hq' | 'other';
export type GeoProvider = 'google-maps';
export type TerritoryScope = 'state' | 'city' | 'region' | 'custom';

export interface Note {
  id: string;
  text: string;
  date: string;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  salesRepId?: string;
  salesRepName?: string;
  salesRepEmail?: string;
  isProspect: boolean;
  category: CustomerCategory;
  pipelineStage: PipelineStage;
  lastContact: string;
  notes: Note[];
  monthlySalesVolume?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  customerId?: string;
  dueDate?: string;
  createdAt?: string;
}

export interface OrgMember {
  id: string;
  email: string;
  displayName?: string;
  orgId?: string;
  role?: string;
}

export type OrderStatus = 'Order placed' | 'Shipped' | 'Delivered' | 'Cancelled';

export interface OrderItem {
  productId: string;
  quantity: number;
  price?: number;
  productName?: string;
  sku?: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName?: string;
  customerCompany?: string;
  customerEmail?: string;
  salesRepId?: string;
  salesRepName?: string;
  salesRepEmail?: string;
  date: string;
  amount?: number;
  status: OrderStatus;
  items: OrderItem[];
  source?: 'Manual' | 'Shopify';
  fulfilledDate?: string;
}

export type InventoryStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

export interface Product {
  id: string;
  name: string;
  category: string;
  sku: string;
  stock: number;
  unit: string;
  price: number;
  supplierId: string;
  status: InventoryStatus;
  onOrder?: number;
  available?: number;
  currentDemand?: string;
  imageUrl?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  rating: number;
}

export interface CrmAccount {
  id: string;
  orgId: string;
  displayName: string;
  legalName?: string;
  accountType: AccountType;
  verticalPack: CrmVerticalPack;
  ownerUserId?: string;
  ownerEmail?: string;
  pipelineStage?: PipelineStage;
  customerCategory?: CustomerCategory;
  hasCurrentQuarterOrder?: boolean;
  lastOrderDate?: string;
  territoryId?: string;
  territoryLabel?: string;
  tags?: string[];
  status: 'active' | 'prospect' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
  sourceApp?: string;
}

export interface CrmContact {
  id: string;
  orgId: string;
  accountId: string;
  linkedLocationId?: string;
  name: string;
  email?: string;
  phone?: string;
  contactType: ContactType;
  isPrimaryBuyer: boolean;
  isActive: boolean;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  sourceApp?: string;
}

export interface CrmLocation {
  id: string;
  orgId: string;
  name: string;
  locationType: LocationType;
  rawAddress?: string;
  normalizedAddress?: string;
  city?: string;
  state?: string;
  region?: string;
  territoryLabel?: string;
  latitude?: number;
  longitude?: number;
  geoProvider?: GeoProvider;
  providerPlaceId?: string;
  showOnMap: boolean;
  isBuyerOffice: boolean;
  isDoor: boolean;
  createdAt?: string;
  updatedAt?: string;
  sourceApp?: string;
}

export interface CrmAccountLocationLink {
  id: string;
  orgId: string;
  accountId: string;
  locationId: string;
  locationType: LocationType;
  isBuyerOffice: boolean;
  isDoor: boolean;
  showOnMap: boolean;
  isPrimary: boolean;
  travelPriority?: number;
  createdAt?: string;
  updatedAt?: string;
  sourceApp?: string;
}

export interface CrmTerritory {
  id: string;
  orgId: string;
  label: string;
  scope: TerritoryScope;
  state?: string;
  city?: string;
  region?: string;
  customRule?: string;
  createdAt?: string;
  updatedAt?: string;
  sourceApp?: string;
}
