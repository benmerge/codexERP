import React, { useState, useEffect } from 'react';
import { useAppContext } from '../data/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Users, 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  LayoutDashboard, 
  Settings2, 
  Check,
  AlertTriangle,
  Clock,
  BarChart3,
  CalendarDays,
  History as HistoryIcon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

const COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6'];

type WidgetId = 'stats' | 'top_products' | 'recent_orders' | 'pipeline' | 'low_stock' | 'task_summary';

interface WidgetConfig {
  id: WidgetId;
  title: string;
  description: string;
  enabled: boolean;
  cols: number; // 1-7 in the 7-col grid system
}

export const Dashboard = () => {
  const { customers, orders, products, tasks } = useAppContext();
  
  const [configs, setConfigs] = useState<WidgetConfig[]>([
    { id: 'stats', title: 'Key Performance Indicators', description: 'Monthly revenue and volume metrics', enabled: true, cols: 7 },
    { id: 'top_products', title: 'Inventory Velocity', description: 'Top performing product lines', enabled: true, cols: 4 },
    { id: 'recent_orders', title: 'Live Order Feed', description: 'Most recent site and manual orders', enabled: true, cols: 3 },
    { id: 'pipeline', title: 'Revenue Pipeline', description: 'Distribution of leads across stages', enabled: true, cols: 4 },
    { id: 'low_stock', title: 'Fulfillment Risks', description: 'Items nearing depletion', enabled: true, cols: 3 },
    { id: 'task_summary', title: 'Operations Queue', description: 'Status of ongoing operational tasks', enabled: true, cols: 7 },
  ]);

  const [isCustomizing, setIsCustomizing] = useState(false);

  // Load selection from local storage
  useEffect(() => {
    const saved = localStorage.getItem('dashboard_layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfigs(prev => prev.map(c => ({
          ...c,
          enabled: parsed[c.id] ?? c.enabled
        })));
      } catch (e) {
        console.error("Failed to load dashboard layout", e);
      }
    }
  }, []);

  const saveLayout = (newConfigs: WidgetConfig[]) => {
    const map = newConfigs.reduce((acc, c) => ({ ...acc, [c.id]: c.enabled }), {});
    localStorage.setItem('dashboard_layout', JSON.stringify(map));
    setConfigs(newConfigs);
    setIsCustomizing(false);
  };

  const toggleWidget = (id: WidgetId) => {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  // Calculations
  const totalItemsSold = orders.reduce((sum, order) => {
    const itemsCount = order.items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0;
    return sum + itemsCount;
  }, 0);
  
  const activeCustomers = customers.filter(c => !c.isProspect).length;
  // Use units/volume metrics primarily
  const projectedMonthlyUnits = customers.filter(c => !c.isProspect).reduce((sum, c) => sum + (c.monthlySalesVolume || 0), 0) / 10; // Simplified estimation
  const pipelineUnits = customers.filter(c => c.isProspect).reduce((sum, c) => sum + (c.monthlySalesVolume || 0), 0) / 10;
  
  const projectedMonthlySales = customers.filter(c => !c.isProspect).reduce((sum, c) => sum + (c.monthlySalesVolume || 0), 0);
  const pipelineValue = customers.filter(c => c.isProspect).reduce((sum, c) => sum + (c.monthlySalesVolume || 0), 0);

  const productSalesMap = new Map<string, number>();
  orders.forEach(order => {
    order.items?.forEach(item => {
      const current = productSalesMap.get(item.productId) || 0;
      productSalesMap.set(item.productId, current + item.quantity);
    });
  });

  const productSalesData = Array.from(productSalesMap.entries())
    .map(([productId, quantity]) => ({
      name: products.find(p => p.id === productId)?.name || `Prod ${productId}`,
      total: quantity
    }))
    .sort((a, b) => b.total - a.total).slice(0, 5);

  const pipelineStages = customers.reduce((acc, c) => {
    acc[c.pipelineStage] = (acc[c.pipelineStage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pipelineData = Object.entries(pipelineStages).map(([name, value]) => ({ name, value }));

  const lowStockItems = products.filter(p => p.status === 'Low Stock' || p.status === 'Out of Stock').slice(0, 4);

  const taskStats = [
    { name: 'To Do', value: tasks.filter(t => t.status === 'To Do').length, color: '#94a3b8' },
    { name: 'In Progress', value: tasks.filter(t => t.status === 'In Progress').length, color: '#3b82f6' },
    { name: 'Review', value: tasks.filter(t => t.status === 'Review').length, color: '#f59e0b' },
    { name: 'Done', value: tasks.filter(t => t.status === 'Done').length, color: '#10b981' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LayoutDashboard className="h-5 w-5 text-emerald-600" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Custom Workspace</h2>
          </div>
          <p className="text-sm text-slate-500 italic serif">Tailored overview of your ecosystem operations and infrastructure.</p>
        </div>
        
        <Dialog open={isCustomizing} onOpenChange={setIsCustomizing}>
          <DialogTrigger render={(props) => (
            <Button {...props} variant="outline" className="gap-2 shadow-sm border-slate-200">
              <Settings2 className="h-4 w-4" /> Customize View
            </Button>
          )} />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modify Dashboard Layout</DialogTitle>
              <CardDescription>Select which data modules you want visible in your primary workspace.</CardDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {configs.map((widget) => (
                <div 
                  key={widget.id} 
                  className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors border ${widget.enabled ? 'bg-emerald-50/50 border-emerald-200' : 'hover:bg-slate-50'}`}
                  onClick={() => toggleWidget(widget.id)}
                >
                  <div className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-600 transition-colors ${widget.enabled ? 'bg-emerald-600 text-white' : 'bg-transparent'}`}>
                    {widget.enabled && <Check className="h-3 w-3" />}
                  </div>
                  <div className="grid gap-1.5 leading-none">
                    <Label className="text-sm font-bold leading-none cursor-pointer">
                      {widget.title}
                    </Label>
                    <p className="text-[11px] text-slate-500">{widget.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsCustomizing(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => saveLayout(configs)}>Apply Layout</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        {configs.filter(c => c.enabled).map((widget) => {
          const isFullWidth = widget.id === 'stats' || widget.id === 'task_summary';
          return (
            <div
              key={widget.id}
              className={`min-w-0 ${isFullWidth ? 'w-full' : 'flex-[1_1_100%] md:flex-[1_1_350px] max-w-full'} ${widget.id === 'stats' ? 'grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'flex flex-col'}`}
            >
            {widget.id === 'stats' && (
              <>
                <Card className="border-emerald-100 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-1 opacity-10"><TrendingUp className="h-24 w-24" /></div>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                     <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Monthly Volume</CardTitle>
                     <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 tabular-nums">{projectedMonthlyUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })} units</div>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-medium">Est. flow from active accounts</p>
                  </CardContent>
                </Card>
                <Card className="border-blue-100 shadow-sm overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Pipeline Load</CardTitle>
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 tabular-nums">{pipelineUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })} units</div>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-medium">Potential upcoming demand</p>
                  </CardContent>
                </Card>
                <Card className="border-slate-100 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Base</CardTitle>
                    <Users className="h-4 w-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 tabular-nums">{activeCustomers}</div>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-medium">{customers.length} Contacts total</p>
                  </CardContent>
                </Card>
                 <Card className="border-amber-100 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Unit Volume</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 tabular-nums">{totalItemsSold.toLocaleString()}</div>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-medium">Lifetime units sold</p>
                  </CardContent>
                </Card>
              </>
            )}

            {widget.id === 'top_products' && (
              <Card className="h-full border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight">
                       <BarChart3 className="h-4 w-4 text-emerald-600" /> Top Product Velocity
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] mt-4">
                    {productSalesData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No orders logged yet.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={productSalesData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} width={80} tickLine={false} axisLine={false} />
                          <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                          <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {widget.id === 'recent_orders' && (
              <Card className="h-full border-slate-200 shadow-sm">
                 <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight">
                    <Clock className="h-4 w-4 text-slate-400" /> Real-time Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                  <div className="divide-y divide-slate-100">
                    {orders.slice(0, 5).map(order => {
                      const customer = customers.find(c => c.id === order.customerId);
                      return (
                        <div key={order.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                          <div className="space-y-0.5">
                            <p className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{customer?.company || customer?.name}</p>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase ${order.status === 'Cancelled' ? 'text-rose-500' : 'text-emerald-500'}`}>{order.status}</span>
                              <span className="text-[9px] text-slate-400 font-mono">{order.date}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <div className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full group-hover:bg-white transition-colors">
                              {order.items.reduce((s, i) => s + i.quantity, 0)} units
                            </div>
                            {order.items.length > 0 && (() => {
                              const product = products.find(p => p.id === order.items[0].productId);
                              return (
                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[100px]">
                                  {product?.name || 'Item'}
                                  {order.items.length > 1 ? ` + ${order.items.length - 1} more` : ''}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                    {orders.length === 0 && <p className="p-8 text-center text-xs text-slate-400 italic">No orders in queue.</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            {widget.id === 'pipeline' && (
              <Card className="h-full border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight">
                     <TrendingUp className="h-4 w-4 text-blue-500" /> Pipeline Funnel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] flex items-center justify-center relative">
                     <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pipelineData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                        >
                          {pipelineData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-black text-slate-900">{customers.length}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Leads</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                     {pipelineData.slice(0, 4).map((d, i) => (
                       <div key={d.name} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                          <span className="text-[10px] text-slate-500 font-medium truncate">{d.name}</span>
                       </div>
                     ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {widget.id === 'low_stock' && (
              <Card className="h-full border-slate-200 shadow-sm overflow-hidden bg-rose-50/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-rose-700">
                    <AlertTriangle className="h-4 w-4" /> Fulfillment Risk
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-rose-100">
                    {lowStockItems.map(p => (
                      <div key={p.id} className="p-4 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-900">{p.name}</p>
                          <p className="text-[10px] font-mono text-rose-500 font-bold uppercase tracking-widest">{p.status}</p>
                        </div>
                        <div className="text-right">
                           <div className="text-sm font-black text-slate-900">{p.stock}</div>
                           <div className="text-[9px] text-slate-400 uppercase font-bold">{p.unit} left</div>
                        </div>
                      </div>
                    ))}
                    {lowStockItems.length === 0 && (
                      <div className="p-12 text-center text-emerald-600 flex flex-col items-center gap-2">
                         <Check className="h-6 w-6" />
                         <span className="text-xs font-bold uppercase tracking-widest">Inventory OK</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {widget.id === 'task_summary' && (
              <Card className="h-full border-slate-200 shadow-sm">
                 <CardHeader className="pb-2 border-b">
                   <div className="flex items-center justify-between">
                     <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight">
                       <CalendarDays className="h-4 w-4 text-indigo-500" /> Operational Queue
                     </CardTitle>
                     <Badge variant="outline" className="text-[10px] font-bold uppercase bg-slate-50">{tasks.length} Active</Badge>
                   </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {taskStats.map((stat) => (
                      <div key={stat.name} className="space-y-3">
                         <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.name}</span>
                            <span className="text-xs font-black text-slate-900">{stat.value}</span>
                         </div>
                         <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full transition-all duration-1000 delay-500"
                              style={{ 
                                backgroundColor: stat.color,
                                width: tasks.length > 0 ? `${(stat.value / tasks.length) * 100}%` : 0 
                              }}
                            />
                         </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          );
        })}
      </div>
      
      <div className="flex items-center gap-3 p-4 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800">
        <div className="p-2 bg-emerald-500 rounded-lg">
          <HistoryIcon className="h-5 w-5 text-slate-900" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Pro Tip</p>
          <p className="text-sm text-slate-300">You can customize this layout by clicking the <Settings2 className="inline h-4 w-4 mx-1" /> icon. Your preferences are saved locally for consistency.</p>
        </div>
      </div>
    </div>
  );
};
