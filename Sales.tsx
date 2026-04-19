import React, { useState } from 'react';
import { useAppContext } from '../data/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, FileText } from 'lucide-react';
import { CreateOrderDialog } from '../components/CreateOrderDialog';
import { ViewOrderDialog } from '../components/ViewOrderDialog';
import { Order } from '../types';

export const Sales = () => {
  const { orders, customers, products, salesReps, addOrder, updateOrder, updateCustomer } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  const handleAddOrder = (order: Order) => {
    addOrder(order);
    
    // Check if customer is a prospect and convert them
    const customer = customers.find(c => c.id === order.customerId);
    if (customer && customer.isProspect) {
      updateCustomer({
        ...customer,
        isProspect: false,
        pipelineStage: 'Closed Won'
      });
    }
  };

  const filteredOrders = orders.filter(o => {
    const customer = customers.find(c => c.id === o.customerId);
    return customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           customer?.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
           o.id.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Delivered': return 'bg-emerald-100 text-emerald-800';
      case 'Shipped': return 'bg-blue-100 text-blue-800';
      case 'Order placed': return 'bg-amber-100 text-amber-800';
      case 'Cancelled': return 'bg-rose-100 text-rose-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sales & Orders</h2>
            <p className="text-slate-500">Track ecosystem demand and logistics.</p>
          </div>
          <Badge variant="outline" className="text-[10px] font-bold uppercase bg-slate-50 border-slate-200">
            {orders.length} Records
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button 
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Create Order
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="search"
                placeholder="Search orders or customers..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[12%] py-4">Order ID</TableHead>
                  <TableHead className="w-[20%] py-4">Customer</TableHead>
                  <TableHead className="w-[12%] py-4">Date</TableHead>
                  <TableHead className="w-[14%] py-4">Sales Rep</TableHead>
                  <TableHead className="w-[10%] py-4 text-right">Volume</TableHead>
                  <TableHead className="w-[24%] py-4">Product Details</TableHead>
                  <TableHead className="w-[10%] py-4">Status</TableHead>
                  <TableHead className="w-[8%] py-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                      No orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const customer = customers.find(c => c.id === order.customerId);
                    const itemCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
                    return (
                      <TableRow key={order.id} className="hover:bg-slate-50">
                        <TableCell>
                          <div className="font-medium">{order.id.toUpperCase()}</div>
                          <div className="text-[10px] uppercase font-bold text-slate-400">
                            {order.source || 'Manual'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{customer?.company || customer?.name}</div>
                          <div className="text-xs text-slate-500">{customer?.company ? customer?.name : ''}</div>
                        </TableCell>
                        <TableCell>{order.date}</TableCell>
                        <TableCell>
                          <div className="font-medium">{order.salesRepName || order.salesRepEmail || 'Unassigned'}</div>
                          <div className="text-xs text-slate-500">{order.salesRepEmail || ''}</div>
                        </TableCell>
                        <TableCell className="text-right font-black text-slate-900 tabular-nums">
                          {itemCount}
                          <span className="text-[9px] ml-1 text-slate-400 font-bold uppercase tracking-widest block sm:inline">Units</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 w-full max-w-[280px]">
                            {order.items?.slice(0, 3).map((item, idx) => {
                              const product = products.find(p => p.id === item.productId);
                              return (
                                <div key={idx} className="text-xs overflow-hidden">
                                  <span className="truncate text-slate-500 block">{product?.name || item.productId}</span>
                                </div>
                              );
                            })}
                            {order.items?.length > 3 && (
                              <div className="text-[9px] text-slate-400 font-medium italic">
                                + {order.items.length - 3} more line items...
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border-none ${getStatusColor(order.status)}`}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setViewingOrder(order)}>
                            <FileText className="h-4 w-4 mr-1" /> View
                          </Button>
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

      <CreateOrderDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen} 
        onSave={handleAddOrder} 
        customers={customers} 
        products={products}
      />

      <ViewOrderDialog
        open={!!viewingOrder}
        onOpenChange={(open) => !open && setViewingOrder(null)}
        order={viewingOrder}
        onSave={updateOrder}
        customers={customers}
        products={products}
        salesReps={salesReps}
      />
    </div>
  );
};
