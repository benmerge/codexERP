import React, { useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, UserPlus, KanbanSquare, ShoppingCart, Package, Truck, Menu, LogOut, Upload, RotateCcw, AlertTriangle, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../../data/AppContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ClientLogoUpload = () => {
  const { clientLogo, updateClientLogo } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to ~500kb to be safe for Firestore document size limits)
    if (file.size > 500 * 1024) {
      alert('File is too large. Please select an image under 500KB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      updateClientLogo(base64String);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center">
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
      />
      
      {clientLogo ? (
        <div 
          className="relative group cursor-pointer h-10 w-32 flex items-center justify-end"
          onClick={() => fileInputRef.current?.click()}
          title="Click to change logo"
        >
          <img src={clientLogo} alt="Client Logo" className="max-h-full max-w-full object-contain" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
            <Upload className="w-4 h-4 text-white" />
          </div>
        </div>
      ) : (
        <Button 
          variant="outline" 
          size="sm" 
          className="text-slate-500 border-dashed"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-2" />
          Add Company Logo
        </Button>
      )}
    </div>
  );
};

const Sidebar = ({ onClose }: { onClose?: () => void }) => {
  const { user, logout, seedSharedTestOrg } = useAppContext();
  const [isResetOpen, setIsResetOpen] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Customers', path: '/customers' },
    { icon: UserPlus, label: 'Prospects', path: '/prospects' },
    { icon: KanbanSquare, label: 'Kanban Board', path: '/kanban' },
    { icon: ShoppingCart, label: 'Sales & Orders', path: '/sales' },
    { icon: Package, label: 'Product Catalog', path: '/products' },
    { icon: Truck, label: 'Suppliers', path: '/suppliers' },
  ];
  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.substring(0, 2).toUpperCase();
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await seedSharedTestOrg();
      setIsResetOpen(false);
    } catch (error) {
      console.error('Failed to reset shared test org:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to reset shared test org: ${message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="max-w-md crm-panel">
          <DialogHeader>
            <DialogTitle>Reset Shared Test Org</DialogTitle>
            <DialogDescription>
              This clears the shared CRM test workspace and reseeds it with fresh demo customers, products, suppliers, tasks, and orders.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>All CRM users and the MiRemix MRP dashboard will immediately see the new shared test dataset.</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetOpen(false)} disabled={isResetting}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleReset} disabled={isResetting}>
              {isResetting ? 'Resetting...' : 'Reset And Seed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <aside className="h-full w-[88vw] max-w-72 bg-slate-950 text-slate-300 flex flex-col border-r border-slate-800">
        <div className="p-6 text-white">
          <div className="mb-5 flex items-center justify-between md:hidden">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Navigation</div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-white/8">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-100 ring-1 ring-slate-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">CRM</span>
              <span className="font-semibold text-xl tracking-tight block leading-tight text-white">MiCRM Pro</span>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Shared Data
            </div>
            <p className="mt-2 text-sm leading-5 text-slate-400">
              Customers, orders, products, suppliers, and tasks update for the whole team.
            </p>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive 
                    ? 'bg-slate-800 text-white font-medium' 
                    : 'hover:bg-slate-900 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setIsResetOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-amber-200 transition-colors hover:bg-slate-900 hover:text-amber-100"
          >
            <RotateCcw className="w-5 h-5" />
            Reset Test Org
          </button>
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between px-3 py-2 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-white overflow-hidden">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  getInitials(user?.displayName || user?.email)
                )}
              </div>
              <div className="flex flex-col max-w-[100px]">
                <span className="text-sm font-medium text-white truncate">{user?.displayName || 'User'}</span>
                <span className="text-xs text-slate-500 truncate">{user?.email}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-slate-400 hover:text-white hover:bg-white/8" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};

export const Layout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <div className="crm-shell flex h-screen w-full overflow-hidden font-sans">
      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-[2px] md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-200 ease-in-out`}>
        <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:h-20 md:px-6 md:py-0">
          <div className="flex h-full flex-col justify-center gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3 md:items-center md:gap-4">
            <Button variant="ghost" size="icon" className="mt-0.5 md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
              <div>
                <div className="crm-kicker">CRM</div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-3">
                  <h1 className="text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">Shared CRM Workspace</h1>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 md:text-[11px] md:tracking-[0.24em]">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Online
              </div>
              <div className="hidden sm:flex">
                <ClientLogoUpload />
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6 xl:p-8">
          <div className="mx-auto max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};