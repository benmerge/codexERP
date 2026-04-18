import React, { useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, UserPlus, KanbanSquare, ShoppingCart, Package, Truck, Menu, LogOut, Upload, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../../data/AppContext';
import mergeLogo from '../../assets/merge-impact-logo.png';
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
        <DialogContent className="max-w-md">
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

      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full border-r border-slate-800">
        <div className="p-6 flex items-center gap-3 text-white">
          <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center font-bold text-white shadow-lg shadow-emerald-500/20">
            M
          </div>
          <div>
            <span className="font-semibold text-lg tracking-tight block leading-tight">MiCRM Pro</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-400 font-medium' 
                    : 'hover:bg-slate-800 hover:text-white'
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
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-amber-300 transition-colors hover:bg-slate-800 hover:text-amber-200"
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
            <Button variant="ghost" size="icon" onClick={logout} className="text-slate-400 hover:text-white hover:bg-slate-800" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex flex-col items-center justify-center pt-4 border-t border-slate-800/50">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Powered by</span>
            <div className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
              <img src={mergeLogo} alt="Merge Impact" className="w-6 h-6 object-contain invert opacity-70" onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }} />
              <div className="hidden w-6 h-6 rounded-full border-2 border-current flex items-center justify-center relative">
                <div className="absolute bottom-0 w-4 h-3 bg-current rounded-t-full" style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 0, 50% 50%, 0 0)' }}></div>
              </div>
              <span className="text-sm font-semibold tracking-tight">Merge Impact</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export const Layout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-200 ease-in-out`}>
        <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <ClientLogoUpload />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
