import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Customer, Order, Product, Supplier, Task, InventoryStatus, OrgMember } from '../types';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, onSnapshot, query, deleteDoc, getDocFromServer, getDocs, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { crmAppConfig } from '../config';
import { initialCustomers, initialOrders, initialProducts, initialSuppliers, initialTasks } from './mockData';
import { canManageLocations, canManagePlatform, getEmailDomain, resolveOrgId } from '../platform/shared';
import {
  deleteCanonicalRecord,
  getLegacyCollectionPath,
  getOrgCollectionPath,
  seedCanonicalRecord,
  subscribeToCanonicalCollection,
  withOrgPlatformMetadata,
  writePlatformEvent,
  writeCanonicalRecord,
} from '../platform/data';
import {
  buildCanonicalAccountFromCustomer,
  buildPrimaryAccountLocationLink,
  buildPrimaryContactFromCustomer,
  buildStubLocationForAccount,
  CRM_CORE_COLLECTIONS,
} from '../platform/crmCore';

interface AppState {
  user: User | null;
  clientLogo: string | null;
  salesReps: OrgMember[];
  customers: Customer[];
  orders: Order[];
  products: Product[];
  suppliers: Supplier[];
  tasks: Task[];
  addCustomer: (customer: Customer) => void;
  addCustomers: (customers: Customer[]) => void;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (customerId: string) => void;
  addOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  deleteOrder: (orderId: string) => void;
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  setProducts: (products: Product[]) => void;
  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (supplier: Supplier) => void;
  deleteSupplier: (supplierId: string) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  updateClientLogo: (logoBase64: string) => void;
  deleteProduct: (productId: string) => void;
  seedSharedTestOrg: () => Promise<void>;
  login: () => void;
  logout: () => void;
  error: any | null;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

const AppContext = createContext<AppState | undefined>(undefined);

const humanizeRepLabel = (value: string) =>
  value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeSalesRep = (member: OrgMember, fallbackUser?: User | null): OrgMember => {
  const email = member.email || (member.id.includes('@') ? member.id : '');
  const displayName =
    member.displayName ||
    fallbackUser?.displayName ||
    fallbackUser?.email ||
    email ||
    'Assigned rep';

  return {
    ...member,
    email,
    displayName,
  };
};

const getBootstrapRole = (email?: string | null) => {
  if (canManageLocations(email) || canManagePlatform(email)) {
    return 'admin';
  }

  return 'user';
};

const buildOrgBootstrapRecord = (currentUser: User, orgId: string) => {
  const primaryDomain = getEmailDomain(currentUser.email);
  const fallbackName = primaryDomain
    ? humanizeRepLabel(primaryDomain.split('.')[0] ?? primaryDomain)
    : humanizeRepLabel(orgId.replace(/^org_/, ''));

  return removeUndefined({
    id: orgId,
    name: fallbackName || currentUser.displayName || currentUser.email || 'Shared Workspace',
    slug: orgId.replace(/^org_/, ''),
    status: 'active',
    primaryDomain,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: currentUser.uid,
  });
};

const buildOrgMemberBootstrapRecord = (currentUser: User, orgId: string) =>
  removeUndefined({
    userId: currentUser.uid,
    email: currentUser.email || '',
    displayName: currentUser.displayName || currentUser.email || 'Workspace Member',
    orgId,
    role: getBootstrapRole(currentUser.email),
    isActive: true,
    sourceApp: 'foodcrm-pro',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

function removeUndefined(obj: any) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

const asFirestorePayload = (payload: Record<string, unknown>) => payload;

export const normalizeRepData = <T extends { salesRepId?: string, salesRepName?: string, salesRepEmail?: string }>(record: T): T => {
  let { salesRepId, salesRepName, salesRepEmail } = record;
  const looksLikeUid = (value?: string) =>
    !!value &&
    /^[A-Za-z0-9_-]{20,}$/.test(value) &&
    !value.includes('@') &&
    !value.includes(' ');
  
  if (!salesRepId || salesRepId === 'unassigned') {
    salesRepId = '';
    salesRepName = '';
    salesRepEmail = '';
  } else if (
    salesRepName === 'Assigned rep' ||
    salesRepName === salesRepId ||
    looksLikeUid(salesRepName)
  ) {
    salesRepName = '';
  }

  return {
    ...record,
    salesRepId,
    salesRepName,
    salesRepEmail,
  };
};

const normalizeCustomerStatus = (customer: Customer): Customer => {
  const normalized = normalizeRepData(customer);
  return {
    ...normalized,
    isProspect: normalized.pipelineStage !== 'Closed Won',
  };
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [salesReps, setSalesReps] = useState<OrgMember[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<any | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const previousOrderStatusesRef = React.useRef<Record<string, string>>({});
  const hasHydratedOrdersRef = React.useRef(false);
  
  // Email Auth UI state
  const [emailAuthMode, setEmailAuthMode] = useState<'login' | 'signup' | 'none'>('none');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Initializing Auth Listener...");
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log("Auth state changed:", currentUser?.email || 'No user');
      setUser(currentUser);
      setIsAuthReady(true);
      
      // Bootstrap user metadata and org grouping
      if (currentUser) {
        const dataId = getDataId(currentUser);
        void (async () => {
          try {
            const bootstrapRole = getBootstrapRole(currentUser.email);

            await setDoc(doc(db, 'users', currentUser.uid), {
              email: currentUser.email,
              displayName: currentUser.displayName || currentUser.email,
              role: bootstrapRole,
              orgId: dataId
            }, { merge: true });

            await setDoc(doc(db, `users/${dataId}/team`, currentUser.uid), {
              email: currentUser.email,
              displayName: currentUser.displayName || currentUser.email,
              role: bootstrapRole,
              orgId: dataId,
            }, { merge: true });

            await setDoc(
              doc(db, 'orgs', dataId),
              buildOrgBootstrapRecord(currentUser, dataId),
              { merge: true }
            );

            await setDoc(
              doc(db, `orgs/${dataId}/members`, currentUser.uid),
              buildOrgMemberBootstrapRecord(currentUser, dataId),
              { merge: true }
            );
          } catch (err) {
            console.error("Error bootstrapping user/team/org membership:", err);
          }
        })();
      }
    }, (err) => {
      console.error("onAuthStateChanged error:", err);
      setIsAuthReady(true); // Don't block the UI forever
      setError(err);
    });
    return () => unsubscribe();
  }, []);

