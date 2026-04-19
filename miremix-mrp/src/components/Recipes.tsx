import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';
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

type ParsedRecipeRow = {
  finishedGoodName: string;
  ingredientName: string;
  ingredientCategory?: string;
  amount: number;
  unit: RecipeMeasureUnit;
};

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

const pickBestMatch = <T extends { name: string }>(
  items: T[],
  target: string,
  minimumScore = 0.45
): T | undefined => {
  let best: { item: T; score: number } | null = null;

  items.forEach((item) => {
    const label = item.name;
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
        if (currentIndex !== index) return line;
        const nextLine = { ...line, ...updates };
        if (updates.ingredientCategory && updates.ingredientCategory !== line.ingredientCategory) {
          nextLine.ingredientId = '';
          nextLine.ingredientName = '';
        }
        return nextLine;
      })
    );
  };

  const resetDraft = () => {
    setIsDrafting(false);
    setEditingRecipeId(null);
    setEditingRecipeLocationId('all');
    setDraftFinishedGoodId('');
    setNewFinishedGoodName('');
    setNewFinishedGoodUnit('units');
    setDraftIngredients([]);
  };

  const beginDraft = () => {
    setStatus(null);
    setIsDrafting(true);
    setEditingRecipeId(null);
    setEditingRecipeLocationId(locationId);
    setDraftFinishedGoodId('');
    setNewFinishedGoodName('');
    setNewFinishedGoodUnit('units');
    if (draftIngredients.length === 0) {
      setDraftIngredients([
        {
          ingredientId: '',
          ingredientName: '',
          ingredientCategory: 'Major Ingredient',
          amount: 0,
          unit: 'g',
        },
      ]);
    }
  };

  const beginEditRecipe = (recipe: Recipe) => {
    setStatus(null);
    setIsDrafting(true);
    setEditingRecipeId(recipe.id);
    setEditingRecipeLocationId(recipe.locationId || 'all');
    setDraftFinishedGoodId(recipe.finishedGoodId || '');
    setNewFinishedGoodName(recipe.finishedGoodName || recipe.name || '');
    setNewFinishedGoodUnit(
      inventory.find((item) => item.id === recipe.finishedGoodId || item.name === recipe.finishedGoodName)?.unit || 'units'
    );
    setDraftIngredients(
      recipe.ingredients.map((ingredient) => ({
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.ingredientName || getIngredientName(ingredient.ingredientId),
        ingredientCategory: (inventory.find((item) => item.id === ingredient.ingredientId)?.category || 'Major Ingredient') as Ingredient['category'],
        amount: ingredient.amount,
        unit: ingredient.unit || 'g',
      }))
    );
  };

  const matchFinishedGood = (fileName: string): Ingredient | undefined => {
    return pickBestMatch(finishedGoods, fileName, 0.34);
  };

  const matchIngredient = (rawName: string): Ingredient | undefined => {
    const candidates = [
      rawName,
      rawName.split(',')[0],
      rawName.replace(/\s+-\s+.*/, ''),
      rawName.replace(/\s*\([^)]*\)/g, ''),
    ]
      .map((candidate) => candidate.trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      const exactish = pickBestMatch(sourceIngredients, candidate, 0.5);
      if (exactish) return exactish;
    }

    return undefined;
  };

  const buildRecipeLine = (row: {
    ingredientName: string;
    ingredientCategory?: string;
    amount: number;
    unit: RecipeMeasureUnit;
  }) => {
    const ingredient = matchIngredient(row.ingredientName);
    if (!ingredient) {
      return {
        error: row.ingredientName,
      } as const;
    }

    if (
      row.ingredientCategory &&
      ingredient.category !== row.ingredientCategory &&
      row.ingredientCategory !== 'Finished Good'
    ) {
      return {
        error: `${row.ingredientName} (expected ${row.ingredientCategory}, found ${ingredient.category})`,
      } as const;
    }

    return {
      recipeIngredient: {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        amount: row.amount,
        unit: row.unit,
      } satisfies RecipeIngredient,
    } as const;
  };

  const handleSaveRecipe = async () => {
    let finishedGood = inventory.find((item) => item.id === draftFinishedGoodId && item.category === 'Finished Good');
    const recipeLocationId = editingRecipeLocationId || locationId;

    if (!finishedGood && newFinishedGoodName.trim()) {
      const targetLocationId = recipeLocationId === 'all' ? 'default' : recipeLocationId;
      const finishedGoodRef = doc(collection(db, 'inventory'));
      finishedGood = {
        id: finishedGoodRef.id,
        name: newFinishedGoodName.trim(),
        category: 'Finished Good',
        unit: newFinishedGoodUnit || 'units',
        quantityOnHand: 0,
        locationId: targetLocationId,
        lastUpdated: new Date().toISOString(),
      };

      try {
        await setDoc(finishedGoodRef, finishedGood);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'inventory');
        setStatus({ type: 'error', msg: 'Failed to create the finished good for this formula.' });
        return;
      }
    }

    if (!finishedGood) {
      setStatus({ type: 'error', msg: 'Choose a finished good or create a new one before saving the formula.' });
      return;
    }

    const normalizedIngredients = draftIngredients
      .filter((ingredient) => ingredient.ingredientId && ingredient.amount > 0)
      .map((ingredient) => ({
        ingredientId: ingredient.ingredientId,
        ingredientName:
          inventory.find((item) => item.id === ingredient.ingredientId)?.name ||
          ingredient.ingredientName ||
          'Unknown',
        amount: ingredient.amount,
        unit: ingredient.unit,
      }));

    if (normalizedIngredients.length === 0) {
      setStatus({ type: 'error', msg: 'Add at least one ingredient line with an amount greater than zero.' });
      return;
    }

    try {
      const payload = buildRecipePayload(finishedGood, normalizedIngredients, recipeLocationId);
      if (editingRecipeId) {
        await updateDoc(doc(db, 'recipes', editingRecipeId), payload);
        setStatus({ type: 'success', msg: `Updated formula for ${finishedGood.name}.` });
      } else {
        await addDoc(collection(db, 'recipes'), payload);
        setStatus({ type: 'success', msg: `Saved formula for ${finishedGood.name}.` });
      }
      resetDraft();
    } catch (err) {
      handleFirestoreError(err, editingRecipeId ? OperationType.UPDATE : OperationType.CREATE, 'recipes');
      setStatus({ type: 'error', msg: `Failed to ${editingRecipeId ? 'update' : 'save'} formula.` });
    }
  };

  const handleRecipeUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows: ParsedRecipeRow[] = (results.data as Record<string, string>[])
            .map((row): ParsedRecipeRow => {
              const finishedGoodName = getRowValue(row, ['finished_good', 'finished good']);
              const ingredientName = getRowValue(row, ['ingredient_name', 'ingredient name', 'Ingredients', 'Ingredient', 'Name', 'Item']);
              const ingredientCategory = getRowValue(row, ['ingredient_category', 'ingredient category', 'category']);
              const amountValue = getRowValue(row, ['amount', 'g per package', 'grams per package', 'Qty', 'Quantity']);
              const unitValue = getRowValue(row, ['unit', 'uom']);
              const amount = parseFloat(amountValue.replace(/[^0-9.-]/g, ''));

              return {
                finishedGoodName,
                ingredientName,
                ingredientCategory: ingredientCategory || undefined,
                amount,
                unit: getRecipeUnit(unitValue),
              };
            })
            .filter((row) =>
              row.ingredientName &&
              row.ingredientName.toLowerCase() !== 'total' &&
              !Number.isNaN(row.amount)
            );

          if (rows.length === 0) {
            throw new Error('No ingredient lines were imported from the CSV.');
          }

          const hasFinishedGoodColumn = rows.some((row) => row.finishedGoodName);

          if (hasFinishedGoodColumn) {
            const groupedRows = new Map<string, typeof rows>();
            rows.forEach((row) => {
              const key = row.finishedGoodName.trim();
              if (!key) return;
              const existing = groupedRows.get(key) || [];
              existing.push(row);
              groupedRows.set(key, existing);
            });

            if (groupedRows.size === 0) {
              throw new Error('The CSV includes a finished_good column, but no finished good names were found.');
            }

            const importedNames: string[] = [];
            const unmatchedMessages: string[] = [];

            for (const [finishedGoodLabel, recipeRows] of groupedRows.entries()) {
              const finishedGood = pickBestMatch(finishedGoods, finishedGoodLabel, 0.45);
              if (!finishedGood) {
                unmatchedMessages.push(`Missing finished good: ${finishedGoodLabel}`);
                continue;
              }

              const recipeIngredients: RecipeIngredient[] = [];
              recipeRows.forEach((row) => {
                const result = buildRecipeLine(row);
                if ('error' in result) {
                  unmatchedMessages.push(`${finishedGoodLabel}: ${result.error}`);
                  return;
                }
                recipeIngredients.push(result.recipeIngredient);
              });

              if (recipeIngredients.length === 0) {
                unmatchedMessages.push(`${finishedGoodLabel}: no ingredient lines matched inventory`);
                continue;
              }

              await addDoc(collection(db, 'recipes'), {
                ...buildRecipePayload(finishedGood, recipeIngredients, locationId),
              });

              importedNames.push(finishedGood.name);
            }

            if (unmatchedMessages.length > 0) {
              throw new Error(`Imported ${importedNames.length} recipe(s), but some rows still need cleanup: ${unmatchedMessages.join('; ')}`);
            }

            setStatus({
              type: 'success',
              msg: `Imported ${importedNames.length} recipe${importedNames.length === 1 ? '' : 's'} from ${file.name}.`,
            });
            return;
          }

          const finishedGood = matchFinishedGood(file.name);
          if (!finishedGood) {
            throw new Error(`Could not match a finished good from "${file.name}". Add that finished good to Inventory Master first.`);
          }

          const unmatched: string[] = [];
          const recipeIngredients: RecipeIngredient[] = [];

          rows.forEach((row) => {
            const result = buildRecipeLine(row);
            if ('error' in result) {
              unmatched.push(result.error);
              return;
            }
            recipeIngredients.push(result.recipeIngredient);
          });

          if (recipeIngredients.length === 0) {
            throw new Error('No ingredient lines were imported from the CSV.');
          }

          if (unmatched.length > 0) {
            throw new Error(`Could not match these ingredients in inventory: ${unmatched.join(', ')}`);
          }

          await addDoc(collection(db, 'recipes'), buildRecipePayload(finishedGood, recipeIngredients, locationId));

          setStatus({ type: 'success', msg: `Imported recipe for ${finishedGood.name} with ${recipeIngredients.length} ingredient lines.` });
        } catch (error) {
          setStatus({ type: 'error', msg: error instanceof Error ? error.message : 'Failed to import recipe CSV.' });
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        setIsImporting(false);
        setStatus({ type: 'error', msg: `CSV parsing error: ${error.message}` });
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  const handleDeleteRecipe = async (id: string | undefined) => {
    if (!id || !window.confirm('Are you sure you want to delete this formula?')) return;
    try {
      await deleteDoc(doc(db, 'recipes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `recipes/${id}`);
    }
  };

  const getIngredientName = (id: string, fallbackName?: string) => inventory.find((i) => i.id === id)?.name || fallbackName || 'Unknown';
  const getIngredientCategory = (id: string) => inventory.find((i) => i.id === id)?.category || 'Unknown';
  const getFinishedGoodName = (recipe: Recipe) =>
    recipe.finishedGoodName ||
    inventory.find((item) => item.id === recipe.finishedGoodId)?.name ||
    recipe.name;

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-zinc-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Recipe Formulas</h2>
          <p className="text-[13px] text-zinc-500 mt-1">Tie each finished good to a real ingredient bill and measurement plan.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleRecipeUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-4 py-2.5 border border-zinc-200 bg-white text-zinc-700 rounded text-[12px] font-bold flex items-center gap-2 hover:bg-zinc-50 transition-colors disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {isImporting ? 'IMPORTING...' : 'IMPORT RECIPE CSV'}
          </button>
          {!isDrafting && (
            <button
              onClick={beginDraft}
              className="px-6 py-2.5 bg-zinc-900 text-white rounded text-[12px] font-bold flex items-center gap-2 hover:bg-black transition-colors"
            >
              <Plus className="h-4 w-4 text-accent" />
              NEW FORMULA
            </button>
          )}
        </div>
      </div>

      {status && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] ${
          status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {status.msg}
        </div>
      )}

      {isDrafting && (
        <div className="technical-card p-8 bg-zinc-50/30 border-accent/20 animate-in zoom-in-95 duration-300">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between mb-8">
            <div className="flex-1 max-w-2xl space-y-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Finished Good Target</label>
                <select
                  className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/20"
                  value={draftFinishedGoodId}
                  onChange={(e) => {
                    setDraftFinishedGoodId(e.target.value);
                    if (e.target.value) {
                      setNewFinishedGoodName('');
                    }
                  }}
                >
                  <option value="">Select a Finished Good...</option>
                  {finishedGoods.map((fg) => (
                    <option key={fg.id} value={fg.id}>
                      {fg.name} ({fg.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_ORDER.map((category) => (
                  <span
                    key={category}
                    className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] ${
                      category === 'Finished Good'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : category === 'Major Ingredient'
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {category}
                  </span>
                ))}
              </div>
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-4">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                  Or create a new finished good
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                  <input
                    type="text"
                    value={newFinishedGoodName}
                    onChange={(e) => {
                      setNewFinishedGoodName(e.target.value);
                      if (e.target.value.trim()) {
                        setDraftFinishedGoodId('');
                      }
                    }}
                    placeholder="New finished good name"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  <select
                    value={newFinishedGoodUnit}
                    onChange={(e) => setNewFinishedGoodUnit(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    <option value="units">units</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                  </select>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {locationId === 'all'
                    ? 'New finished goods created here start in Main Facility and roll into Total Inventory.'
                    : 'The new finished good will be created in this location and used for the formula.'}
                </p>
              </div>
            </div>
            <button
              onClick={resetDraft}
              className="p-2 text-zinc-400 hover:text-zinc-600 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
            >
              <X className="h-5 w-5" /> Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-8">
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Beaker className="h-4 w-4" /> Formula Setup
              </h4>
              <div className="rounded-2xl border border-zinc-100 bg-white/70 p-4 space-y-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-[13px] text-zinc-600">
                  Choose the finished good first, then add recipe lines with category, ingredient, amount, and unit.
                </div>
                <div className="flex flex-wrap gap-2">
                  {FORMULA_LINE_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => addDraftLine(category)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-600 hover:bg-zinc-50"
                    >
                      <Plus className="mr-2 inline h-3 w-3" />
                      {category}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {finishedGoods.length === 0
                    ? 'Add a Finished Good in Inventory Master before creating a formula.'
                    : `${finishedGoods.length} finished good${finishedGoods.length === 1 ? '' : 's'} available.`}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Active Formula Composition</h4>
              <div className="space-y-3 min-h-[140px] bg-white/50 p-4 rounded-2xl border border-zinc-100">
                {draftIngredients.length === 0 ? (
                  <p className="text-zinc-400 text-sm italic py-16 text-center border-2 border-dashed border-zinc-100 rounded-xl">
                    Add a formula line, choose its category, then select the ingredient and amount.
                  </p>
                ) : (
                  draftIngredients.map((ri, index) => {
                    const categoryInventory = inventory.filter((item) => item.category === ri.ingredientCategory);
                    return (
                    <div key={`${ri.ingredientId || 'draft'}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-[0.8fr_1.2fr_0.5fr_0.35fr_auto] md:items-center">
                      <select
                        className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-[12px] font-bold uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                        value={ri.ingredientCategory}
                        onChange={(e) => updateDraftIngredient(index, { ingredientCategory: e.target.value as Ingredient['category'] })}
                      >
                        {FORMULA_LINE_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <div className="min-w-0">
                        <select
                          className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-[13px] font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                          value={ri.ingredientId}
                          onChange={(e) => {
                            const ingredient = inventory.find((item) => item.id === e.target.value);
                            updateDraftIngredient(index, {
                              ingredientId: e.target.value,
                              ingredientName: ingredient?.name || '',
                            });
                          }}
                        >
                          <option value="">Select ingredient...</option>
                          {categoryInventory.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.18em] mt-1">
                          {ri.ingredientId ? getIngredientCategory(ri.ingredientId) : ri.ingredientCategory}
                        </div>
                      </div>
                      <input
                        type="number"
                        step="0.001"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-right font-mono text-[13px] font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                        value={ri.amount === 0 ? '' : ri.amount}
                        onChange={(e) => updateDraftIngredient(index, { amount: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                      />
                      <select
                        className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-[12px] font-bold uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                        value={ri.unit}
                        onChange={(e) => updateDraftIngredient(index, { unit: e.target.value as RecipeMeasureUnit })}
                      >
                        {MEASURE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeDraftLine(index)}
                        className="p-2 text-zinc-300 hover:text-red-500 rounded transition-colors justify-self-end"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )})
                )}
              </div>

              {draftIngredients.length > 0 && (
                <button
                  onClick={handleSaveRecipe}
                  disabled={(!draftFinishedGoodId && !newFinishedGoodName.trim()) || draftIngredients.every((ingredient) => ingredient.amount <= 0)}
                  className="w-full mt-8 bg-accent text-zinc-900 py-4 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-100 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {editingRecipeId ? 'Update Formula' : 'Finalize Formula'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading && (
          <div className="col-span-full py-20 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Syncing Master Formulas...
          </div>
        )}
        
        {recipes.map((recipe) => (
          <div key={recipe.id} className="technical-card p-6 flex flex-col group hover:border-zinc-300 transition-all">
            <div className="flex justify-between items-start mb-6">
              <div className="p-2 rounded bg-zinc-100 text-zinc-400">
                <Beaker className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => beginEditRecipe(recipe)}
                  className="p-1.5 text-zinc-300 hover:text-zinc-600 transition-all rounded"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteRecipe(recipe.id)}
                  className="p-1.5 text-zinc-300 hover:text-red-500 transition-all rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="mb-6">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Finished Good</div>
              <h4 className="text-lg font-bold text-zinc-900 leading-tight">{getFinishedGoodName(recipe)}</h4>
            </div>
            
            <div className="space-y-2 mb-6">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Bill Of Ingredients</p>
              <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {recipe.ingredients.map((ri, idx) => (
                  <div key={idx} className="flex justify-between text-[12px] py-1 border-b border-zinc-50 last:border-0 gap-3">
                    <span className="text-zinc-600 truncate">{getIngredientName(ri.ingredientId, ri.ingredientName)}</span>
                    <span className="font-mono font-bold text-zinc-900 shrink-0">
                      {ri.amount} <span className="text-[9px] text-zinc-400 uppercase font-sans">{ri.unit || 'g'}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
              <span>REF-ID: {recipe.id?.slice(0, 8)}</span>
              <Beaker className="h-3.5 w-3.5 opacity-30" />
            </div>
          </div>
        ))}

        {!loading && recipes.length === 0 && !isDrafting && (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-zinc-100 rounded-lg">
            <FolderOpen className="h-10 w-10 text-zinc-200 mx-auto mb-4" />
            <p className="text-zinc-500 font-bold tracking-tight">Formula Database Empty</p>
            <p className="text-zinc-400 text-[12px] mt-1">Start by creating a finished-good recipe with measured ingredient lines.</p>
          </div>
        )}
      </div>
    </div>
  );
}
