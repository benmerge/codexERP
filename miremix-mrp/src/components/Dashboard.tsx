import { useState, useEffect, useRef } from 'react';
import { ShoppingBag, AlertTriangle, ExternalLink, Scale, History, Loader2, CheckCircle2, TrendingUp, Package } from 'lucide-react';
import { collection, onSnapshot, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { crmService, type CRMOrder } from '../services/crmService';
import { type Ingredient, type Recipe } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { normalizeIngredient } from '../lib/inventoryCategories';
import { subscribeToPlatformCollection } from '../lib/platformData';

interface BatchLog {
  id: string;
  recipeName: string;
  multiplier: number;
  timestamp: string;
}

export function Dashboard({ locationId }: { locationId: string }) {
  const [orders, setOrders] = useState<CRMOrder[]>([]);
  const [inventory, setInventory] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [logs, setLogs] = useState<BatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [recipesReady, setRecipesReady] = useState(false);
  const [ordersReady, setOrdersReady] = useState(false);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const alertsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!locationId) return;

    setLoading(true);
    setInventoryReady(false);
    setRecipesReady(false);
    setOrdersReady(false);
    setStatus(null);

    // Inventory listener
    const unsubInv = subscribeToPlatformCollection<Ingredient>({
      collectionName: 'inventory',
      mapDoc: (snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Ingredient),
      onData: (nextItems) => {
        let items = nextItems;
      items = items.map(normalizeIngredient);
      if (locationId === 'all') {
        const grouped = new Map<string, Ingredient>();
        items.forEach((item) => {
          const key = `${item.name}__${item.category}__${item.unit}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.quantityOnHand += item.quantityOnHand || 0;
          } else {
            grouped.set(key, { ...item, id: key, locationId: 'all' });
          }
        });
        items = Array.from(grouped.values());
      } else {
        items = items.filter(i => i.locationId === locationId || (!i.locationId && locationId === 'default'));
      }
      setInventory(items);
      setInventoryReady(true);
      },
      onError: (err) => {
        console.error(err);
        setInventory([]);
        setInventoryReady(true);
        setStatus({ type: 'error', msg: 'Inventory feed could not be loaded for this workspace.' });
        try {
          handleFirestoreError(err, OperationType.LIST, 'inventory');
        } catch (loggedError) {
          console.error(loggedError);
        }
      },
    });

    // Recipes listener (for most used ingredient calculation)
    const unsubRec = subscribeToPlatformCollection<Recipe>({
      collectionName: 'recipes',
      mapDoc: (snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Recipe),
      onData: (nextItems) => {
        let items = nextItems;
      items = items.filter((i) =>
        locationId === 'all'
          ? true
          : i.locationId === locationId || !i.locationId || (!i.locationId && locationId === 'default')
      );
      setRecipes(items);
      setRecipesReady(true);
      },
      onError: (err) => {
        handleFirestoreError(err, OperationType.LIST, 'recipes');
        setRecipes([]);
        setRecipesReady(true);
      },
    });

    // Logs listener for usage metrics
    const unsubLogs = onSnapshot(query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(150)), (snapshot) => {
      let logItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      logItems = logItems.filter((l) =>
        locationId === 'all'
          ? true
          : l.locationId === locationId || (!l.locationId && locationId === 'default')
      );
      // enforce manual slice to 50 max
      setLogs(logItems.slice(0, 50));
    });

    // CRM Orders listener
    setSyncingOrders(true);
    const unsubOrders = crmService.subscribeToOpenOrders(
      (newOrders) => {
        setOrders(newOrders);
        setSyncingOrders(false);
        setOrdersReady(true);
      },
      (err) => {
        console.error(err);
        setSyncingOrders(false);
        setStatus((existing) => existing ?? { type: 'error', msg: 'CRM order sync is unavailable right now.' });
        setOrdersReady(true);
      }
    );

    const ordersSafetyTimer = window.setTimeout(() => {
      setOrdersReady((current) => {
        if (!current) {
          setSyncingOrders(false);
          setStatus((existing) => existing ?? { type: 'error', msg: 'CRM order sync is unavailable right now.' });
        }
        return true;
      });
    }, 4000);

    return () => {
      unsubInv();
      unsubRec();
      unsubLogs();
      unsubOrders();
      window.clearTimeout(ordersSafetyTimer);
    };
  }, [locationId]);

  useEffect(() => {
    if (inventoryReady && recipesReady && ordersReady) {
      setLoading(false);
    }
  }, [inventoryReady, recipesReady, ordersReady]);

  const handleShipOrder = async (orderId: string, rawId?: string) => {
    const targetId = rawId || orderId;
    const success = await crmService.markAsShipped(targetId);
    if (success) {
      setStatus({ type: 'success', msg: `Order ${orderId} marked as Shipped in CRM.` });
      setTimeout(() => setStatus(null), 5000);
    } else {
      setStatus({ type: 'error', msg: `Failed to update CRM status for ${orderId}.` });
    }
  };

  // 1. Low Inventory Alerts (below 20kg for Majors, 5kg for Minors)
  const lowStockItems = inventory.filter(i => 
    (i.category === 'Major Ingredient' && i.quantityOnHand < 20) || 
    (i.category === 'Minor Ingredient' && i.quantityOnHand < 5)
  );

  // 2. Finished Goods On Hand
  const finishedGoods = inventory.filter(i => i.category === 'Finished Good');

  // 3. Simple most used ingredients calculation based on recent logs
  const usageMap: Record<string, number> = {};
  logs.forEach(log => {
    const recipe = recipes.find(r => r.name === log.recipeName);
    if (recipe) {
      recipe.ingredients.forEach(ing => {
        const usageKey = ing.ingredientName || ing.ingredientId;
        usageMap[usageKey] = (usageMap[usageKey] || 0) + (ing.amount * log.multiplier);
      });
    }
  });

  const topUsedIngredients = Object.entries(usageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([idOrName, amount]) => ({
      ...inventory.find(i => i.category !== 'Finished Good' && (i.id === idOrName || i.name === idOrName)),
      usage: amount
    }))
    .filter(i => i.name);

  if (loading) return (
    <div className="h-[400px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-zinc-400 font-medium animate-pulse">
        <Loader2 className="h-6 w-6 animate-spin" />
        Syncing Production Data...
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/70 px-6 py-6 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.32)] backdrop-blur xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mrp-panel-label">Today&apos;s Control Board</div>
          <h2 className="mt-2 font-display text-3xl font-bold text-zinc-900 tracking-tight">Production Dashboard</h2>
          <p className="mt-2 text-[13px] text-zinc-500">Real-time fulfillment, queue pressure, and inventory status in one view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            {orders.length} Open Orders
          </button>
          <button
            type="button"
            onClick={() => alertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-600 transition-colors hover:bg-zinc-100"
          >
            {lowStockItems.length} Stock Alerts
          </button>
        </div>
      </div>

      {status && (
        <div className={`p-3 rounded border text-[13px] flex items-center gap-3 animate-in slide-in-from-top-2 ${
          status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {status.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Open CRM Orders */}
        <div ref={queueRef} className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <ShoppingBag className="h-3.5 w-3.5" /> Pending Queue
            </h3>
            {syncingOrders && <Loader2 className="h-3 w-3 text-accent animate-spin" />}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {orders.length === 0 ? (
              <div className="p-20 text-center bg-white border border-dashed border-zinc-200 rounded-lg text-zinc-400 italic text-sm">
                Queue empty. No active orders pending in CRM.
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="technical-card p-6 flex flex-col gap-8 border-l-4 border-l-amber-400 md:flex-row md:items-center group">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                      <h4 className="font-display text-[22px] font-bold text-zinc-900 leading-tight">{order.customerName}</h4>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-zinc-400 font-mono">
                      <span>REF: {order.id}</span>
                      <span className="h-1 w-1 rounded-full bg-zinc-200" />
                      <span>{order.date}</span>
                    </div>
                  </div>
                  
                  <div className="min-w-[220px] max-w-[320px]">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2 tracking-wider">Production Loadout</p>
                    <p className="text-[12px] text-zinc-600 line-clamp-2 leading-relaxed">
                      {Array.isArray(order.items) 
                        ? order.items.map((i: any) => `${i.quantity || 1}x ${i.name || i.productName || i.sku || 'Item'}`).join(', ')
                        : order.items?.toString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden xl:flex flex-col rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 text-right">
                      <span className="mrp-panel-label text-zinc-400">Status</span>
                      <span className="mt-1 text-sm font-semibold text-zinc-700">Ready to ship</span>
                    </div>
                    <button 
                      onClick={() => handleShipOrder(order.id, order.rawId)}
                      className="rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-black text-white px-8 py-3.5 text-[12px] font-bold tracking-[0.18em] uppercase transition-all shadow-lg shadow-zinc-200 active:translate-y-px"
                    >
                      MARK SHIPPED
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Inventory Side Rail */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Inventory Alerts */}
          <section ref={alertsRef} className="technical-card overflow-hidden">
            <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-accent" /> Logistics Alerts
              </h3>
            </div>
            <div className="p-4 space-y-0.5">
              {lowStockItems.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-[12px] text-emerald-600 font-medium italic">All ingredient levels secure</p>
                </div>
              ) : (
                lowStockItems.map(item => (
                  <div key={item.id} className="data-row flex justify-between items-center py-2.5 px-2 -mx-2 rounded hover:bg-zinc-50">
                    <span className="text-[13px] font-medium text-zinc-800">{item.name}</span>
                    <span className="text-[13px] font-mono font-bold text-red-600">
                      {item.quantityOnHand.toFixed(1)} <span className="text-[10px] text-zinc-400 font-sans uppercase">{item.unit}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Product Stock */}
          <section className="technical-card overflow-hidden">
            <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-zinc-400" /> Finished Goods On-Hand
              </h3>
            </div>
            <div className="p-4 space-y-0.5">
              {finishedGoods.length === 0 ? (
                <p className="text-[11px] text-zinc-400 italic text-center py-4">No SKU data available.</p>
              ) : (
                finishedGoods.map(fg => (
                  <div key={fg.id} className="data-row flex justify-between items-center py-2.5 px-2 -mx-2 rounded hover:bg-zinc-50">
                    <span className="text-[13px] font-medium text-zinc-700">{fg.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-mono font-bold text-zinc-900">{fg.quantityOnHand}</span>
                      <span className="text-[10px] text-zinc-400 uppercase font-sans font-bold">Bags</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Usage Trends */}
          <section className="bg-zinc-900 rounded-lg p-8 text-white shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-8 border-b border-zinc-800 pb-3">
              <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Velocity Metrics</h3>
              <TrendingUp className="h-4 w-4 text-zinc-700" />
            </div>
            <div className="space-y-6">
              {topUsedIngredients.length === 0 ? (
                <p className="text-[11px] text-zinc-600 italic py-4">Usage data initializing...</p>
              ) : (
                topUsedIngredients.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between text-[12px]">
                      <span className="font-medium text-zinc-300">{item.name}</span>
                      <span className="text-zinc-500 font-mono">{(item.usage/1000).toFixed(1)}kg</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent transition-all duration-1000" 
                        style={{ width: `${Math.min(100, (item.usage / (topUsedIngredients[0].usage || 1)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
