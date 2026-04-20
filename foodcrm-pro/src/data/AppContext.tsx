import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Customer, Order, Product, Supplier, Task, InventoryStatus, OrgMember } from '../types';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, onSnapshot, query, deleteDoc, getDocFromServer, getDocs, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import mergeLogo from '../assets/merge-impact-logo.png';
import { crmAppConfig } from '../config';
import { initialCustomers, initialOrders, initialProducts, initialSuppliers, initialTasks } from './mockData';

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

const SHARED_CRM_DOMAINS = ['40centurygrain.com', '40centurygrain.earth', 'mergeimpact.com'];

const sanitizeSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const getEmailDomain = (email?: string | null) => {
  if (!email || !email.includes('@')) return null;
  return email.split('@')[1]?.toLowerCase() ?? null;
};

const resolveOrgId = (currentUser: User | null) => {
  if (!currentUser?.uid) return null;

  const domain = getEmailDomain(currentUser.email);
  if (domain && SHARED_CRM_DOMAINS.includes(domain)) {
    return crmAppConfig.sharedOrgId;
  }

  if (domain) {
    return `org_${sanitizeSegment(domain)}`;
  }

  return `org_${sanitizeSegment(currentUser.uid)}`;
};

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
    humanizeRepLabel(member.id) ||
    'Assigned rep';

  return {
    ...member,
    email,
    displayName,
  };
};

