import { useState, useEffect } from 'react';
import { ChefHat, LogIn, ExternalLink, MapPin, Plus } from 'lucide-react';
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

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(query(collection(db, 'locations')), (snap) => {
      const locs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LocationDef));
      if (locs.length === 0) {
        // Create default
        const defaultLoc = { id: 'default', name: 'Main Facility', createdAt: new Date().toISOString() };
        setDoc(doc(db, 'locations', 'default'), defaultLoc);
      } else {
        setLocations(locs);
        if (!locs.find(l => l.id === activeLocationId)) {
          setActiveLocationId(locs[0].id);
        }
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handleCreateLocation = async () => {
    if (!newLocName.trim()) return;
    try {
      const locId = 'loc_' + Date.now().toString();
      
      // 1. Create Location
      await setDoc(doc(db, 'locations', locId), {
        id: locId,
        name: newLocName.trim(),
        createdAt: new Date().toISOString()
      });

      // 2. Copy structure (recipes and inventory with 0 quantity)
      const batch = writeBatch(db);
      
      const invSnap = await getDocs(query(collection(db, 'inventory')));
      invSnap.docs.forEach(d => {
        const data = d.data();
        if (data.locationId === activeLocationId || (!data.locationId && activeLocationId === 'default')) {
          const newDocRef = doc(collection(db, 'inventory'));
          batch.set(newDocRef, { ...data, id: newDocRef.id, locationId: locId, quantityOnHand: 0 });
        }
      });

      const recSnap = await getDocs(query(collection(db, 'recipes')));
      recSnap.docs.forEach(d => {
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
  const isAllowedDomain = user?.email ? allowedDomains.some(domain => user.email!.endsWith(domain)) : false;
  const allowedDomainLabel = allowedDomains.join(', ');

  if (!authReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400 font-medium tracking-tight">Initializing MiRemix...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-amber-100 p-4 rounded-full">
              <ChefHat className="h-12 w-12 text-amber-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">MiRemix MRP</h1>
            <p className="text-slate-500">Production Management for 40 Century Grain</p>
          </div>
          <button
            onClick={() => login()}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-blue-200"
          >
            <LogIn className="h-5 w-5" />
            Sign in with Google
          </button>
          <p className="text-xs text-slate-400">Authorized domains: {allowedDomainLabel}</p>
        </div>
      </div>
    );
  }

  if (!isAllowedDomain) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 text-center space-y-4">
          <div className="text-red-500 font-bold text-xl uppercase tracking-tight">Access Restricted</div>
          <p className="text-slate-600">You are signed in as <span className="font-semibold">{user.email}</span>. Authorized domains: <span className="font-semibold">{allowedDomainLabel}</span>.</p>
          <button onClick={() => logout()} className="text-blue-600 font-bold hover:underline">Sign in with a different account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans bg-bg-main text-zinc-900">
      {/* Sidebar - Professional CRM Style */}
      <aside className="w-[280px] bg-bg-side text-white flex flex-col shrink-0">
        <div className="px-6 py-10 flex flex-col items-start gap-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-accent rounded flex items-center justify-center font-bold text-zinc-900">
              40C
            </div>
            <div className="flex flex-col">
              <span className="text-[16px] font-bold tracking-tight leading-none">MiRemix MRP</span>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mt-1">40 Century Grain</span>
            </div>
          </div>
          
          <div className="mt-4 w-full">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Current Location</label>
            <select
              value={activeLocationId}
              onChange={(e) => setActiveLocationId(e.target.value)}
              className="w-full bg-zinc-800 text-white border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
            {isCreatingLocation ? (
              <div className="mt-2 space-y-2">
                <input 
                  type="text" 
                  value={newLocName}
                  onChange={e => setNewLocName(e.target.value)}
                  placeholder="New Location Name"
                  className="w-full bg-zinc-800 border-zinc-700 rounded px-2 py-1 text-[12px] text-white focus:outline-none focus:border-accent"
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
            <NavTab active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} label="Production Dashboard" />
            <NavTab active={activeTab === 'recipes'} onClick={() => setActiveTab('recipes')} label="Recipe Manager" />
            <NavTab active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} label="Inventory Master" />
            <NavTab active={activeTab === 'batch'} onClick={() => setActiveTab('batch')} label="Batch Mix Builder" />
            
            <div className="my-6 border-t border-zinc-800 mx-2"></div>
            
            <a 
              href={crmConfig.appUrl}
              target="_blank" 
              rel="noreferrer"
              className="px-4 py-3 text-[13px] font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-all flex items-center justify-between group"
            >
              Back to CRM
              <ExternalLink className="h-4 w-4 opacity-50" />
            </a>
          </ul>
        </nav>

        <div className="p-6 border-t border-zinc-800 space-y-4">
           <div className="flex items-center gap-3">
              <img src={user.photoURL ?? ''} className="h-8 w-8 rounded-full border border-zinc-700" alt="" referrerPolicy="no-referrer" />
              <div className="flex-1 overflow-hidden">
                <p className="text-[12px] font-bold truncate">{user.displayName}</p>
                <button onClick={() => logout()} className="text-[10px] text-zinc-500 hover:text-white font-medium">Log out</button>
              </div>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-bg-main overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {activeTab === 'dashboard' && <Dashboard locationId={activeLocationId} />}
          {activeTab === 'inventory' && <Inventory locationId={activeLocationId} />}
          {activeTab === 'recipes' && <Recipes locationId={activeLocationId} />}
          {activeTab === 'batch' && <BatchMixBuilder locationId={activeLocationId} />}
        </div>
      </main>
    </div>
  );
}

function NavTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <li
      onClick={onClick}
      className={`px-4 py-2.5 text-[14px] font-medium cursor-pointer flex items-center gap-3 rounded transition-all ${
        active
          ? 'bg-zinc-800 text-accent font-bold'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      }`}
    >
      {label}
    </li>
  );
}
