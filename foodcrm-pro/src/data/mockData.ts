import { Customer, Order, Product, Supplier, Task } from '../types';

export const initialCustomers: Customer[] = [
  { id: 'c1', name: 'Alice Johnson', company: 'Fresh Foods Market', email: 'alice@freshfoods.com', phone: '555-0101', isProspect: false, category: 'Retail', pipelineStage: 'Closed Won', lastContact: '2026-04-10', notes: [{ id: 'n1', text: 'Prefers morning deliveries.', date: '2026-04-01' }] },
  { id: 'c2', name: 'Bob Smith', company: 'City Infrastructure Dept', email: 'bob@citydist.com', phone: '555-0102', isProspect: false, category: 'Partner', pipelineStage: 'Closed Won', lastContact: '2026-04-09', notes: [] },
  { id: 'c3', name: 'Carol White', company: 'Valley Conservation Project', email: 'carol@valleyconserve.org', phone: '555-0103', isProspect: true, category: 'Partner', pipelineStage: 'Proposal', lastContact: '2026-04-11', notes: [{ id: 'n2', text: 'Sent updated land stewardship proposal.', date: '2026-04-11' }] },
  { id: 'c4', name: 'David Brown', company: 'AgriTech Farms', email: 'david@agritech.com', phone: '555-0104', isProspect: true, category: 'Distributor', pipelineStage: 'Contacted', lastContact: '2026-04-08', notes: [] },
  { id: 'c5', name: 'Eva Green', company: 'Marine Bio Research Lab', email: 'eva@marinebio.edu', phone: '555-0105', isProspect: true, category: 'Wholesale', pipelineStage: 'Lead', lastContact: '2026-04-05', notes: [] },
];

export const initialTasks: Task[] = [
  { id: 't1', title: 'Follow up on stewardship proposal', description: 'Call Carol to discuss the new funding tier.', status: 'To Do', customerId: 'c3', dueDate: '2026-04-15' },
  { id: 't2', title: 'Dispatch drone mapping unit', description: 'Schedule drone survey for AgriTech Farms.', status: 'In Progress', customerId: 'c4', dueDate: '2026-04-12' },
  { id: 't3', title: 'Quarterly review', description: 'Review Q1 infrastructure maintenance with City Dept.', status: 'Done', customerId: 'c2', dueDate: '2026-04-05' },
  { id: 't4', title: 'Update equipment spreadsheet', description: 'Reconcile depot counts with app data.', status: 'To Do' },
];

export const initialProducts: Product[] = [
  { id: 'p1', name: 'Organic Seed Mix Phase 1', category: 'Farming', sku: 'AGR-SD-01', stock: 500, unit: 'kg', price: 4.50, supplierId: 's1', status: 'In Stock' },
  { id: 'p2', name: 'Water Quality Sensors (Telemetry)', category: 'Science', sku: 'SCI-WQ-01', stock: 50, unit: 'units', price: 120.00, supplierId: 's2', status: 'Low Stock' },
  { id: 'p3', name: 'Industrial Filter Cartridges', category: 'Maintenance', sku: 'MNT-FLT-01', stock: 0, unit: 'pack', price: 25.00, supplierId: 's1', status: 'Out of Stock' },
  { id: 'p4', name: 'Sustainable Fertilizer Blend', category: 'Farming', sku: 'AGR-FZT-01', stock: 200, unit: 'kg', price: 8.50, supplierId: 's3', status: 'In Stock' },
];

export const initialSuppliers: Supplier[] = [
  { id: 's1', name: 'EcoSupply Industrial', contactName: 'David Lee', email: 'david@ecosupply.com', phone: '555-0201', category: 'Equipment', rating: 4.8 },
  { id: 's2', name: 'Advanced Sensor Co.', contactName: 'Elena Rossi', email: 'elena@advsensor.com', phone: '555-0202', category: 'Technology', rating: 4.5 },
  { id: 's3', name: 'GreenEarth Agriculture', contactName: 'Frank Green', email: 'frank@greenearth.com', phone: '555-0203', category: 'Raw Materials', rating: 4.9 },
  { id: 's4', name: 'BioPack Solutions', contactName: 'Grace Kim', email: 'grace@biopack.com', phone: '555-0204', category: 'Packaging', rating: 4.2 },
];

export const initialOrders: Order[] = [
  { id: 'o1', customerId: 'c1', date: '2026-04-01', status: 'Delivered', items: [{ productId: 'p1', quantity: 100 }], source: 'Shopify' },
  { id: 'o2', customerId: 'c2', date: '2026-04-08', status: 'Shipped', items: [{ productId: 'p2', quantity: 100 }], source: 'Manual' },
  { id: 'o3', customerId: 'c1', date: '2026-04-10', status: 'Order placed', items: [{ productId: 'p1', quantity: 50 }], source: 'Shopify' },
];
