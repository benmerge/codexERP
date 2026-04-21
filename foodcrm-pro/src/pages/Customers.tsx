import React, { useState } from 'react';
import { useAppContext } from '../data/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerCategory, PipelineStage, Customer, OrgMember } from '../types';
import { EditCustomerDialog } from '../components/EditCustomerDialog';

export const Customers = () => {
  const { customers, salesReps, addCustomer, updateCustomer, user } = useAppContext();
  const safeSalesReps = Array.isArray(salesReps) ? salesReps : [];
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<CustomerCategory>('Retail');
  const [salesRepId, setSalesRepId] = useState('');
  const repLabel = (rep: OrgMember) =>
    rep.displayName?.trim() ||
    rep.email?.trim() ||
    'Assigned rep';

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const salesRep = safeSalesReps.find((rep) => rep.id === salesRepId);
    addCustomer({
      id: `c${Date.now()}`,
      name,
      company,
      email,
      phone,
      salesRepId: salesRep?.id || '',
      salesRepName: salesRep?.displayName || salesRep?.email || 'Assigned rep',
      salesRepEmail: salesRep?.email || '',
      isProspect: false,
      category,
      pipelineStage: 'Closed Won',
      lastContact: new Date().toISOString().split('T')[0],
      notes: []
    });
    setIsDialogOpen(false);
    // Reset form
    setName('');
    setCompany('');
    setEmail('');
    setPhone('');
    setCategory('Retail');
    setSalesRepId(user?.uid || '');
  };

  const filteredCustomers = customers.filter(c => 
    !c.isProspect &&
    (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Closed Won': return 'bg-emerald-100 text-emerald-800';
      case 'Closed Lost': return 'bg-rose-100 text-rose-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h2>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger render={(props) => (
            <Button {...props} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="mr-2 h-4 w-4" /> Add Customer
            </Button>
          )} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCustomer} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Contact Name</Label>
                <Input id="name" required value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" required value={company} onChange={e => setCompany(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v: CustomerCategory) => setCategory(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Wholesale">Wholesale</SelectItem>
                    <SelectItem value="Distributor">Distributor</SelectItem>
                    <SelectItem value="Partner">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Rep</Label>
                <Select value={salesRepId || 'unassigned'} onValueChange={(v) => setSalesRepId(v === 'unassigned' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {safeSalesReps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {repLabel(rep)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Save Customer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="search"
                placeholder="Search customers..."
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
                  <TableHead>Company</TableHead>
                  <TableHead>Contact Name</TableHead>
                  <TableHead>Contact Info</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Last Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                      No customers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id} 
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setEditingCustomer(customer)}
                    >
                      <TableCell className="font-medium text-slate-900">{customer.company || customer.name || '-'}</TableCell>
                      <TableCell>{customer.company ? customer.name : ''}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {customer.email ? (
                            <a href={`mailto:${customer.email}`} onClick={(e) => e.stopPropagation()} className="text-emerald-700 hover:text-emerald-600 hover:underline">{customer.email}</a>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {customer.phone ? (
                            <a href={`tel:${customer.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-emerald-600 hover:underline">{customer.phone}</a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{customer.salesRepName || customer.salesRepEmail || 'Unassigned'}</TableCell>
                      <TableCell>{customer.category}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`border-none ${getStatusColor(customer.pipelineStage)}`}>
                          {customer.pipelineStage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-500">{customer.lastContact}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EditCustomerDialog 
        customer={editingCustomer} 
        open={!!editingCustomer} 
        onOpenChange={(open) => !open && setEditingCustomer(null)} 
        onSave={(updatedCustomer) => {
          updateCustomer(updatedCustomer);
          setEditingCustomer(null);
        }} 
      />
    </div>
  );
};
