import React, { useState, useRef } from 'react';
import { useAppContext } from '../data/AppContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, UploadCloud } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerCategory, PipelineStage, Customer } from '../types';
import Papa from 'papaparse';
import { EditCustomerDialog } from '../components/EditCustomerDialog';

export const Prospects = () => {
  const { customers, salesReps, addCustomer, addCustomers, updateCustomer, user } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<CustomerCategory>('Retail');
  const [salesRepId, setSalesRepId] = useState('');
  const defaultRep = salesReps.find((rep) => rep.id === user?.uid);

  const handleAddProspect = (e: React.FormEvent) => {
    e.preventDefault();
    const salesRep = salesReps.find((rep) => rep.id === salesRepId) || salesReps.find((rep) => rep.id === user?.uid);
    addCustomer({
      id: `c${Date.now()}`,
      name,
      company,
      email,
      phone,
      salesRepId: salesRep?.id,
      salesRepName: salesRep?.displayName || salesRep?.email,
      salesRepEmail: salesRep?.email,
      isProspect: true,
      category,
      pipelineStage: 'Lead',
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newProspects: Customer[] = results.data.map((row: any, index) => {
          // Map columns: Retailer, Communication History w/ dates, Scheduled Check-ins, Reorder Dates, Performance Check, Product Feedback
          const companyName = row['Retailer'] || 'Unknown Retailer';
          
          const notes = [];
          if (row['Communication History w/ dates']) notes.push({ id: `n1-${index}`, text: `Communication: ${row['Communication History w/ dates']}`, date: new Date().toISOString().split('T')[0] });
          if (row['Scheduled Check-ins']) notes.push({ id: `n2-${index}`, text: `Check-ins: ${row['Scheduled Check-ins']}`, date: new Date().toISOString().split('T')[0] });
          if (row['Reorder Dates']) notes.push({ id: `n3-${index}`, text: `Reorders: ${row['Reorder Dates']}`, date: new Date().toISOString().split('T')[0] });
          if (row['Performance Check']) notes.push({ id: `n4-${index}`, text: `Performance: ${row['Performance Check']}`, date: new Date().toISOString().split('T')[0] });
          if (row['Product Feedback']) notes.push({ id: `n5-${index}`, text: `Feedback: ${row['Product Feedback']}`, date: new Date().toISOString().split('T')[0] });

          return {
            id: `imported-${Date.now()}-${index}`,
            name: 'Unknown Contact',
            company: companyName,
            email: '',
            phone: '',
            salesRepId: defaultRep?.id,
            salesRepName: defaultRep?.displayName || defaultRep?.email,
            salesRepEmail: defaultRep?.email,
            isProspect: true,
            category: 'Retail',
            pipelineStage: 'Lead',
            lastContact: new Date().toISOString().split('T')[0],
            notes
          };
        });

        if (newProspects.length > 0) {
          addCustomers(newProspects);
          alert(`Successfully imported ${newProspects.length} prospects!`);
        } else {
          alert('No valid data found in the CSV. Make sure it has a "Retailer" column.');
        }
        
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        alert('Failed to parse CSV file.');
      }
    });
  };

  const filteredProspects = customers.filter(c => 
    c.isProspect &&
    (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Lead': return 'bg-slate-100 text-slate-800';
      case 'Contacted': return 'bg-blue-100 text-blue-800';
      case 'Qualified': return 'bg-indigo-100 text-indigo-800';
      case 'Proposal': return 'bg-amber-100 text-amber-800';
      case 'Negotiation': return 'bg-orange-100 text-orange-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Prospects</h2>
          <p className="text-slate-500">Manage your leads and potential new business.</p>
        </div>
        
        <div className="flex gap-2">
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <Button 
            variant="outline" 
            className="text-slate-600"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="mr-2 h-4 w-4" /> Import CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger render={(props) => (
              <Button {...props} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="mr-2 h-4 w-4" /> Add Prospect
              </Button>
            )} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Prospect</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddProspect} className="space-y-4 pt-4">
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
                <Select value={salesRepId} onValueChange={setSalesRepId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesReps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.displayName || rep.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Save Prospect
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="search"
                placeholder="Search prospects..."
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
                  <TableHead className="w-[20%]">Company</TableHead>
                  <TableHead className="w-[20%]">Contact Name</TableHead>
                  <TableHead className="w-[20%]">Contact Info</TableHead>
                  <TableHead className="w-[12%]">Rep</TableHead>
                  <TableHead className="w-[10%]">Category</TableHead>
                  <TableHead className="w-[8%]">Stage</TableHead>
                  <TableHead className="w-[10%] text-right">Last Contact</TableHead>
                  <TableHead className="w-[10%] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProspects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                      No prospects found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProspects.map((prospect) => (
                    <TableRow 
                      key={prospect.id} 
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setEditingCustomer(prospect)}
                    >
                      <TableCell className="font-medium text-slate-900">{prospect.company || prospect.name || '-'}</TableCell>
                      <TableCell>{prospect.company ? prospect.name : ''}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {prospect.email ? (
                            <a href={`mailto:${prospect.email}`} onClick={(e) => e.stopPropagation()} className="text-emerald-700 hover:text-emerald-600 hover:underline">{prospect.email}</a>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {prospect.phone ? (
                            <a href={`tel:${prospect.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-emerald-600 hover:underline">{prospect.phone}</a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{prospect.salesRepName || prospect.salesRepEmail || 'Unassigned'}</TableCell>
                      <TableCell>{prospect.category}</TableCell>
                      <TableCell>
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 block md:hidden">
                          {prospect.pipelineStage}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-slate-500">{prospect.lastContact}</TableCell>
                      <TableCell className="text-right flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <Select 
                          value={prospect.pipelineStage} 
                          onValueChange={(val: PipelineStage) => updateCustomer({...prospect, pipelineStage: val})}
                        >
                          <SelectTrigger className="h-8 w-[130px] border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Lead">Lead</SelectItem>
                            <SelectItem value="Contacted">Contacted</SelectItem>
                            <SelectItem value="Proposal">Proposal</SelectItem>
                            <SelectItem value="Closed Won">Closed Won</SelectItem>
                            <SelectItem value="Closed Lost">Closed Lost</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
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
