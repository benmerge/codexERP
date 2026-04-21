import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Customer, Order, OrderItem, OrderStatus, OrgMember, Product } from '../types';
import { Plus, Trash2 } from 'lucide-react';

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (order: Order) => void;
  customers: Customer[];
  products: Product[];
  salesReps: OrgMember[];
}

export const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({ open, onOpenChange, onSave, customers, products, salesReps }) => {
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ productId: '', quantity: 1 }]);
  const [status, setStatus] = useState<OrderStatus>('Order placed');
  const [salesRepId, setSalesRepId] = useState('');
  const selectedCustomer = customers.find((entry) => entry.id === customerId);
  const selectedSalesRep = salesReps.find((rep) => rep.id === salesRepId);
  const customerRepLabel = selectedCustomer?.salesRepName || selectedCustomer?.salesRepEmail || 'Unassigned';
  const salesRepOptions = React.useMemo(() => {
    if (!selectedCustomer?.salesRepId) return salesReps;
    if (salesReps.some((rep) => rep.id === selectedCustomer.salesRepId)) return salesReps;
    return [
      {
        id: selectedCustomer.salesRepId,
        email: selectedCustomer.salesRepEmail || '',
        displayName: selectedCustomer.salesRepName || selectedCustomer.salesRepEmail || '',
      },
      ...salesReps,
    ];
  }, [salesReps, selectedCustomer]);

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    const nextCustomer = customers.find((entry) => entry.id === value);
    setSalesRepId(nextCustomer?.salesRepId || '');
  };

  const handleAddItem = () => {
    setItems([...items, { productId: '', quantity: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || items.length === 0 || items.some(i => !i.productId)) return;

    // Calculate total amount if products have prices
    const totalAmount = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      return sum + (product?.price || 0) * item.quantity;
    }, 0);

    const customer = customers.find((entry) => entry.id === customerId);
    const resolvedSalesRep = salesRepId ? salesReps.find((rep) => rep.id === salesRepId) : undefined;
    const newOrder: Order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      customerId,
      salesRepId: salesRepId,
      salesRepName: resolvedSalesRep?.displayName || resolvedSalesRep?.email || (salesRepId === customer?.salesRepId ? customer?.salesRepName : ''),
      salesRepEmail: resolvedSalesRep?.email || (salesRepId === customer?.salesRepId ? customer?.salesRepEmail : ''),
      date: new Date().toISOString().split('T')[0],
      status,
      items: items.map(i => ({ ...i, price: products.find(p => p.id === i.productId)?.price })),
      amount: totalAmount,
      source: 'Manual',
      fulfilledDate: status === 'Order placed' ? undefined : new Date().toISOString(),
    };

    onSave(newOrder);
    setCustomerId('');
    setItems([{ productId: '', quantity: 1 }]);
    setStatus('Order placed');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Create New Order</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid gap-4 md:grid-cols-[1.35fr_0.85fr]">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={handleCustomerChange} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Account rep: {customerRepLabel}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Order Status</Label>
              <Select value={status} onValueChange={(v: OrderStatus) => setStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Order placed">Order placed</SelectItem>
                  <SelectItem value="Shipped">Shipped</SelectItem>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <Label>Account Rep</Label>
              <Select value={salesRepId || 'unassigned'} onValueChange={(v) => setSalesRepId(v === 'unassigned' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {salesRepOptions.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.displayName || rep.email || 'Assigned rep'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Select the rep who owns this account so status updates go to the right person.
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Order Items</Label>
                <p className="text-xs text-slate-500">Choose products and quantities for this order.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_7rem_auto] md:items-end">
                  <div className="space-y-2 min-w-0">
                    <Label className="text-xs">Product</Label>
                    <Select 
                      value={item.productId} 
                      onValueChange={(v) => updateItem(index, 'productId', v)} 
                      required
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} (${p.price.toFixed(2)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Quantity</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      className="bg-white"
                      required 
                      value={item.quantity} 
                      onChange={e => updateItem(index, 'quantity', Number(e.target.value))} 
                    />
                  </div>
                  
                  {items.length > 1 ? (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="text-slate-400 hover:text-red-600 md:mb-[2px]"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <span className="text-sm text-slate-500">Estimated Total</span>
              <span className="text-2xl font-bold text-emerald-600">
                ${items.reduce((sum, item) => {
                  const product = products.find(p => p.id === item.productId);
                  return sum + (product?.price || 0) * item.quantity;
                }, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex items-end justify-start md:justify-end">
              <p className="text-xs text-slate-500 max-w-xs">
                The selected customer's account rep will stay attached to the order for status alerts.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Create Order
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
