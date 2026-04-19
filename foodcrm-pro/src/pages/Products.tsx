import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../data/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Trash2, Edit, Package, History, ArrowUpRight, ArrowDownRight, Settings2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Product, InventoryStatus } from '../types';
import { collection, getDocs, query } from 'firebase/firestore';
import { miremixDb } from '../firebase';

export const Products = () => {
  const { products, addProduct, updateProduct, deleteProduct, orders, suppliers } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const hasAutoSyncedRef = useRef(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [stock, setStock] = useState<number | ''>('');
  const [unit, setUnit] = useState('unit');
  const [supplierId, setSupplierId] = useState('');

  const filteredProducts = products.filter(p => 
    (
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
    ) &&
    (categoryFilter === 'all' || p.category === categoryFilter)
  );

  const availableCategories = Array.from(new Set(products.map((product) => product.category)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const resetForm = () => {
    setName('');
    setCategory('');
    setSku('');
    setPrice('');
    setStock('');
    setUnit('unit');
    setSupplierId('');
    setEditingProduct(null);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setCategory(product.category);
    setSku(product.sku);
    setPrice(product.price);
    setStock(product.stock);
    setUnit(product.unit);
    setSupplierId(product.supplierId || '');
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const productData: Product = {
      id: editingProduct?.id || `p-${Date.now()}`,
      name,
      category,
      sku,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      unit,
      supplierId,
      status: Number(stock) > 20 ? 'In Stock' : (Number(stock) > 0 ? 'Low Stock' : 'Out of Stock')
    };

    if (editingProduct) {
      updateProduct(productData);
    } else {
      addProduct(productData);
    }

    setIsDialogOpen(false);
    resetForm();
  };

  // Calculate committed stock (from open orders)
  const getCommittedStock = (productId: string) => {
    const openOrders = orders.filter(o => o.status === 'Order placed' || o.status === 'Shipped');
    return openOrders.reduce((total, order) => {
      const item = order.items.find(i => i.productId === productId);
      return total + (item?.quantity || 0);
    }, 0);
  };

  const getStatusColor = (status: InventoryStatus) => {
    switch(status) {
      case 'In Stock': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Low Stock': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Out of Stock': return 'bg-rose-50 text-rose-700 border-rose-100';
    }
  };

  const slugify = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const importFinishedGoods = async (options?: { silent?: boolean }) => {
    setIsImporting(true);
    if (!options?.silent) {
      setImportMessage(null);
    }

    try {
      const snapshot = await getDocs(query(collection(miremixDb, 'inventory')));
      const grouped = new Map<string, { name: string; stock: number; unit: string }>();

      snapshot.docs.forEach((entry) => {
        const data = entry.data() as Record<string, unknown>;
        const category = String(data.category || '').trim().toLowerCase();
        if (category !== 'finished good') return;

        const name = String(data.name || '').trim();
        if (!name) return;

        const key = name.toLowerCase();
        const existing = grouped.get(key);
        const stock = Number(data.quantityOnHand || 0);
        const unit = String(data.unit || 'units').trim() || 'units';

        if (existing) {
          existing.stock += Number.isFinite(stock) ? stock : 0;
        } else {
          grouped.set(key, {
            name,
            stock: Number.isFinite(stock) ? stock : 0,
            unit,
          });
        }
      });

      if (grouped.size === 0) {
        throw new Error('No finished goods were found in MiRemix inventory.');
      }

      for (const finishedGood of grouped.values()) {
        const existingProduct = products.find((product) => product.name.toLowerCase() === finishedGood.name.toLowerCase());
        const nextProduct: Product = {
          id: existingProduct?.id || `mrp-${slugify(finishedGood.name)}`,
          name: finishedGood.name,
          category: existingProduct?.category || 'Finished Good',
          sku: existingProduct?.sku || `MRP-${slugify(finishedGood.name).toUpperCase()}`,
          stock: Number(finishedGood.stock.toFixed(3)),
          unit: finishedGood.unit,
          price: existingProduct?.price || 0,
          supplierId: existingProduct?.supplierId || '',
          status:
            finishedGood.stock > 20 ? 'In Stock' :
            finishedGood.stock > 0 ? 'Low Stock' :
            'Out of Stock',
        };

        if (existingProduct) {
          await updateProduct(nextProduct);
        } else {
          await addProduct(nextProduct);
        }
      }

      if (!options?.silent) {
        setImportMessage({
          type: 'success',
          text: `Imported ${grouped.size} finished good${grouped.size === 1 ? '' : 's'} from MiRemix.`,
        });
      }
    } catch (error) {
      setImportMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to import finished goods from MiRemix.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    if (hasAutoSyncedRef.current) return;
    hasAutoSyncedRef.current = true;
    void importFinishedGoods({ silent: true });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-5 w-5 text-emerald-600" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Inventory & Products</h2>
          </div>
          <p className="text-sm text-slate-500">Real-time stock levels, committed inventory, and unit pricing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] border-slate-200 bg-white">
              <SelectValue placeholder="Filter category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {availableCategories.map((productCategory) => (
                <SelectItem key={productCategory} value={productCategory}>
                  {productCategory}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={importFinishedGoods}
            disabled={isImporting}
            className="border-slate-200"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isImporting ? 'animate-spin' : ''}`} />
            Import MiRemix Finished Goods
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
          <DialogTrigger render={(props) => (
            <Button {...props} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> New Product
            </Button>
          )} />
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editingProduct ? 'Product Configuration' : 'Register New Product'}</DialogTitle>
                <p className="text-sm text-slate-500">Update pricing, SKU, and facility stock levels.</p>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Product Name</Label>
                  <Input id="name" required value={name} onChange={e => setName(e.target.value)} className="font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Category</Label>
                    <Input id="category" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Grains, Oils" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku" className="text-xs uppercase tracking-wider text-slate-500 font-semibold">SKU / Code</Label>
                    <Input id="sku" value={sku} onChange={e => setSku(e.target.value)} className="font-mono text-sm" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="supplier" className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Primary Supplier</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="price" className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Base Price ($)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                      <Input id="price" type="number" step="0.01" required value={price} onChange={e => setPrice(e.target.value === '' ? '' : Number(e.target.value))} className="pl-7" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit" className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Stock Unit</Label>
                    <Input id="unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. kg, L, lbs" />
                  </div>
                </div>
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-dashed">
                  <Label htmlFor="stock" className="text-xs uppercase tracking-wider text-emerald-700 font-bold">Current Physical Stock</Label>
                  <Input 
                    id="stock" 
                    type="number" 
                    required 
                    value={stock} 
                    onChange={e => setStock(e.target.value === '' ? '' : Number(e.target.value))} 
                    className="text-lg font-bold border-emerald-200 focus-visible:ring-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 text-center italic">Updating this will recalculate forecasted availability.</p>
                </div>
                <div className="flex justify-end pt-4 gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8">
                    {editingProduct ? 'Commit Changes' : 'Register Product'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {importMessage && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          importMessage.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          {importMessage.text}
        </div>
      )}

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b pb-4">
          <div className="flex justify-between items-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Lookup SKU, Name or Category..."
                className="pl-9 h-10 border-slate-200 bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-4 text-xs">
               <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-slate-600 font-medium">In Stock</span>
               </div>
               <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-slate-600 font-medium">Low Stock</span>
               </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent border-b-2">
                  <TableHead className="w-[30%] py-4 font-bold text-slate-900 italic serif">Product / Description</TableHead>
                  <TableHead className="font-bold text-slate-900 text-xs uppercase tracking-widest">SKU</TableHead>
                  <TableHead className="font-bold text-slate-900 text-xs uppercase tracking-widest text-right">Physical Stock</TableHead>
                  <TableHead className="font-bold text-slate-900 text-xs uppercase tracking-widest text-right">Committed</TableHead>
                  <TableHead className="font-bold text-slate-900 text-xs uppercase tracking-widest text-right">Forecasted</TableHead>
                  <TableHead className="font-bold text-slate-900 text-xs uppercase tracking-widest text-center">Status</TableHead>
                  <TableHead className="text-right sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500 italic">
                      No products match your current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const committed = getCommittedStock(product.id);
                    const forecasted = product.stock - committed;
                    
                    return (
                      <TableRow key={product.id} className="group hover:bg-emerald-50/30 transition-colors border-b">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 group-hover:text-emerald-900 transition-colors">{product.name}</span>
                            <span className="text-xs text-slate-500 italic serif">
                              {product.category} — ${product.price.toFixed(2)}/{product.unit}
                              {product.supplierId && (
                                <span className="ml-2 px-1 bg-slate-100 rounded text-[10px] text-slate-400 not-italic uppercase tracking-wider">
                                  {suppliers.find(s => s.id === product.supplierId)?.name}
                                </span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border tabular-nums">
                            {product.sku}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-slate-900">
                          {product.stock.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal uppercase ml-0.5">{product.unit}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-500 text-xs">
                          {committed > 0 ? (
                            <div className="flex items-center justify-end gap-1 text-amber-600 font-medium">
                              <span>-{committed.toLocaleString()}</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </div>
                          ) : (
                            <span className="opacity-30">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className={`font-mono text-sm font-bold ${forecasted < 100 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {forecasted.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-tighter px-2 py-0 h-5 ${getStatusColor(product.status)}`}>
                            {product.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right py-4 pr-6">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-100" 
                              onClick={() => handleEdit(product)}
                              title="Edit Details & Log stock"
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" 
                              onClick={() => deleteProduct(product.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm">
        <ArrowUpRight className="h-4 w-4 shrink-0" />
        <p><strong>Note:</strong> Pricing or configuration updates can be made via the <Settings2 className="inline h-3 w-3" /> Settings icon. Shelf stock is tracked as "Physical Stock".</p>
      </div>
    </div>
  );
};
