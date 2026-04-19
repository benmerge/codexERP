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
