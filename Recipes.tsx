import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { type Recipe, type Ingredient, type RecipeIngredient, type RecipeMeasureUnit } from '../types';
import { Beaker, Plus, Save, Trash2, X, FolderOpen, Loader2, Upload, Pencil } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { normalizeIngredient } from '../lib/inventoryCategories';

const CATEGORY_ORDER: Array<Ingredient['category']> = ['Finished Good', 'Major Ingredient', 'Minor Ingredient'];
const MEASURE_UNITS: RecipeMeasureUnit[] = ['g', 'kg', 'ml'];
const FORMULA_LINE_CATEGORIES: Array<Ingredient['category']> = ['Major Ingredient', 'Minor Ingredient', 'Finished Good'];

interface DraftRecipeIngredient extends RecipeIngredient {
  ingredientCategory: Ingredient['category'];
}

const normalizeLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/recipes?\s*-\s*/g, '')
    .replace(/\.csv$/g, '')
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const getMatchTokens = (value: string) =>
  normalizeLabel(value)
    .split(' ')
    .filter((token) => token.length > 1);

const scoreMatch = (left: string, right: string) => {
  const leftTokens = getMatchTokens(left);
  const rightTokens = getMatchTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(leftTokens.length, rightTokens.length);
};

const pickBestMatch = <T,>(
  items: T[],
  getLabel: (item: T) => string,
  target: string,
  minimumScore = 0.45
): T | undefined => {
  let best: { item: T; score: number } | null = null;

  items.forEach((item) => {
    const label = getLabel(item);
    const normalizedLabel = normalizeLabel(label);
    const normalizedTarget = normalizeLabel(target);

    let score = scoreMatch(label, target);
    if (normalizedLabel === normalizedTarget) score = 1;
    else if (normalizedLabel.includes(normalizedTarget) || normalizedTarget.includes(normalizedLabel)) {
      score = Math.max(score, 0.9);
    }

    if (!best || score > best.score) {
      best = { item, score };
    }
  });

  return best && best.score >= minimumScore ? best.item : undefined;
};

const getRowValue = (row: Record<string, string>, aliases: string[]) => {
  const keys = Object.keys(row);
  const normalizedMap = new Map(keys.map((key) => [key.toLowerCase().trim(), key]));
  for (const alias of aliases) {
    const actualKey = normalizedMap.get(alias.toLowerCase().trim());
    if (actualKey) {
      return String(row[actualKey] || '').trim();
    }
  }
  return '';
};

const getRecipeUnit = (rawUnit: string): RecipeMeasureUnit => {
  const normalized = rawUnit.trim().toLowerCase();
  if (normalized === 'kg') return 'kg';
  if (normalized === 'ml') return 'ml';
  return 'g';
};

const buildRecipePayload = (
  finishedGood: Ingredient,
  ingredients: RecipeIngredient[],
  locationId: string
) => {
  const payload: {
    name: string;
    finishedGoodId: string;
    finishedGoodName: string;
    ingredients: RecipeIngredient[];
    locationId?: string;
  } = {
    name: finishedGood.name,
    finishedGoodId: finishedGood.id,
    finishedGoodName: finishedGood.name,
    ingredients,
  };

  if (locationId !== 'all') {
    payload.locationId = locationId;
  }

  return payload;
};

export function Recipes({ locationId }: { locationId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventory, setInventory] = useState<Ingredient[]>([]);
  const [isDrafting, setIsDrafting] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editingRecipeLocationId, setEditingRecipeLocationId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [draftFinishedGoodId, setDraftFinishedGoodId] = useState('');
  const [newFinishedGoodName, setNewFinishedGoodName] = useState('');
  const [newFinishedGoodUnit, setNewFinishedGoodUnit] = useState('units');
  const [draftIngredients, setDraftIngredients] = useState<DraftRecipeIngredient[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!locationId) return;

    const qInv = query(collection(db, 'inventory'));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      let items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Ingredient[];
      items = items.map(normalizeIngredient);
      if (locationId === 'all') {
        const grouped = new Map<string, Ingredient>();
        items.forEach((item) => {
          const key = `${item.name}__${item.category}__${item.unit}`;
          if (!grouped.has(key)) {
            grouped.set(key, { ...item, id: key, locationId: 'all' });
          }
        });
        items = Array.from(grouped.values());
      } else {
        items = items.filter((i) => i.locationId === locationId || (!i.locationId && locationId === 'default'));
      }
      items.sort((a, b) => {
        const categoryRank = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (categoryRank !== 0) return categoryRank;
        return a.name.localeCompare(b.name);
      });
      setInventory(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'inventory');
    });

    const qRec = query(collection(db, 'recipes'));
    const unsubRec = onSnapshot(qRec, (snapshot) => {
      let items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Recipe[];
      items = items.filter((i) =>
        locationId === 'all'
          ? true
          : i.locationId === locationId || !i.locationId || (!i.locationId && locationId === 'default')
      );
      setRecipes(items);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'recipes');
      setLoading(false);
    });

    return () => {
      unsubInv();
      unsubRec();
    };
  }, [locationId]);

  const finishedGoods = inventory.filter((item) => item.category === 'Finished Good');
  const sourceIngredients = inventory.filter((item) => item.category !== 'Finished Good');

  const addDraftLine = (category: Ingredient['category'] = 'Major Ingredient') => {
    setDraftIngredients((current) => [
      ...current,
      {
        ingredientId: '',
        ingredientName: '',
        ingredientCategory: category,
        amount: 0,
        unit: 'g',
      },
    ]);
  };

  const removeDraftLine = (index: number) => {
    setDraftIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateDraftIngredient = (index: number, updates: Partial<DraftRecipeIngredient>) => {
    setDraftIngredients((current) =>
      current.map((line, currentIndex) => {
