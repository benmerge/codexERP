export type PipelineStage = 'Lead' | 'Contacted' | 'Proposal' | 'Closed Won' | 'Closed Lost';
export type CustomerCategory = 'Retail' | 'Wholesale' | 'Distributor' | 'Partner' | 'Government' | 'Non-Profit' | 'Agriculture' | 'Science' | 'Maintenance';
export type TaskStatus = 'To Do' | 'In Progress' | 'Review' | 'Done';

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
