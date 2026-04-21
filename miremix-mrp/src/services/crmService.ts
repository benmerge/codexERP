/**
 * CRM Service for 40 Century Grain
 * Handles integration with Sales & Orders section
 */

import { 
  collectionGroup,
  query, 
  getDocs, 
  updateDoc,
  doc,
  onSnapshot,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { crmDb as db } from '../firebase'; // Import the dedicated CRM database instance
import { crmConfig } from '../config';

export interface CRMOrder {
  id: string;
  customerName: string;
  status: string;
  items: CRMOrderItem[];
  date: string;
  rawId: string; // Full Firebase document path
  docId: string;
  orderNumber?: string;
}

export interface CRMOrderItem {
  id?: string;
  name: string;
  quantity: number;
  sku?: string;
}

const OPEN_ORDER_STATUSES = ['placed', 'pending', 'processing', 'confirmed', 'paid'];
const CLOSED_ORDER_STATUSES = ['shipped', 'completed', 'fulfilled', 'cancelled', 'canceled'];

function toDisplayDate(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  return new Date().toISOString();
}

function normalizeItems(items: unknown): CRMOrderItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return {
          id: `item-${index + 1}`,
          name: typeof item === 'string' ? item : `Item ${index + 1}`,
          quantity: 1,
        };
      }

      const record = item as Record<string, unknown>;
      return {
        id: typeof record.id === 'string' ? record.id : undefined,
        name:
          (typeof record.name === 'string' && record.name) ||
          (typeof record.productName === 'string' && record.productName) ||
          (typeof record.title === 'string' && record.title) ||
          `Item ${index + 1}`,
        quantity:
          typeof record.quantity === 'number'
            ? record.quantity
            : typeof record.qty === 'number'
              ? record.qty
              : 1,
        sku:
          (typeof record.sku === 'string' && record.sku) ||
          (typeof record.productId === 'string' && record.productId) ||
          undefined,
      };
    })
    .filter((item) => item.name);
}

function normalizeStatus(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Pending';
  return value.trim();
}

function isOpenOrder(status: string): boolean {
  const normalized = status.toLowerCase();
  if (CLOSED_ORDER_STATUSES.some((closed) => normalized.includes(closed))) {
    return false;
  }
  return OPEN_ORDER_STATUSES.some((open) => normalized.includes(open));
}

function normalizeOrder(snapshot: QueryDocumentSnapshot<DocumentData>): CRMOrder {
  const data = snapshot.data();
  const status = normalizeStatus(data.status ?? data.fulfillmentStatus ?? data.orderStatus);

  return {
    id: data.orderId || data.orderNumber || snapshot.id,
    docId: snapshot.id,
    orderNumber:
      (typeof data.orderNumber === 'string' && data.orderNumber) ||
      (typeof data.orderId === 'string' && data.orderId) ||
      undefined,
    customerName:
      data.customerCompany ||
      data.customerName ||
      data.customerId ||
      data.customer?.name ||
      data.customer?.customerName ||
      data.customer?.displayName ||
      data.customer ||
      'Unknown Customer',
    status,
    items: normalizeItems(data.items ?? data.lineItems ?? data.products),
    date: toDisplayDate(data.date || data.createdAt || data.updatedAt),
    rawId: snapshot.ref.path,
  };
}

export const crmService = {
  /**
   * Fetches orders with 'Order placed' status from the CRM collection in Firestore
   */
  async getOpenOrders(): Promise<CRMOrder[]> {
    const auth = getAuth();
    if (!auth.currentUser) return [];

    try {
      const q = query(
        collectionGroup(db, crmConfig.ordersCollection),
        where('uid', '==', crmConfig.sharedOrgId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(normalizeOrder)
        .filter((order) => isOpenOrder(order.status));
    } catch (error) {
      console.error('Failed to fetch real CRM orders from Firestore:', error);
      return [];
    }
  },

  /**
   * Real-time subscription to open orders
   */
  subscribeToOpenOrders(
    callback: (orders: CRMOrder[]) => void,
    onError?: (error: unknown) => void
  ) {
    const auth = getAuth();
    if (!auth.currentUser) {
      callback([]);
      return () => {};
    }

    const q = query(
      collectionGroup(db, crmConfig.ordersCollection),
      where('uid', '==', crmConfig.sharedOrgId)
    );

    return onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs
        .map(normalizeOrder)
        .filter((order) => isOpenOrder(order.status));
      
      callback(orders);
    }, (err) => {
      console.error('CRM Subscription Error:', err);
      onError?.(err);
      callback([]);
    });
  },
  /**
   * Updates an order status to 'Shipped' in the CRM collection
   */
  async markAsShipped(docPath: string): Promise<boolean> {
    try {
      const ref = docPath.includes('/')
        ? doc(db, docPath)
        : doc(db, crmConfig.ordersCollection, docPath);
      await updateDoc(ref, {
        status: 'Shipped',
        fulfilledDate: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      console.error('Failed to update CRM status:', error);
      return false;
    }
  }
};
