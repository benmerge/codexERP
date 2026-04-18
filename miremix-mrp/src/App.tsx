import { useState, useEffect, type ComponentType } from 'react';
import { ChefHat, LogIn, ExternalLink, Plus, Factory, RadioTower, ShieldCheck, Sparkles, Menu, X, LayoutDashboard, ScrollText, Warehouse, FlaskConical } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Recipes } from './components/Recipes';
import { BatchMixBuilder } from './components/BatchCalculator';
import { auth, login, logout, onAuthStateChanged, type User, db } from './firebase';
import { collection, onSnapshot, query, setDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { type LocationDef } from './types';
import { crmConfig } from './config';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locations, setLocations] = useState<LocationDef[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>('default');
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
    { id: 'recipes', label: 'Recipe Manager', mobileLabel: 'Recipes', icon: ScrollText },
    { id: 'inventory', label: 'Inventory Master', mobileLabel: 'Stock', icon: Warehouse },
    { id: 'batch', label: 'Batch Mix Builder', mobileLabel: 'Batch', icon: FlaskConical },
  ] as const;

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(query(collection(db, 'locations')), (snap) => {
      const locs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LocationDef));
      if (locs.length === 0) {
        const defaultLoc = { id: 'default', name: 'Main Facility', createdAt: new Date().toISOString() };
        setDoc(doc(db, 'locations', 'default'), defaultLoc);
      } else {
        setLocations(locs);
        if (!locs.find((l) => l.id === activeLocationId)) {
          setActiveLocationId(locs[0].id);
        }
      }
    });
    return () => unsubscribe();
  }, [user, activeLocationId]);

  const handleCreateLocation = async () => {
    if (!newLocName.trim()) return;
    try {
      const locId = `loc_${Date.now().toString()}`;

      await setDoc(doc(db, 'locations', locId), {
        id: locId,
        name: newLocName.trim(),
        createdAt: new Date().toISOString(),
      });

      const batch = writeBatch(db);

      const invSnap = await getDocs(query(collection(db, 'inventory')));
      invSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.locationId === activeLocationId || (!data.locationId && activeLocationId === 'default')) {
          const newDocRef = doc(collection(db, 'inventory'));
          batch.set(newDocRef, { ...data, id: newDocRef.id, locationId: locId, quantityOnHand: 0 });
        }
      });

      const recSnap = await getDocs(query(collection(db, 'recipes')));
      recSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.locationId === activeLocationId || (!data.locationId && activeLocationId === 'default')) {
          const newDocRef = doc(collection(db, 'recipes'));
          batch.set(newDocRef, { ...data, id: newDocRef.id, locationId: locId });
        }
      });

      await batch.commit();

      setActiveLocationId(locId);
      setNewLocName('');
      setIsCreatingLocation(false);
    } catch (e) {
      console.error(e);
      alert('Failed to copy location structure.');
    }
  };

  const allowedDomains = ['@40centurygrain.com', '@40centurygrain.earth', '@mergeimpact.com'];
  const isAllowedDomain = user?.email ? allowedDomains.some((domain) => user.email!.endsWith(domain)) : false;
  const allowedDomainLabel = allowedDomains.join(', ');
  const activeNav = navItems.find((item) => item.id === activeTab) ?? navItems[0];

  if (!authReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400 font-medium tracking-tight">Initializing MiRemix...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(244,182,63,0.22),_transparent_30%),linear-gradient(180deg,_#0f172a,_#111827)] p-4">
        <div className="w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/95 shadow-[0_30px_120px_-40px_rgba(15,23,42,0.7)]">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden bg-[linear-gradient(160deg,_rgba(16,24,39,0.98),_rgba(30,41,59,0.96))] px-8 py-10 text-white sm:px-12">
              <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-amber-400/15 blur-3xl" />
              <div className="absolute bottom-0 left-10 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300/15 text-amber-200 ring-1 ring-amber-200/20">
                    <Factory className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-amber-200/70">40 Century Grain</div>
                    <h1 className="font-display text-4xl font-bold tracking-tight">MiRemix MRP</h1>
                  </div>
                </div>
                <p className="mt-8 max-w-xl text-lg leading-8 text-slate-200/92">
                  Production control for live order intake, inventory visibility, and shipment confirmation back into the CRM.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mrp-panel-label text-amber-200/70">Signal</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <RadioTower className="h-4 w-4 text-emerald-300" />
                      CRM Queue Live
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mrp-panel-label text-amber-200/70">Action</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <Sparkles className="h-4 w-4 text-amber-300" />
                      Mark Shipped Fast
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mrp-panel-label text-amber-200/70">Trust</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <ShieldCheck className="h-4 w-4 text-sky-300" />
                      Shared Status Sync
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(247,244,236,0.96))] p-8 sm:p-12">
              <div className="w-full space-y-6">
                <div className="flex justify-center lg:justify-start">
                  <div className="bg-amber-100 p-4 rounded-full">
                    <ChefHat className="h-12 w-12 text-amber-600" />
                  </div>
                </div>
                <div className="space-y-2 text-center lg:text-left">
                  <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">Shift-ready production cockpit</h2>
                  <p className="text-slate-500">Sign in with an approved company account to open the live production workspace.</p>
                </div>
                <button
                  onClick={() => login()}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 py-4 font-bold text-white transition-all hover:bg-black shadow-lg shadow-slate-300"
                >
                  <LogIn className="h-5 w-5" />
                  Sign in with Google
                </button>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
                  <div className="mrp-panel-label">Authorized Domains</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{allowedDomainLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAllowedDomain) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 text-center space-y-4">
          <div className="text-red-500 font-bold text-xl uppercase tracking-tight">Access Restricted</div>
          <p className="text-slate-600">
            You are signed in as <span className="font-semibold">{user.email}</span>. Authorized domains:{' '}
            <span className="font-semibold">{allowedDomainLabel}</span>.
          </p>
          <button onClick={() => logout()} className="text-blue-600 font-bold hover:underline">Sign in with a different account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mrp-shell flex h-screen w-full overflow-hidden font-sans bg-bg-main text-zinc-900">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-[296px] -translate-x-full bg-[radial-gradient(circle_at_top,_rgba(244,182,63,0.14),_transparent_24%),linear-gradient(180deg,_var(--color-bg-side),_var(--color-bg-side-soft))] text-white flex flex-col shrink-0 border-r border-white/6 transition-transform duration-200 lg:static lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : ''}`}>
        <div className="px-6 py-8 flex flex-col items-start gap-4 border-b border-white/8">
          <div className="flex w-full items-center justify-between lg:hidden">
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200/70">Navigation</span>
            <button
              type="button"
              className="rounded-full border border-white/10 p-2 text-zinc-300"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-white/10">
              <Factory className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200/70">Merge Ops</span>
              <span className="font-display text-[22px] font-bold tracking-tight leading-none">MiRemix MRP</span>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mt-1">40 Century Grain</span>
            </div>
          </div>

          <div className="w-full rounded-[1.4rem] border border-white/8 bg-white/5 p-4 backdrop-blur">
            <div className="mrp-panel-label text-amber-200/70">Realtime Link</div>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Pending CRM orders flow in here for production and sync back the moment you ship.
            </p>
          </div>

          <div className="mt-4 w-full">
            <label className="mrp-panel-label mb-2 block text-zinc-500">Current Location</label>
            <select
              value={activeLocationId}
              onChange={(e) => setActiveLocationId(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/6 px-3 py-3 text-sm text-white focus:outline-none focus:border-accent"
            >
              {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
            {isCreatingLocation ? (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="New Location Name"
                  className="w-full rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-[12px] text-white focus:outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <button onClick={handleCreateLocation} className="text-[11px] font-bold text-accent hover:text-white">SAVE</button>
                  <button onClick={() => setIsCreatingLocation(false)} className="text-[11px] font-bold text-zinc-500 hover:text-white">CANCEL</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingLocation(true)}
                className="mt-2 text-[11px] font-bold text-accent flex items-center gap-1 hover:text-white transition-colors"
                title="Creates a new location with copied structure and 0 inventory"
              >
                <Plus className="h-3 w-3" /> CREATE LOCATION
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 px-4 py-8">
          <ul className="list-none p-0 m-0 flex flex-col gap-1">
            {navItems.map((item) => (
              <NavTab
                key={item.id}
                active={activeTab === item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                label={item.label}
                icon={item.icon}
              />
            ))}

            <div className="my-6 border-t border-white/8 mx-2"></div>

            <a
              href={crmConfig.appUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-3 text-[13px] font-medium text-zinc-400 hover:text-white hover:bg-white/6 rounded-2xl transition-all flex items-center justify-between group"
            >
              Back to CRM
              <ExternalLink className="h-4 w-4 opacity-50" />
            </a>
          </ul>
        </nav>

        <div className="p-6 border-t border-white/8 space-y-4">
          <div className="rounded-[1.35rem] border border-emerald-300/10 bg-emerald-300/8 px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-200/70">
              <RadioTower className="h-3.5 w-3.5" />
              Sync Status
            </div>
            <div className="mt-2 text-sm font-semibold text-white">CRM Connected</div>
          </div>
          <div className="flex items-center gap-3">
            <img src={user.photoURL ?? ''} className="h-8 w-8 rounded-full border border-zinc-700" alt="" referrerPolicy="no-referrer" />
            <div className="flex-1 overflow-hidden">
              <p className="text-[12px] font-bold truncate">{user.displayName}</p>
              <button onClick={() => logout()} className="text-[10px] text-zinc-500 hover:text-white font-medium">Log out</button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-transparent overflow-hidden">
        <div className="border-b border-black/5 bg-white/70 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-slate-700 shadow-sm"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="mrp-panel-label">MiRemix MRP</div>
              <div className="truncate font-display text-xl font-bold tracking-tight text-zinc-950">{activeNav.label}</div>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
              Live
            </div>
          </div>
        </div>
        <div className="border-b border-black/5 bg-white/50 px-6 py-5 backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mrp-panel-label">Production Control</div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-950">Live fulfillment workspace</h2>
              <p className="mt-1 text-sm text-ink-soft">Monitor the queue, keep stock balanced, and push shipment completion back to CRM.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-700">
                Shared Order Feed
              </div>
              <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-700">
                Shipping Sync Enabled
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-28 md:p-8 lg:pb-8">
          {activeTab === 'dashboard' && <Dashboard locationId={activeLocationId} />}
          {activeTab === 'inventory' && <Inventory locationId={activeLocationId} />}
          {activeTab === 'recipes' && <Recipes locationId={activeLocationId} />}
          {activeTab === 'batch' && <BatchMixBuilder locationId={activeLocationId} />}
        </div>

        <div className="border-t border-black/5 bg-white/88 px-2 py-2 backdrop-blur-xl lg:hidden">
          <div className="grid grid-cols-4 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-300'
                      : 'text-zinc-500 hover:bg-white'
                  }`}
                >
                  <Icon className="mb-1 h-4 w-4" />
                  <span>{item.mobileLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavTab({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <li
      onClick={onClick}
      className={`px-4 py-3 text-[14px] font-medium cursor-pointer flex items-center gap-3 rounded-2xl transition-all ${
        active
          ? 'bg-white/10 text-accent font-bold shadow-inner shadow-black/10'
          : 'text-zinc-400 hover:text-white hover:bg-white/6'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </li>
  );
}
