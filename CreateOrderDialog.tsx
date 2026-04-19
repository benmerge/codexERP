import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Customer, Order, OrderItem, OrderStatus, Product } from '../types';
import { Plus, Trash2 } from 'lucide-react';

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (order: Order) => void;
  customers: Customer[];
  products: Product[];
}

export const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({ open, onOpenChange, onSave, customers, products }) => {
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ productId: '', quantity: 1 }]);
  const [status, setStatus] = useState<OrderStatus>('Order placed');
  const selectedCustomer = customers.find((entry) => entry.id === customerId);

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
    const newOrder: Order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      customerId,
      salesRepId: customer?.salesRepId,
      salesRepName: customer?.salesRepName,
      salesRepEmail: customer?.salesRepEmail,
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId} required>
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
              Account rep: {selectedCustomer?.salesRepName || selectedCustomer?.salesRepEmail || 'Assign one on the customer/prospect record first'}
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Order Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex gap-4 items-end bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex-1 space-y-2">
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
                  
                  <div className="w-24 space-y-2">
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
                  
                  {items.length > 1 && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="text-slate-400 hover:text-red-600 mb-[2px]"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            
            <div className="flex flex-col justify-end items-end pr-2 pb-1">
              <span className="text-sm text-slate-500">Estimated Total</span>
              <span className="text-xl font-bold text-emerald-600">
                ${items.reduce((sum, item) => {
                  const product = products.find(p => p.id === item.productId);
                  return sum + (product?.price || 0) * item.quantity;
                }, 0).toFixed(2)}
              </span>
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
