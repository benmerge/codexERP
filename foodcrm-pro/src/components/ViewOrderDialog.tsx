import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Order, OrderStatus, Customer, Product, OrgMember } from '../types';
import { useAppContext } from '../data/AppContext';

interface ViewOrderDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (order: Order) => void;
  customers: Customer[];
  products: Product[];
  salesReps: OrgMember[];
}

export const ViewOrderDialog: React.FC<ViewOrderDialogProps> = ({ order, open, onOpenChange, onSave, customers, products, salesReps }) => {
  const { updateCustomer } = useAppContext();
  const [status, setStatus] = useState<OrderStatus>('Order placed');
  const [salesRepId, setSalesRepId] = useState('');
  const salesRepOptions = React.useMemo(() => {
    if (!order?.salesRepId) return salesReps;
    if (salesReps.some((rep) => rep.id === order.salesRepId)) return salesReps;
    return [
      {
        id: order.salesRepId,
        email: order.salesRepEmail || order.salesRepName || '',
        displayName: order.salesRepName || order.salesRepEmail || 'Assigned rep',
      },
      ...salesReps,
    ];
  }, [salesReps, order]);

  useEffect(() => {
    if (order) {
      setStatus(order.status);
      setSalesRepId(order.salesRepId || '');
    }
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (order) {
      const customer = customers.find((entry) => entry.id === order.customerId);
      const salesRep = salesReps.find((rep) => rep.id === salesRepId);
      const updatedOrder = {
        ...order,
        status,
        salesRepId: customer?.salesRepId || salesRepId,
        salesRepName: customer?.salesRepName || salesRep?.displayName || salesRep?.email || order.salesRepName || 'Assigned rep',
        salesRepEmail: customer?.salesRepEmail || salesRep?.email || order.salesRepEmail,
      };
      
      // Shipped/Delivered/Cancelled should all carry a completion timestamp for downstream MRP visibility.
      if ((status === 'Shipped' || status === 'Delivered' || status === 'Cancelled') && order.status !== status) {
        updatedOrder.fulfilledDate = new Date().toISOString();
      } else if (status === 'Order placed') {
        updatedOrder.fulfilledDate = undefined;
      }
      
      if (customer && salesRepId && customer.salesRepId !== salesRepId) {
        updateCustomer({
          ...customer,
          salesRepId,
          salesRepName: salesRep?.displayName || salesRep?.email || customer.salesRepName,
          salesRepEmail: salesRep?.email || customer.salesRepEmail,
        });
      }

      onSave(updatedOrder);

      onOpenChange(false);
    }
  };

  if (!order) return null;

  const customer = customers.find(c => c.id === order.customerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order Details - {order.id.toUpperCase()}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-semibold text-slate-500 block">Customer</span>
              <span>{customer?.company || customer?.name || 'Unknown Customer'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Date</span>
              <span>{order.date}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Source</span>
              <span>{order.source || 'Manual'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Sales Rep</span>
              <span>{order.salesRepName || order.salesRepEmail || 'Unassigned'}</span>
            </div>
          </div>

          <div className="pt-2">
            <span className="font-semibold text-slate-500 block mb-2">Items Ordered</span>
            <div className="border rounded-md divide-y">
              {order.items?.length > 0 ? (
                order.items.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={idx} className="p-2 text-sm flex justify-between items-center">
                      <span>{product?.name || `Product ID: ${item.productId}`}</span>
                      <span className="font-medium">Qty: {item.quantity}</span>
                    </div>
                  );
                })
              ) : (
                <div className="p-2 text-sm text-slate-500">No items found.</div>
              )}
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label>Account Rep</Label>
              <Select value={salesRepId} onValueChange={setSalesRepId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a sales rep" />
                </SelectTrigger>
                <SelectContent>
                  {salesRepOptions.map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.displayName || rep.email || 'Assigned rep'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Update Status</Label>
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
            <div className="flex justify-end pt-2">
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};