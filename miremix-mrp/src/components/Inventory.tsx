import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, Box, Loader2, Trash2 } from 'lucide-react';
import { collection, onSnapshot, query, setDoc, doc, writeBatch, deleteDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { type Ingredient } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { INVENTORY_CATEGORIES, normalizeInventoryCategory, normalizeIngredient } from '../lib/inventoryCategories';
import { v4 as uuidv4 } from 'uuid';
import { Edit2, Check, X } from 'lucide-react';

export function Inventory({ locationId }: { locationId: string }) {
  const [inventory, setInventory] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!locationId) return;
    const q = query(collection(db, 'inventory'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Ingredient[];

      items = items.map(normalizeIngredient);

      if (locationId === 'all') {
        const grouped = new Map<string, Ingredient>();
        items.forEach((item) => {
          const key = `${item.name}__${item.category}__${item.unit}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.quantityOnHand += item.quantityOnHand || 0;
            const existingUpdated = existing.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
            const itemUpdated = item.lastUpdated ? new Date(item.lastUpdated).getTime() : 0;
            if (itemUpdated > existingUpdated) existing.lastUpdated = item.lastUpdated;
          } else {
            grouped.set(key, {
              ...item,
              id: key,
              locationId: 'all',
              quantityOnHand: item.quantityOnHand || 0,
            });
          }
        });
        items = Array.from(grouped.values());
      } else {
        items = items.filter(i => i.locationId === locationId || (!i.locationId && locationId === 'default'));
      }

      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [locationId]);

  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | Ingredient['category']>('all');
  const [newItem, setNewItem] = useState({ name: '', category: 'Major Ingredient' as any, unit: 'kg', qty: '0' });
  const isTotalInventoryView = locationId === 'all';
  const filteredInventory =
    categoryFilter === 'all'
      ? inventory
      : inventory.filter((item) => item.category === categoryFilter);

  const handleReconcile = async (ingredientId: string) => {
    if (isTotalInventoryView) return;
    const val = parseFloat(editValue);
    if (isNaN(val)) return;
    
    setIsUploading(true);
    try {
      await updateDoc(doc(db, 'inventory', ingredientId), {
        quantityOnHand: val,
        lastUpdated: new Date().toISOString()
      });
      setEditingId(null);
      setStatus({ type: 'success', msg: 'Stock reconciled successfully.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `inventory/${ingredientId}/reconcile`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearAll = async () => {
    if (isTotalInventoryView) return;
    setIsUploading(true);
    setStatus(null);
    setShowConfirmReset(false);
    try {
      const q = query(collection(db, 'inventory'));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.locationId === locationId || (!data.locationId && locationId === 'default')) {
          batch.delete(d.ref);
        }
      });
      await batch.commit();
      setStatus({ type: 'success', msg: 'Inventory cleared successfully.' });
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', msg: 'Failed to clear inventory. Permission denied or system error.' });
      // Still call for log purposes
      try { handleFirestoreError(err, OperationType.DELETE, 'inventory/all'); } catch(e) {}
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTotalInventoryView) {
      setStatus({ type: 'error', msg: 'Choose a physical location before importing inventory.' });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatus(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const batch = writeBatch(db);
        let count = 0;
        
        // Define potential header aliases
        const idKeys = ['product id', 'id', 'sku', 'code', 'part number'];
        const nameKeys = ['name', 'ingredient', 'item', 'description', 'component'];
        const qtyKeys = ['on hand', 'quantityonhand', 'qty', 'amount', 'stock', 'onhand', 'quantity'];
        const unitKeys = ['category', 'unit', 'uom', 'measure', 'type'];

        results.data.forEach((row: any) => {
          // Normalize row keys
          const normalizedRow: any = {};
          Object.keys(row).forEach(k => normalizedRow[k.toLowerCase().trim()] = row[k]);

          // Find matches by checking for key existence in the normalized map
          const matchedKeys: any = {};
          ['id', 'name', 'qty', 'unit'].forEach(type => {
            const aliases = 
              type === 'id' ? idKeys :
              type === 'name' ? nameKeys :
              type === 'qty' ? qtyKeys :
              unitKeys;
            
            const found = aliases.find(a => a in normalizedRow);
            if (found) matchedKeys[type] = found;
          });

          // Extract values strictly
          const nameValue = (matchedKeys.name ? normalizedRow[matchedKeys.name] : null) || row.Name || row.name || row.Item || '';
          const name = String(nameValue).trim();
          
          if (!name) return;

          const rawId = 
            (matchedKeys.id ? normalizedRow[matchedKeys.id] : null) || 
            row['Product ID'] || row.id || uuidv4();

          const rawQty = 
            (matchedKeys.qty ? normalizedRow[matchedKeys.qty] : null) || 
            row['On Hand'] || row.quantityOnHand || '0';
          
          const rawUnit = 
            (matchedKeys.unit ? normalizedRow[matchedKeys.unit] : null) || 
            row.Category || row.unit || row.type || row.Type || 'Major';

          const category = normalizeInventoryCategory(String(rawUnit), name);
          const unitLabel = category === 'Finished Good' ? 'units' : 'kg';

          // Clean up quantity: handle "6.0", "1,200", "$10.50", etc.
          const cleanQtyStr = String(rawQty).replace(/[^0-9.-]/g, '');
          const qty = parseFloat(cleanQtyStr);
          const finalQty = isNaN(qty) ? 0 : qty;

          const scopedId = `${locationId}__${String(rawId).trim()}`;
          const docRef = doc(db, 'inventory', scopedId);
          
          batch.set(docRef, {
            id: scopedId,
            name,
            unit: unitLabel,
            category,
            quantityOnHand: finalQty,
            locationId,
            lastUpdated: new Date().toISOString()
          }, { merge: true });
          count++;
        });

        if (count === 0) {
          setIsUploading(false);
          setStatus({ type: 'error', msg: 'No valid data found in CSV. Ensure headers match "Name", "Quantity", and "Unit".' });
          return;
        }

        try {
          await batch.commit();
          setStatus({ type: 'success', msg: `Successfully imported ${count} items.` });
          setTimeout(() => setStatus(null), 5000);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'inventory/batch');
          setStatus({ type: 'error', msg: 'System error during upload. Check permissions.' });
        } finally {
          setIsUploading(false);
        }
      },
      error: (error) => {
        setIsUploading(false);
        setStatus({ type: 'error', msg: `Parsing error: ${error.message}` });
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddItem = async () => {
    if (isTotalInventoryView) return;
    if (!newItem.name.trim()) return;
    setIsUploading(true);
    setStatus(null);
    try {
      const docRef = doc(collection(db, 'inventory'));
      await setDoc(docRef, {
        id: docRef.id,
        name: newItem.name.trim(),
        category: normalizeInventoryCategory(newItem.category, newItem.name.trim()),
        unit: newItem.unit,
        locationId,
        quantityOnHand: parseFloat(newItem.qty) || 0,
        lastUpdated: new Date().toISOString()
      });
      setShowAddForm(false);
      setNewItem({ name: '', category: 'Major Ingredient', unit: 'kg', qty: '0' });
      setStatus({ type: 'success', msg: 'Item added successfully.' });
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventory/add');
      setStatus({ type: 'error', msg: 'Failed to add item.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (isTotalInventoryView) return;
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    setIsUploading(true);
    try {
      await deleteDoc(doc(db, 'inventory', id));
      setStatus({ type: 'success', msg: 'Item deleted.' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `inventory/${id}`);
      setStatus({ type: 'error', msg: 'Failed to delete item.' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex justify-between items-end border-b border-zinc-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Inventory Master</h2>
          <p className="text-[13px] text-zinc-500 mt-1">
            {isTotalInventoryView ? 'Aggregated inventory across every physical location' : 'Central stock records and reconciliation'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(loading || isUploading) && <Loader2 className="h-4 w-4 text-accent animate-spin" />}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | Ingredient['category'])}
            className="rounded border border-zinc-200 bg-white px-3 py-2 text-[12px] font-bold text-zinc-600"
          >
            <option value="all">ALL CATEGORIES</option>
            {INVENTORY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.toUpperCase()}
              </option>
            ))}
          </select>
          
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={isUploading || isTotalInventoryView}
            className="px-4 py-2 bg-white border border-zinc-200 text-zinc-600 rounded text-[12px] font-bold flex items-center gap-2 hover:bg-zinc-50 transition-colors"
          >
            <Box className="h-3.5 w-3.5" />
            ADD ITEM
          </button>

          {inventory.length > 0 && (
            <div className="flex items-center gap-2">
              {showConfirmReset ? (
                <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Confirm Clear?</span>
                  <button
                    onClick={handleClearAll}
                    disabled={isUploading}
                    className="px-3 py-1.5 bg-red-600 text-white rounded text-[11px] font-bold hover:bg-red-700 transition-colors"
                  >
                    WIPE ALL
                  </button>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="px-3 py-1.5 bg-zinc-200 text-zinc-600 rounded text-[11px] font-bold hover:bg-zinc-300"
                  >
                    CANCEL
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmReset(true)}
                  disabled={isUploading || isTotalInventoryView}
                  className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded text-[12px] font-bold flex items-center gap-2 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  RESET
                </button>
              )}
            </div>
          )}

          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isTotalInventoryView}
            className="px-4 py-2 bg-zinc-900 text-white rounded text-[12px] font-bold flex items-center gap-2 hover:bg-black transition-colors"
          >
            <Upload className="h-4 w-4" />
            {isUploading ? 'IMPORTING...' : 'IMPORT CSV'}
          </button>
        </div>
      </div>

      {isTotalInventoryView && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Total Inventory is a read-only rollup. Choose a named physical location like <span className="font-semibold">Sterling, IL</span> to import, reconcile, or edit stock.
        </div>
      )}

      {showAddForm && !isTotalInventoryView && (
        <div className="technical-card p-4 bg-zinc-50 border-zinc-200 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col gap-4">
            <h3 className="text-[12px] font-bold text-zinc-800 uppercase tracking-widest">New Inventory Item</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input 
                type="text" 
                placeholder="Item Name" 
                className="px-3 py-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})}
              />
              <select 
                className="px-3 py-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 bg-white"
                value={newItem.category}
                onChange={e => setNewItem({...newItem, category: e.target.value as any})}
              >
                <option value="Major Ingredient">Major Ingredient</option>
                <option value="Minor Ingredient">Minor Ingredient</option>
                <option value="Finished Good">Finished Good</option>
              </select>
              <input 
                type="text" 
                placeholder="Unit (e.g. kg, units)" 
                className="px-3 py-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={newItem.unit}
                onChange={e => setNewItem({...newItem, unit: e.target.value})}
              />
              <input 
                type="number" 
                placeholder="Initial Qty" 
                className="px-3 py-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={newItem.qty}
                onChange={e => setNewItem({...newItem, qty: e.target.value})}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setShowAddForm(false)} 
                className="px-4 py-2 bg-white border border-zinc-200 text-zinc-600 rounded text-[12px] font-bold hover:bg-zinc-50"
              >
                CANCEL
              </button>
              <button 
                onClick={handleAddItem}
                disabled={isUploading || !newItem.name}
                className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-white rounded text-[12px] font-bold hover:bg-black disabled:opacity-50"
              >
                SAVE ITEM
              </button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className={`p-3 rounded border text-[13px] flex items-center gap-3 ${
          status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {status.msg}
        </div>
      )}

      <div className="technical-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="px-6 py-4 col-header">SKU / Component</th>
                <th className="px-6 py-4 col-header text-right">Category</th>
                <th className="px-6 py-4 col-header text-right">Quantity On-Hand</th>
                <th className="px-6 py-4 col-header text-right">Unit</th>
                <th className="px-6 py-4 col-header text-right">Last Sync</th>
                <th className="px-6 py-4 col-header text-right">Reconcile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredInventory.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="py-24 text-center">
                    <Box className="h-10 w-10 text-zinc-100 mx-auto mb-4" />
                    <p className="text-zinc-400 text-sm italic">
                      {inventory.length === 0
                        ? (isTotalInventoryView ? 'No inventory has been entered for any location yet.' : 'Inventory database is empty. Upload a CSV to begin.')
                        : 'No inventory matches the selected category.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => {
                  const isLow = (item.category === 'Major Ingredient' && item.quantityOnHand < 20) || 
                                (item.category === 'Minor Ingredient' && item.quantityOnHand < 5);
                  
                  return (
                    <tr key={item.id} className="data-row">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[14px] font-semibold text-zinc-900">{item.name}</span>
                          {isLow && (
                            <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter flex items-center gap-1 mt-0.5 animate-pulse">
                              Low Inventory
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          item.category === 'Major Ingredient' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                          item.category === 'Minor Ingredient' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                          'bg-emerald-50 border-emerald-100 text-emerald-600'
                        }`}>
                          {item.category.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingId === item.id ? (
                          <div className="flex justify-end animate-in fade-in zoom-in-95 duration-200">
                            <input
                              type="number"
                              step="0.001"
                              autoFocus
                              className="w-24 bg-white border border-accent rounded px-2 py-1 text-right font-mono text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-accent/20"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleReconcile(item.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                            />
                          </div>
                        ) : (
                          <span className={`font-mono text-[16px] font-bold ${
                            isLow ? 'text-red-600' : 'text-zinc-900'
                          }`}>
                            {item.quantityOnHand.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                        {item.unit}
                      </td>
                      <td className="px-6 py-4 text-right text-[11px] font-mono text-zinc-400">
                        {(item as any).lastUpdated ? new Date((item as any).lastUpdated).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 text-zinc-400">
                          {editingId === item.id ? (
                            <>
                              <button
                                onClick={() => handleReconcile(item.id)}
                                className="p-1 hover:text-emerald-500 transition-colors"
                                title="Confirm"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 hover:text-red-500 transition-colors"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditValue(item.quantityOnHand.toString());
                                }}
                                disabled={isTotalInventoryView}
                                className="p-1.5 hover:bg-zinc-100 rounded transition-all hover:text-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent"
                                title="Reconcile Stock"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                disabled={isTotalInventoryView}
                                className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-all disabled:opacity-40 disabled:hover:bg-transparent"
                                title="Delete Item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
