import { useState, useEffect } from 'react';
import { type Recipe, type Ingredient } from '../types';
import { CheckCircle2, AlertTriangle, Scale, ArrowRight, Loader2, History, ShoppingBag, ExternalLink } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { normalizeIngredient } from '../lib/inventoryCategories';
import { crmService, type CRMOrder } from '../services/crmService';

const convertMeasurement = (amount: number, fromUnit: string, toUnit: string) => {
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();

  if (from === to) return amount;

  const weightToGrams: Record<string, number> = { g: 1, kg: 1000 };
  const volumeToMilliliters: Record<string, number> = { ml: 1, l: 1000 };

  if (from in weightToGrams && to in weightToGrams) {
    return (amount * weightToGrams[from]) / weightToGrams[to];
  }

  if (from in volumeToMilliliters && to in volumeToMilliliters) {
    return (amount * volumeToMilliliters[from]) / volumeToMilliliters[to];
  }

  return amount;
};

export function BatchMixBuilder({ locationId }: { locationId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventory, setInventory] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [batchMultiplier, setBatchMultiplier] = useState<number>(1);
  const [isDeducting, setIsDeducting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  useEffect(() => {
    if (!locationId) return;

    const unsubInv = onSnapshot(query(collection(db, 'inventory')), (snapshot) => {
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Ingredient[];
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
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'inventory');
    });

    const unsubRec = onSnapshot(query(collection(db, 'recipes')), (snapshot) => {
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipe[];
      items = items.filter((i) =>
        locationId === 'all'
          ? true
          : i.locationId === locationId || !i.locationId || (!i.locationId && locationId === 'default')
      );
      setRecipes(items);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'recipes');
      setLoading(false);
    });

    return () => { unsubInv(); unsubRec(); };
  }, [locationId]);

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId);
  const selectedRecipeName = selectedRecipe?.finishedGoodName || selectedRecipe?.name || 'Selected recipe';

  const requirements = selectedRecipe ? selectedRecipe.ingredients.map(ing => {
    const item = inventory.find(i => i.id === ing.ingredientId || (!!ing.ingredientName && i.name === ing.ingredientName));
    const recipeUnit = ing.unit || 'g';
    const inventoryUnit = item?.unit || recipeUnit;
    const requiredInInvUnit = convertMeasurement(ing.amount * batchMultiplier, recipeUnit, inventoryUnit);
    const onHand = item?.quantityOnHand || 0;
    const missing = Math.max(0, requiredInInvUnit - onHand);
    
    return {
      ingredientId: ing.ingredientId,
      inventoryDocId: item?.id,
      name: item?.name || ing.ingredientName || 'Unknown',
      recipeUnit,
      unitInInv: inventoryUnit,
      requiredInInvUnit,
      onHand,
      missing,
    };
  }) : [];

  const canFulfill = requirements.length > 0 && requirements.every(r => r.missing === 0);
  const canCommitBatch = canFulfill && locationId !== 'all';

  const handleDeduct = async () => {
    if (!canCommitBatch || !selectedRecipe) return;
    setIsDeducting(true);
    setStatus(null);

    try {
      const batch = writeBatch(db);
      
      // Deduct Ingredients
      requirements.forEach(req => {
        if (!req.inventoryDocId) return;
        const docRef = doc(db, 'inventory', req.inventoryDocId);
        batch.update(docRef, {
          quantityOnHand: Number((req.onHand - req.requiredInInvUnit).toFixed(4)),
          lastUpdated: new Date().toISOString()
        });
      });

      // Increment Finished Good
      const targetFinishedGood = inventory.find((i) =>
        i.category === 'Finished Good' &&
        (i.id === selectedRecipe.finishedGoodId || i.name === selectedRecipeName)
      );
      if (targetFinishedGood && targetFinishedGood.id) {
        const fgRef = doc(db, 'inventory', targetFinishedGood.id);
        batch.update(fgRef, {
          quantityOnHand: Number(((targetFinishedGood.quantityOnHand || 0) + batchMultiplier).toFixed(4)),
          lastUpdated: new Date().toISOString()
        });
      }

      await addDoc(collection(db, 'logs'), {
        recipeName: selectedRecipeName,
        multiplier: batchMultiplier,
        timestamp: new Date().toISOString(),
        locationId,
        userName: auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown User'
      });

      await batch.commit();
      setStatus({ type: 'success', msg: `Successfully logged batch for ${selectedRecipeName}` });
      setTimeout(() => setStatus(null), 5000);
      setBatchMultiplier(1);
    } catch (err) {
      console.error('Batch error:', err);
      handleFirestoreError(err, OperationType.WRITE, 'batch/sync');
    } finally {
      setIsDeducting(false);
    }
  };

  if (loading) return (
    <div className="h-[400px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-slate-400 font-bold uppercase tracking-widest italic animate-pulse">
        <Loader2 className="h-8 w-8 animate-spin" />
        Initializing Batch Builder...
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-zinc-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Batch Mix Builder</h2>
          <p className="text-[13px] text-zinc-500 mt-1">Scale production formulas and reconcile inventory</p>
        </div>
        <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 px-4 py-2 rounded">
           <Scale className="h-4 w-4 text-zinc-400" />
           <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Precision Mixer v2</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Main Composition Table */}
        <div className="xl:col-span-8 space-y-4">
          <div className="technical-card overflow-hidden">
            <div className="bg-zinc-50 border-b border-zinc-100 px-6 py-4 flex justify-between items-center">
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Production Composition</h3>
              {selectedRecipe && (
                 <span className="text-[11px] font-mono text-zinc-400">FORMULA: {selectedRecipe.id?.slice(0, 8)}</span>
              )}
            </div>
            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-4 col-header">Ingredient Component</th>
                    <th className="px-6 py-4 col-header text-right">Required Volume</th>
                    <th className="px-6 py-4 col-header text-right">Inventory Logic</th>
                    <th className="px-6 py-4 col-header text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {!selectedRecipe ? (
                    <tr>
                      <td colSpan={4} className="py-32 text-center text-zinc-300">
                        <Scale className="h-12 w-12 opacity-10 mx-auto mb-4" />
                        <p className="text-zinc-400 text-sm italic">Select a formula in the sidebar to begin scaling</p>
                      </td>
                    </tr>
                  ) : (
                    requirements.map((req, idx) => (
                      <tr key={idx} className="data-row">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-[14px] font-bold text-zinc-800">{req.name}</span>
                            <span className="text-[10px] text-zinc-400 font-mono tracking-wider">
                              {(req.requiredInInvUnit / batchMultiplier || 0).toLocaleString()} {req.recipeUnit} per unit
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-[15px] text-zinc-900">
                          {req.requiredInInvUnit.toFixed(3)} <span className="text-[10px] text-zinc-400 uppercase font-sans">{req.unitInInv}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            req.onHand >= req.requiredInInvUnit ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600'
                          }`}>
                            {req.onHand >= req.requiredInInvUnit ? 'STOCK SECURE' : 'INSUFFICIENT'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[13px]">
                          {req.onHand >= req.requiredInInvUnit 
                            ? <span className="text-emerald-500">+{ (req.onHand - req.requiredInInvUnit).toFixed(3) } {req.unitInInv}</span> 
                            : <span className="text-red-500">-{ req.missing.toFixed(3) } {req.unitInInv}</span>
                          }
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {selectedRecipe && (
              <div className="bg-zinc-900 border-t border-zinc-800 p-8 flex justify-between items-center text-white">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Total Mixed Yield Projection</p>
                  <p className="text-3xl font-bold tracking-tight">
                    {batchMultiplier.toLocaleString()}
                    <span className="text-xs ml-2 text-zinc-600 font-sans uppercase">finished units</span>
                  </p>
                </div>
                <button
                  onClick={handleDeduct}
                  disabled={!canCommitBatch || isDeducting}
                  className={`flex items-center gap-3 px-10 py-4 rounded-lg font-bold uppercase tracking-widest text-[12px] transition-all ${
                    canCommitBatch 
                      ? 'bg-accent text-zinc-900 hover:bg-amber-400 shadow-xl shadow-amber-900/20 active:translate-y-px' 
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700'
                  }`}
                >
                  {isDeducting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Scale className="h-4 w-4" />}
                  {locationId === 'all' ? 'CHOOSE LOCATION TO COMMIT' : canFulfill ? 'COMMIT BATCH & SYNC' : 'INSUFFICIENT STOCK'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Control Sidebar */}
        <div className="xl:col-span-4 space-y-6">
          <div className="technical-card p-6 space-y-6">
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Scale className="h-3.5 w-3.5" /> Select Mix
            </h3>
            
            <div className="space-y-4 font-sans">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Select Mix</label>
                <select
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded px-4 py-3 font-bold text-zinc-900 text-[14px] focus:outline-none focus:ring-2 focus:ring-accent/10 transition-all cursor-pointer"
                >
                  <option value="">Select a mix...</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.finishedGoodName || r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Quantity to mix (# of units)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={batchMultiplier === 0 ? '' : batchMultiplier}
                    onChange={(e) => setBatchMultiplier(parseFloat(e.target.value) || 0)}
                    className="flex-1 bg-white border border-zinc-200 rounded px-4 py-3 font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-accent/10 transition-all"
                  />
                  <span className="text-zinc-400 font-bold text-sm text-[12px] uppercase">Units</span>
                </div>
              </div>
            </div>

            {status && (
              <div className={`p-4 rounded border flex items-start gap-3 animate-in fade-in duration-300 ${
                status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {status.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> : <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />}
                <p className="text-[12px] font-medium leading-relaxed">{status.msg}</p>
              </div>
            )}

            {locationId === 'all' && (
              <div className="rounded border border-amber-200 bg-amber-50 p-4 text-[12px] font-medium leading-relaxed text-amber-800">
                Total Inventory is planning-only. Switch to a named location to commit a real batch deduction.
              </div>
            )}
          </div>
          
          <div className="bg-zinc-900 rounded-lg p-6 shadow-xl space-y-4">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2 border-b border-zinc-800 pb-2">
              <History className="h-3.5 w-3.5" /> Verification Log
            </h3>
            <div className="p-4 bg-zinc-800/30 rounded border border-zinc-800">
              <p className="text-[11px] text-zinc-500 font-medium text-center py-4 italic">Actionable batch logging active in background.</p>
            </div>
            <div className="flex gap-2">
              <div className="h-1 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-accent w-1/3 opacity-20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}