  const handleFirestoreError = (err: any, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: err instanceof Error ? err.message : String(err),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    
    const isPermissionError = err?.code === 'permission-denied' || 
                             (err instanceof Error && err.message.toLowerCase().includes('permission'));

    // Set state-wide error if it's a blocking snapshot or a permission-denied write
    if (isPermissionError || (operationType === OperationType.LIST && !isAuthReady)) {
      setError(errInfo);
    }
  };

  useEffect(() => {
    const testConnection = async () => {
      console.log("Testing Firestore connection...");
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection test successful.");
      } catch (err) {
        console.warn("Firestore connection test failed (expected if collection not initialized):", err);
      }
    };
    testConnection();
  }, []);

  useEffect(() => {
    const dataId = getDataId(user);
    if (!isAuthReady || !dataId) {
      setCustomers([]);
      setSalesReps([]);
      setTasks([]);
      setOrders([]);
      setProducts([]);
      setSuppliers([]);
      setClientLogo(null);
      previousOrderStatusesRef.current = {};
      hasHydratedOrdersRef.current = false;
      return;
    }

    const userRef = doc(db, 'users', dataId);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setClientLogo(docSnap.data().clientLogo || null);
      }
    });

    const unsubscribeCustomers = subscribeToCanonicalCollection<Customer>(
      {
        db,
        orgId: dataId,
        collectionName: 'customers',
        mapDoc: (entry) => normalizeRepData({ ...entry.data(), id: entry.id } as Customer),
        onData: (loadedCustomers) => {
          setCustomers(loadedCustomers);
        },
        onError: (error, path) => {
          handleFirestoreError(error, OperationType.LIST, path);
        },
      }
    );

    const unsubscribeTasks = subscribeToCanonicalCollection<Task>(
      {
        db,
        orgId: dataId,
        collectionName: 'tasks',
        mapDoc: (entry) => ({ ...entry.data(), id: entry.id } as Task),
        onData: (loadedTasks) => {
          setTasks(loadedTasks);
        },
        onError: (error, path) => {
          handleFirestoreError(error, OperationType.LIST, path);
        },
      }
    );

    const unsubscribeOrders = subscribeToCanonicalCollection<Order>(
      {
        db,
        orgId: dataId,
        collectionName: 'orders',
        mapDoc: (entry) => normalizeRepData({ ...entry.data(), id: entry.id } as Order),
        onData: (loadedOrders) => {
          const nextStatuses = Object.fromEntries(loadedOrders.map((order) => [order.id, order.status]));
          if (hasHydratedOrdersRef.current) {
            loadedOrders.forEach((order) => {
              const previousStatus = previousOrderStatusesRef.current[order.id];
              if (!previousStatus || previousStatus === order.status) return;

              if (order.status === 'Shipped' || order.status === 'Delivered') {
                void sendAutomaticOrderStatusNotification(order);
              }
            });
          } else {
            hasHydratedOrdersRef.current = true;
          }

          previousOrderStatusesRef.current = nextStatuses;
          setOrders(loadedOrders);
        },
        onError: (error, path) => {
          handleFirestoreError(error, OperationType.LIST, path);
        },
      }
    );

    const unsubscribeProducts = subscribeToCanonicalCollection<Product>(
      {
        db,
        orgId: dataId,
        collectionName: 'products',
        mapDoc: (entry) => ({ ...entry.data(), id: entry.id } as Product),
        onData: (loadedProducts) => {
          setProducts(loadedProducts);
        },
        onError: (error, path) => {
          handleFirestoreError(error, OperationType.LIST, path);
        },
      }
    );

    const unsubscribeSuppliers = subscribeToCanonicalCollection<Supplier>(
      {
        db,
        orgId: dataId,
        collectionName: 'suppliers',
        mapDoc: (entry) => ({ ...entry.data(), id: entry.id } as Supplier),
        onData: (loadedSuppliers) => {
          setSuppliers(loadedSuppliers);
        },
        onError: (error, path) => {
          handleFirestoreError(error, OperationType.LIST, path);
        },
      }
    );

    const teamRef = collection(db, `users/${dataId}/team`);
    const unsubscribeTeam = onSnapshot(teamRef, (snapshot) => {
      const loadedMembers: OrgMember[] = [];
      snapshot.forEach((entry) => {
        loadedMembers.push(normalizeSalesRep({ ...entry.data(), id: entry.id } as OrgMember, user));
      });
      if (user) {
        const currentUserMember = normalizeSalesRep({
          id: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email || 'Assigned rep',
          orgId: dataId,
          role: 'user',
        }, user);
        if (!loadedMembers.some((member) => member.id === currentUserMember.id)) {
          loadedMembers.unshift(currentUserMember);
        }
      }
      loadedMembers.sort((left, right) => {
        const leftLabel = left.displayName || left.email;
        const rightLabel = right.displayName || right.email;
        return leftLabel.localeCompare(rightLabel);
      });
      setSalesReps(loadedMembers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${dataId}/team`);
    });

    return () => {
      unsubscribeUser();
      unsubscribeCustomers();
      unsubscribeTasks();
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeSuppliers();
      unsubscribeTeam();
    };
  }, [user, isAuthReady]);

  const getDataId = (currentUser: User | null) => resolveOrgId(currentUser, crmAppConfig.sharedOrgId);

  const updateClientLogo = async (logoBase64: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await setDoc(doc(db, 'users', dataId), {
        clientLogo: logoBase64
      }, { merge: true });
    } catch (error) {
      console.error("Error updating client logo:", error);
    }
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setAuthError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Google sign-in failed. Please try email login or check popup permissions.'
      );
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const loginWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (error: any) {
      console.error("Email login failed:", error);
      setAuthError(error.message || "Login failed. Please check your credentials.");
    }
  };

  const signUpWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await createUserWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (error: any) {
      console.error("Signup failed:", error);
      setAuthError(error.message || "Signup failed. Make sure your password is at least 6 characters.");
    }
  };

  const decorateOrderForStorage = (order: Order, dataId: string) => {
    const customer = customers.find((entry) => entry.id === order.customerId);
    const currentRep =
      salesReps.find((entry) => entry.id === order.salesRepId) ||
      salesReps.find((entry) => entry.id === customer?.salesRepId) ||
      (user ? {
        id: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email || 'Assigned rep',
      } : null);
    const items = order.items.map((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      return removeUndefined({
        ...item,
        price: item.price ?? product?.price,
        productName: item.productName ?? product?.name,
        sku: item.sku ?? product?.sku,
      });
    });

    return removeUndefined({
      ...order,
      uid: dataId,
      orgId: dataId,
      customerName: customer?.name,
      customerCompany: customer?.company || customer?.name,
      customerEmail: customer?.email,
      salesRepId: order.salesRepId || customer?.salesRepId || currentRep?.id,
      salesRepName: order.salesRepName || customer?.salesRepName || currentRep?.displayName || 'Assigned rep',
      salesRepEmail: order.salesRepEmail || customer?.salesRepEmail || currentRep?.email,
      items,
    });
  };

  const sendAutomaticOrderStatusNotification = async (order: Order) => {
    const customer = customers.find((entry) => entry.id === order.customerId);
    const customerEmail = order.customerEmail || customer?.email;
    const customerName = order.customerName || customer?.name || order.customerCompany || 'Customer';

    if (!customerEmail) return;

    try {
      await fetch('/api/email/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customerEmail,
          salesRepEmail: order.salesRepEmail,
          customerName,
          orderId: order.id,
          status: order.status,
        }),
      });
    } catch (notificationError) {
      console.error('Failed to send automatic order status email', notificationError);
    }
  };

  const writeCrmCoreRecordsForCustomer = async (customer: Customer, orgId: string) => {
    const normalizedCustomer = normalizeCustomerStatus(customer);
    const account = buildCanonicalAccountFromCustomer(normalizedCustomer, orgId);
    const contact = buildPrimaryContactFromCustomer(normalizedCustomer, orgId);
    const location = buildStubLocationForAccount(account.id, orgId, account.displayName);
    const accountLocationLink = buildPrimaryAccountLocationLink(account.id, location.id, orgId, location.locationType);

    await Promise.all([
      writeCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.accounts, account.id, asFirestorePayload({ ...account })),
      writeCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.contacts, contact.id, asFirestorePayload({ ...contact })),
      writeCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.locations, location.id, asFirestorePayload({ ...location })),
      writeCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.accountLocationLinks, accountLocationLink.id, asFirestorePayload({ ...accountLocationLink })),
    ]);
  };

  const deleteCrmCoreRecordsForCustomer = async (customerId: string, orgId: string) => {
    await Promise.all([
      deleteCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.accounts, customerId),
      deleteCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.contacts, `${customerId}-primary`),
      deleteCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.locations, `${customerId}-hq`),
      deleteCanonicalRecord(db, orgId, CRM_CORE_COLLECTIONS.accountLocationLinks, `${customerId}-${customerId}-hq`),
    ]);
  };

  const addCustomer = async (customer: Customer) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const normalizedCustomer = normalizeCustomerStatus(customer);
    const customerWithUid = removeUndefined({ ...normalizedCustomer, uid: dataId });
    try {
      await Promise.all([
        writeCanonicalRecord(db, dataId, 'customers', customer.id, customerWithUid),
        writeCrmCoreRecordsForCustomer(normalizedCustomer, dataId),
      ]);
      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Customer ${customer.name} was created in CRM.`,
        orgId: dataId,
        recordId: customer.id,
        recordType: 'customer',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/customers/${customer.id}`);
    }
  };

  const addCustomers = async (newCustomers: Customer[]) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      for (const customer of newCustomers) {
        const normalizedCustomer = normalizeCustomerStatus(customer);
        const customerWithUid = removeUndefined({ ...normalizedCustomer, uid: dataId });
        await Promise.all([
          writeCanonicalRecord(db, dataId, 'customers', customer.id, customerWithUid),
          writeCrmCoreRecordsForCustomer(normalizedCustomer, dataId),
        ]);
      }
      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `${newCustomers.length} customers were imported into CRM.`,
        orgId: dataId,
        recordId: `bulk-customers-${Date.now()}`,
        recordType: 'customer-import',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/customers (bulk)`);
    }
  };

  const updateCustomer = async (customer: Customer) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const normalizedCustomer = normalizeCustomerStatus(customer);
    const customerWithUid = removeUndefined({ ...normalizedCustomer, uid: dataId });
    try {
      await Promise.all([
        writeCanonicalRecord(db, dataId, 'customers', customer.id, customerWithUid),
        writeCrmCoreRecordsForCustomer(normalizedCustomer, dataId),
      ]);
      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Customer ${customer.name} was updated in CRM.`,
        orgId: dataId,
        recordId: customer.id,
        recordType: 'customer',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/customers/${customer.id}`);
    }
  };

  const deleteCustomer = async (customerId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await Promise.all([
        deleteCanonicalRecord(db, dataId, 'customers', customerId),
        deleteCrmCoreRecordsForCustomer(customerId, dataId),
      ]);
      await writePlatformEvent(db, {
        action: 'deleted',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Customer ${customerId} was deleted from CRM.`,
        orgId: dataId,
        recordId: customerId,
        recordType: 'customer',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/customers/${customerId}`);
    }
  };
  
  const addOrder = async (order: Order) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const orderWithUid = decorateOrderForStorage(order, dataId);
    try {
      await writeCanonicalRecord(db, dataId, 'orders', order.id, orderWithUid);
      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Order ${order.id} was created in CRM.`,
        orgId: dataId,
        recordId: order.id,
        recordType: 'order',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/orders/${order.id}`);
    }
  };

  const updateOrder = async (order: Order) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const orderWithUid = decorateOrderForStorage(order, dataId);
    try {
      await writeCanonicalRecord(db, dataId, 'orders', order.id, orderWithUid);
      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Order ${order.id} was updated in CRM.`,
        orgId: dataId,
        recordId: order.id,
        recordType: 'order',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/orders/${order.id}`);
    }
  };

  const deleteOrder = async (orderId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await deleteCanonicalRecord(db, dataId, 'orders', orderId);
      await writePlatformEvent(db, {
        action: 'deleted',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Order ${orderId} was deleted from CRM.`,
        orgId: dataId,
        recordId: orderId,
        recordType: 'order',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/orders/${orderId}`);
    }
  };
  
  const addProduct = async (product: Product) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const productWithUid = removeUndefined({ ...product, uid: dataId });
    try {
      await writeCanonicalRecord(db, dataId, 'products', product.id, productWithUid);
      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Product ${product.name} was created in CRM.`,
        orgId: dataId,
        recordId: product.id,
        recordType: 'product',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/products/${product.id}`);
    }
  };

  const updateProduct = async (product: Product) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const productWithUid = removeUndefined({ ...product, uid: dataId });
    try {
      await writeCanonicalRecord(db, dataId, 'products', product.id, productWithUid);
      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Product ${product.name} was updated in CRM.`,
        orgId: dataId,
        recordId: product.id,
        recordType: 'product',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/products/${product.id}`);
    }
  };

  const deleteProduct = async (productId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await deleteCanonicalRecord(db, dataId, 'products', productId);
      await writePlatformEvent(db, {
        action: 'deleted',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Product ${productId} was deleted from CRM.`,
        orgId: dataId,
        recordId: productId,
        recordType: 'product',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/products/${productId}`);
    }
  };
  
  const addSupplier = async (supplier: Supplier) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const supplierWithUid = removeUndefined({ ...supplier, uid: dataId });
    try {
      await writeCanonicalRecord(db, dataId, 'suppliers', supplier.id, supplierWithUid);
      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Supplier ${supplier.name} was created in CRM.`,
        orgId: dataId,
        recordId: supplier.id,
        recordType: 'supplier',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/suppliers/${supplier.id}`);
    }
  };

  const updateSupplier = async (supplier: Supplier) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const supplierWithUid = removeUndefined({ ...supplier, uid: dataId });
    try {
      await writeCanonicalRecord(db, dataId, 'suppliers', supplier.id, supplierWithUid);
      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Supplier ${supplier.name} was updated in CRM.`,
        orgId: dataId,
        recordId: supplier.id,
        recordType: 'supplier',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/suppliers/${supplier.id}`);
    }
  };

  const deleteSupplier = async (supplierId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await deleteCanonicalRecord(db, dataId, 'suppliers', supplierId);
      await writePlatformEvent(db, {
        action: 'deleted',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Supplier ${supplierId} was deleted from CRM.`,
        orgId: dataId,
        recordId: supplierId,
        recordType: 'supplier',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/suppliers/${supplierId}`);
    }
  };

  const addTask = async (task: Task) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const taskWithUid = removeUndefined({ ...task, uid: dataId });
    try {
      await writeCanonicalRecord(db, dataId, 'tasks', task.id, taskWithUid);
      await writePlatformEvent(db, {
        action: 'created',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Task ${task.title} was created in CRM.`,
        orgId: dataId,
        recordId: task.id,
        recordType: 'task',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/tasks/${task.id}`);
    }
  };

  const updateTask = async (task: Task) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const taskWithUid = removeUndefined({ ...task, uid: dataId });
    try {
      await writeCanonicalRecord(db, dataId, 'tasks', task.id, taskWithUid);
      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: `Task ${task.title} was updated in CRM.`,
        orgId: dataId,
        recordId: task.id,
        recordType: 'task',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/tasks/${task.id}`);
    }
  };

  const seedSharedTestOrg = async () => {
    const dataId = getDataId(user);
    if (!dataId || isSeeding) return;

    setIsSeeding(true);
    setError(null);

    try {
      const collectionNames = ['customers', 'orders', 'products', 'suppliers', 'tasks', CRM_CORE_COLLECTIONS.accounts, CRM_CORE_COLLECTIONS.contacts, CRM_CORE_COLLECTIONS.locations, CRM_CORE_COLLECTIONS.accountLocationLinks];

      for (const collectionName of collectionNames) {
        const deleteBatch = writeBatch(db);
        const legacySnapshot = await getDocs(collection(db, getLegacyCollectionPath(dataId, collectionName)));
        legacySnapshot.docs.forEach((entry) => deleteBatch.delete(entry.ref));
        const orgSnapshot = await getDocs(collection(db, getOrgCollectionPath(dataId, collectionName)));
        orgSnapshot.docs.forEach((entry) => deleteBatch.delete(entry.ref));
        if (legacySnapshot.empty && orgSnapshot.empty) continue;
        await deleteBatch.commit();
      }

      const seedBatch = writeBatch(db);

      initialCustomers.forEach((customer) => {
        const normalizedCustomer = normalizeCustomerStatus(customer);
        const payload = removeUndefined({ ...normalizedCustomer, uid: dataId });
        seedCanonicalRecord(seedBatch, db, dataId, 'customers', customer.id, payload);
        seedCanonicalRecord(seedBatch, db, dataId, CRM_CORE_COLLECTIONS.accounts, customer.id, asFirestorePayload({ ...buildCanonicalAccountFromCustomer(normalizedCustomer, dataId) }));
        seedCanonicalRecord(seedBatch, db, dataId, CRM_CORE_COLLECTIONS.contacts, `${customer.id}-primary`, asFirestorePayload({ ...buildPrimaryContactFromCustomer(normalizedCustomer, dataId) }));
        const location = buildStubLocationForAccount(customer.id, dataId, normalizedCustomer.company || normalizedCustomer.name);
        seedCanonicalRecord(seedBatch, db, dataId, CRM_CORE_COLLECTIONS.locations, location.id, asFirestorePayload({ ...location }));
        seedCanonicalRecord(seedBatch, db, dataId, CRM_CORE_COLLECTIONS.accountLocationLinks, `${customer.id}-${location.id}`, asFirestorePayload({ ...buildPrimaryAccountLocationLink(customer.id, location.id, dataId, location.locationType) }));
      });

      initialProducts.forEach((product) => {
        const payload = removeUndefined({ ...product, uid: dataId });
        seedCanonicalRecord(seedBatch, db, dataId, 'products', product.id, payload);
      });

      initialSuppliers.forEach((supplier) => {
        const payload = removeUndefined({ ...supplier, uid: dataId });
        seedCanonicalRecord(seedBatch, db, dataId, 'suppliers', supplier.id, payload);
      });

      initialTasks.forEach((task) => {
        const payload = removeUndefined({ ...task, uid: dataId });
        seedCanonicalRecord(seedBatch, db, dataId, 'tasks', task.id, payload);
      });

      initialOrders.forEach((order) => {
        const payload = decorateOrderForStorage(order, dataId);
        seedCanonicalRecord(seedBatch, db, dataId, 'orders', order.id, payload);
      });

      seedBatch.set(doc(db, 'users', dataId), { orgId: dataId }, { merge: true });

      if (user) {
        seedBatch.set(
          doc(db, 'orgs', dataId),
          buildOrgBootstrapRecord(user, dataId),
          { merge: true }
        );

        seedBatch.set(
          doc(db, `orgs/${dataId}/members`, user.uid),
          buildOrgMemberBootstrapRecord(user, dataId),
          { merge: true }
        );
      }

      await seedBatch.commit();
      await writePlatformEvent(db, {
        action: 'seeded',
        actorEmail: user?.email,
        actorUserId: user?.uid,
        description: 'The shared CRM workspace was seeded with sample data.',
        orgId: dataId,
        recordId: 'shared-test-org',
        recordType: 'workspace',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId} (seed shared test org)`);
      throw err;
    } finally {
      setIsSeeding(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        <div className="text-slate-500 font-medium">Initializing application...</div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-slate-400 mt-4"
          onClick={() => window.location.reload()}
        >
          Taking too long? Click here to refresh
        </Button>
        <div className="text-[10px] text-slate-400 mt-8 px-6 text-center">
          Mobile browsers may block login cookies in the preview window. 
          <br />
          If stuck, try opening the <strong>app URL</strong> directly.
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md w-full text-center space-y-6 mb-8">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign In Required</h1>
          <p className="text-slate-500">Please sign in to access your workspace.</p>
          
          {emailAuthMode === 'none' ? (
            <div className="space-y-4">
              <Button onClick={login} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                Sign in with Google
              </Button>
              {authError ? <p className="text-xs text-rose-600">{authError}</p> : null}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200"></span>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-500">Or use email</span>
                </div>
              </div>
              <Button 
                variant="outline" 
                onClick={() => setEmailAuthMode('login')}
                className="w-full border-slate-200"
              >
                Sign in with Email
              </Button>
            </div>
          ) : (
            <form onSubmit={emailAuthMode === 'login' ? loginWithEmail : signUpWithEmail} className="space-y-4 text-left">
              <div className="space-y-2">
                <Label htmlFor="auth-email">Email</Label>
                <Input 
                  id="auth-email" 
                  type="email" 
                  autoFocus
                  required 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-password">Password</Label>
                <Input 
                  id="auth-password" 
                  type="password" 
                  required 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                />
              </div>
              
              {authError && <p className="text-xs text-red-600 mt-1">{authError}</p>}
              
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                {emailAuthMode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
              
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  type="button" 
                  className="text-xs text-emerald-600 hover:underline text-center"
                  onClick={() => setEmailAuthMode(emailAuthMode === 'login' ? 'signup' : 'login')}
                >
                  {emailAuthMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
                <button 
                  type="button" 
                  className="text-xs text-slate-500 hover:underline text-center"
                  onClick={() => {
                    setEmailAuthMode('none');
                    setAuthError(null);
                  }}
                >
                  Back to Google login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      user,
      clientLogo,
      salesReps,
      customers, orders, products, suppliers, tasks,
      addCustomer, addCustomers, updateCustomer, deleteCustomer,
      addOrder, updateOrder, deleteOrder,
      addProduct, updateProduct, deleteProduct, setProducts,
      addSupplier, updateSupplier, deleteSupplier,
      addTask, updateTask,
      updateClientLogo,
      seedSharedTestOrg,
      login, logout,
      error
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
