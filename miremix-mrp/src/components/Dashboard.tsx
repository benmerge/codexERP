import { useState, useEffect } from 'react';
import { ShoppingBag, AlertTriangle, ExternalLink, Scale, History, Loader2, CheckCircle2, TrendingUp, Package } from 'lucide-react';
import { collection, onSnapshot, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { crmService, type CRMOrder } from '../services/crmService';
import { type Ingredient, type Recipe } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

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

  useEffect(() => {
    if (!locationId) return;

    // Inventory listener
    const unsubInv = onSnapshot(query(collection(db, 'inventory')), (snapshot) => {
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Ingredient[];
      items = items.filter(i => i.locationId === locationId || (!i.locationId && locationId === 'default'));
      setInventory(items);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'inventory');
    });

    // Recipes listener (for most used ingredient calculation)
    const unsubRec = onSnapshot(query(collection(db, 'recipes')), (snapshot) => {
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipe[];
      items = items.filter(i => i.locationId === locationId || (!i.locationId && locationId === 'default'));
      setRecipes(items);
    });

    // Logs listener for usage metrics
    const unsubLogs = onSnapshot(query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(150)), (snapshot) => {
      let logItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      logItems = logItems.filter(l => l.locationId === locationId || (!l.locationId && locationId === 'default'));
      // enforce manual slice to 50 max
      setLogs(logItems.slice(0, 50));
    });

    // CRM Orders listener
    setSyncingOrders(true);
    const unsubOrders = crmService.subscribeToOpenOrders((newOrders) => {
      setOrders(newOrders);
      setSyncingOrders(false);
    });

    return () => {
      unsubInv();
      unsubRec();
      unsubLogs();
      unsubOrders();
    };
  }, [locationId]);

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
    (i.category === 'Major' && i.quantityOnHand < 20) || 
    (i.category === 'Minor' && i.quantityOnHand < 5)
  );

  // 2. Finished Goods On Hand
  const finishedGoods = inventory.filter(i => i.category === 'Finished');

  // 3. Simple most used ingredients calculation based on recent logs
  const usageMap: Record<string, number> = {};
  logs.forEach(log => {
    const recipe = recipes.find(r => r.name === log.recipeName);
    if (recipe) {
      recipe.ingredients.forEach(ing => {
        usageMap[ing.ingredientId] = (usageMap[ing.ingredientId] || 0) + (ing.amount * log.multiplier);
      });
    }
  });

  const topUsedIngredients = Object.entries(usageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amount]) => ({
      ...inventory.find(i => i.id === id),
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Production Dashboard</h2>
          <p className="text-[13px] text-zinc-500 mt-1">Real-time fulfillment & inventory status</p>
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
        <div className="lg:col-span-8 space-y-6">
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
                <div key={order.id} className="technical-card p-6 flex flex-col md:flex-row md:items-center gap-8 group">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                      <h4 className="text-[17px] font-bold text-zinc-900 leading-tight">{order.customerName}</h4>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-zinc-400 font-mono">
                      <span>REF: {order.id}</span>
                      <span className="h-1 w-1 rounded-full bg-zinc-200" />
                      <span>{order.date}</span>
                    </div>
                  </div>
                  
                  <div className="min-w-[200px] max-w-[300px]">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2 tracking-wider">Inventory Requirements</p>
                    <p className="text-[12px] text-zinc-600 line-clamp-2 leading-relaxed">
                      {Array.isArray(order.items) 
                        ? order.items.map((i: any) => `${i.quantity || 1}x ${i.name || i.productName}`).join(', ')
                        : order.items?.toString()}
                    </p>
                  </div>

                  <div className="flex shrink-0">
                    <button 
                      onClick={() => handleShipOrder(order.id, order.rawId)}
                      className="bg-zinc-900 border border-zinc-800 hover:bg-black text-white px-8 py-3.5 rounded-lg text-[12px] font-bold transition-all shadow-lg shadow-zinc-200 active:translate-y-px"
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
          <section className="technical-card overflow-hidden">
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