const normalizeCustomerStatus = (customer: Customer): Customer => ({
  ...customer,
  isProspect: customer.pipelineStage !== 'Closed Won',
});

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
            await setDoc(doc(db, 'users', currentUser.uid), {
              email: currentUser.email,
              displayName: currentUser.displayName || currentUser.email,
              role: currentUser.email === 'ben@mergeimpact.com' ? 'admin' : 'user',
              orgId: dataId
            }, { merge: true });

            await setDoc(doc(db, `users/${dataId}/team`, currentUser.uid), {
              email: currentUser.email,
              displayName: currentUser.displayName || currentUser.email,
              role: currentUser.email === 'ben@mergeimpact.com' ? 'admin' : 'user',
              orgId: dataId,
            }, { merge: true });
          } catch (err) {
            console.error("Error bootstrapping user/team membership:", err);
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

    const customersRef = collection(db, `users/${dataId}/customers`);
    const unsubscribeCustomers = onSnapshot(customersRef, (snapshot) => {
      const loadedCustomers: Customer[] = [];
      snapshot.forEach(doc => {
        loadedCustomers.push({ ...doc.data(), id: doc.id } as Customer);
      });
      setCustomers(loadedCustomers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${dataId}/customers`);
    });

    const tasksRef = collection(db, `users/${dataId}/tasks`);
    const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
      const loadedTasks: Task[] = [];
      snapshot.forEach(doc => {
        loadedTasks.push({ ...doc.data(), id: doc.id } as Task);
      });
      setTasks(loadedTasks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${dataId}/tasks`);
    });

    const ordersRef = collection(db, `users/${dataId}/orders`);
    const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
      const loadedOrders: Order[] = [];
      snapshot.forEach(doc => {
        loadedOrders.push({ ...doc.data(), id: doc.id } as Order);
      });

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${dataId}/orders`);
    });

    const productsRef = collection(db, `users/${dataId}/products`);
    const unsubscribeProducts = onSnapshot(productsRef, (snapshot) => {
      const loadedProducts: Product[] = [];
      snapshot.forEach(doc => {
        loadedProducts.push({ ...doc.data(), id: doc.id } as Product);
      });
      setProducts(loadedProducts);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${dataId}/products`);
    });

    const suppliersRef = collection(db, `users/${dataId}/suppliers`);
    const unsubscribeSuppliers = onSnapshot(suppliersRef, (snapshot) => {
      const loadedSuppliers: Supplier[] = [];
      snapshot.forEach(doc => {
        loadedSuppliers.push({ ...doc.data(), id: doc.id } as Supplier);
      });
      setSuppliers(loadedSuppliers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${dataId}/suppliers`);
    });

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

  const getDataId = (currentUser: User | null) => resolveOrgId(currentUser);

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
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
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

  const removeUndefined = (obj: any) => {
    return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
  };

  const decorateOrderForStorage = (order: Order, dataId: string) => {
    const customer = customers.find((entry) => entry.id === order.customerId);
    const currentRep =
      salesReps.find((entry) => entry.id === order.salesRepId) ||
      salesReps.find((entry) => entry.id === customer?.salesRepId) ||
      (user ? {
        id: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email || 'Sales Rep',
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
      customerName: customer?.name,
      customerCompany: customer?.company || customer?.name,
      customerEmail: customer?.email,
      salesRepId: order.salesRepId || customer?.salesRepId || currentRep?.id,
      salesRepName: order.salesRepName || customer?.salesRepName || currentRep?.displayName,
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

  const addCustomer = async (customer: Customer) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const customerWithUid = removeUndefined({ ...normalizeCustomerStatus(customer), uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/customers`, customer.id), customerWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/customers/${customer.id}`);
    }
  };

  const addCustomers = async (newCustomers: Customer[]) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      for (const customer of newCustomers) {
        const customerWithUid = removeUndefined({ ...normalizeCustomerStatus(customer), uid: dataId });
        await setDoc(doc(db, `users/${dataId}/customers`, customer.id), customerWithUid);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/customers (bulk)`);
    }
  };

  const updateCustomer = async (customer: Customer) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const customerWithUid = removeUndefined({ ...normalizeCustomerStatus(customer), uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/customers`, customer.id), customerWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/customers/${customer.id}`);
    }
  };

  const deleteCustomer = async (customerId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await deleteDoc(doc(db, `users/${dataId}/customers`, customerId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/customers/${customerId}`);
    }
  };
  
  const addOrder = async (order: Order) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const orderWithUid = decorateOrderForStorage(order, dataId);
    try {
      await setDoc(doc(db, `users/${dataId}/orders`, order.id), orderWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/orders/${order.id}`);
    }
  };

  const updateOrder = async (order: Order) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const orderWithUid = decorateOrderForStorage(order, dataId);
    try {
      await setDoc(doc(db, `users/${dataId}/orders`, order.id), orderWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/orders/${order.id}`);
    }
  };

  const deleteOrder = async (orderId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await deleteDoc(doc(db, `users/${dataId}/orders`, orderId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/orders/${orderId}`);
    }
  };
  
  const addProduct = async (product: Product) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const productWithUid = removeUndefined({ ...product, uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/products`, product.id), productWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/products/${product.id}`);
    }
  };

  const updateProduct = async (product: Product) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const productWithUid = removeUndefined({ ...product, uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/products`, product.id), productWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/products/${product.id}`);
    }
  };

  const deleteProduct = async (productId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await deleteDoc(doc(db, `users/${dataId}/products`, productId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/products/${productId}`);
    }
  };
  
  const addSupplier = async (supplier: Supplier) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const supplierWithUid = removeUndefined({ ...supplier, uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/suppliers`, supplier.id), supplierWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/suppliers/${supplier.id}`);
    }
  };

  const updateSupplier = async (supplier: Supplier) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const supplierWithUid = removeUndefined({ ...supplier, uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/suppliers`, supplier.id), supplierWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/suppliers/${supplier.id}`);
    }
  };

  const deleteSupplier = async (supplierId: string) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    try {
      await deleteDoc(doc(db, `users/${dataId}/suppliers`, supplierId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${dataId}/suppliers/${supplierId}`);
    }
  };

  const addTask = async (task: Task) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const taskWithUid = removeUndefined({ ...task, uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/tasks`, task.id), taskWithUid);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${dataId}/tasks/${task.id}`);
    }
  };

  const updateTask = async (task: Task) => {
    const dataId = getDataId(user);
    if (!dataId) return;
    const taskWithUid = removeUndefined({ ...task, uid: dataId });
    try {
      await setDoc(doc(db, `users/${dataId}/tasks`, task.id), taskWithUid);
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
      const collectionNames = ['customers', 'orders', 'products', 'suppliers', 'tasks'];

      for (const collectionName of collectionNames) {
        const snapshot = await getDocs(collection(db, `users/${dataId}/${collectionName}`));
        if (snapshot.empty) continue;

        const deleteBatch = writeBatch(db);
        snapshot.docs.forEach((entry) => deleteBatch.delete(entry.ref));
        await deleteBatch.commit();
      }

      const seedBatch = writeBatch(db);

      initialCustomers.forEach((customer) => {
        seedBatch.set(
          doc(db, `users/${dataId}/customers`, customer.id),
          removeUndefined({ ...customer, uid: dataId })
        );
      });

      initialProducts.forEach((product) => {
        seedBatch.set(
          doc(db, `users/${dataId}/products`, product.id),
          removeUndefined({ ...product, uid: dataId })
        );
      });

      initialSuppliers.forEach((supplier) => {
        seedBatch.set(
          doc(db, `users/${dataId}/suppliers`, supplier.id),
          removeUndefined({ ...supplier, uid: dataId })
        );
      });

      initialTasks.forEach((task) => {
        seedBatch.set(
          doc(db, `users/${dataId}/tasks`, task.id),
          removeUndefined({ ...task, uid: dataId })
        );
      });

      initialOrders.forEach((order) => {
        seedBatch.set(
          doc(db, `users/${dataId}/orders`, order.id),
          decorateOrderForStorage(order, dataId)
        );
      });

      seedBatch.set(doc(db, 'users', dataId), { orgId: dataId }, { merge: true });

      await seedBatch.commit();
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
        
        <div className="flex flex-col items-center justify-center opacity-60 hover:opacity-100 transition-opacity">
          <span className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">Powered by</span>
          <div className="flex items-center gap-2 text-slate-700">
            <img src={mergeLogo} alt="Merge Impact" className="w-8 h-8 object-contain" onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }} />
            <div className="hidden w-8 h-8 rounded-full border-2 border-current flex items-center justify-center relative">
              <div className="absolute bottom-0 w-5 h-4 bg-current rounded-t-full" style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 0, 50% 50%, 0 0)' }}></div>
            </div>
            <span className="text-lg font-bold tracking-tight">Merge Impact</span>
          </div>
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