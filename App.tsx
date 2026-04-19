import React, { useState, useEffect, useRef, type ComponentType } from 'react';
import { ChefHat, LogIn, ExternalLink, Plus, Factory, RadioTower, Menu, X, LayoutDashboard, ScrollText, Warehouse, FlaskConical, Upload, Pencil, Power, Check } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Recipes } from './components/Recipes';
import { BatchMixBuilder } from './components/BatchCalculator';
import { auth, login, logout, onAuthStateChanged, type User, db } from './firebase';
import { collection, onSnapshot, query, setDoc, doc, getDocs, writeBatch, updateDoc, deleteField } from 'firebase/firestore';
import { type LocationDef } from './types';
import { crmConfig } from './config';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [locations, setLocations] = useState<LocationDef[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>('all');
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [isManagingLocations, setIsManagingLocations] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    const unsubscribe = onSnapshot(doc(db, 'settings', 'branding'), (snapshot) => {
      if (snapshot.exists()) {
        setClientLogo((snapshot.data().clientLogo as string | undefined) || null);
      } else {
        setClientLogo(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(query(collection(db, 'locations')), (snap) => {
      const locs = snap.docs
        .map((d) => ({ id: d.id, isActive: true, ...d.data() } as LocationDef))
        .sort((left, right) => left.name.localeCompare(right.name));
      if (locs.length === 0) {
        const defaultLoc = {
          id: 'default',
          name: 'Main Facility',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setDoc(doc(db, 'locations', 'default'), defaultLoc);
      } else {
        setLocations(locs);
        if (activeLocationId !== 'all' && !locs.find((l) => l.id === activeLocationId && l.isActive !== false)) {
          setActiveLocationId('all');
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
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (activeLocationId !== 'all') {
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
          if (data.locationId === activeLocationId || !data.locationId) {
            const newDocRef = doc(collection(db, 'recipes'));
            batch.set(newDocRef, { ...data, id: newDocRef.id, locationId: locId });
          }
        });

        await batch.commit();
      }

      setActiveLocationId(locId);
      setNewLocName('');
      setIsCreatingLocation(false);
      setIsManagingLocations(false);
    } catch (e) {
      console.error(e);
      alert('Failed to copy location structure.');
    }
  };

  const startEditingLocation = (location: LocationDef) => {
    setEditingLocationId(location.id);
    setEditingLocationName(location.name);
  };

  const handleRenameLocation = async (locationId: string) => {
    const trimmed = editingLocationName.trim();
    if (!trimmed) return;

    try {
      await updateDoc(doc(db, 'locations', locationId), {
        name: trimmed,
        updatedAt: new Date().toISOString(),
      });
      setEditingLocationId(null);
      setEditingLocationName('');
    } catch (error) {
      console.error(error);
      alert('Failed to update location name.');
    }
  };

  const handleToggleLocationActive = async (location: LocationDef) => {
    const nextActive = location.isActive === false;

    try {
      await updateDoc(doc(db, 'locations', location.id), {
        isActive: nextActive,
        updatedAt: new Date().toISOString(),
        deactivatedAt: nextActive ? deleteField() : new Date().toISOString(),
      });
      if (!nextActive && activeLocationId === location.id) {
        setActiveLocationId('all');
      }
    } catch (error) {
      console.error(error);
      alert(`Failed to ${nextActive ? 'reactivate' : 'deactivate'} location.`);
    }
  };

  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      alert('File is too large. Please select an image under 500KB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await setDoc(doc(db, 'settings', 'branding'), {
          clientLogo: reader.result as string,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (error) {
        console.error(error);
        alert('Failed to update logo.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const allowedDomains = ['@40centurygrain.com', '@40centurygrain.earth', '@mergeimpact.com'];
  const isAllowedDomain = user?.email ? allowedDomains.some((domain) => user.email!.endsWith(domain)) : false;
  const allowedDomainLabel = allowedDomains.join(', ');
  const activeNav = navItems.find((item) => item.id === activeTab) ?? navItems[0];
  const activeLocations = locations.filter((location) => location.isActive !== false);
  const inactiveLocations = locations.filter((location) => location.isActive === false);
  const locationOptions: LocationDef[] = [{ id: 'all', name: 'Total Inventory' }, ...activeLocations];
  const activeLocation = locationOptions.find((loc) => loc.id === activeLocationId) ?? locationOptions[0];

  if (!authReady) {
