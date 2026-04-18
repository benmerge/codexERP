import { useState, useEffect } from 'react';
import { type Recipe, type Ingredient, type RecipeIngredient, type RecipeMeasureUnit } from '../types';
import { Beaker, Plus, Save, Trash2, X, FolderOpen, Loader2 } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

const CATEGORY_ORDER: Array<Ingredient['category']> = ['Finished Good', 'Major Ingredient', 'Minor Ingredient'];
const MEASURE_UNITS: RecipeMeasureUnit[] = ['g', 'kg', 'ml'];

export function Recipes({ locationId }: { locationId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventory, setInventory] = useState<Ingredient[]>([]);
  const [isDrafting, setIsDrafting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draftFinishedGoodId, setDraftFinishedGoodId] = useState('');
  const [draftIngredients, setDraftIngredients] = useState<RecipeIngredient[]>([]);

  useEffect(() => {
    if (!locationId) return;

    const qInv = query(collection(db, 'inventory'));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      let items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Ingredient[];
      items = items.filter((i) => i.locationId === locationId || (!i.locationId && locationId === 'default'));
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
      items = items.filter((i) => i.locationId === locationId || (!i.locationId && locationId === 'default'));
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

  const groupedIngredients = CATEGORY_ORDER
    .filter((category) => category !== 'Finished Good')
    .map((category) => ({
      category,
      items: sourceIngredients.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);

  const addIngredientToDraft = (ingredientId: string) => {
    if (draftIngredients.find((ri) => ri.ingredientId === ingredientId)) return;
    setDraftIngredients([...draftIngredients, { ingredientId, amount: 0, unit: 'g' }]);
  };

  const removeIngredientFromDraft = (ingredientId: string) => {
    setDraftIngredients(draftIngredients.filter((ri) => ri.ingredientId !== ingredientId));
  };

  const updateDraftIngredient = (ingredientId: string, updates: Partial<RecipeIngredient>) => {
    setDraftIngredients(
      draftIngredients.map((ri) =>
        ri.ingredientId === ingredientId ? { ...ri, ...updates } : ri
      )
    );
  };

  const resetDraft = () => {
    setIsDrafting(false);
    setDraftFinishedGoodId('');
    setDraftIngredients([]);
  };

  const handleSaveRecipe = async () => {
    const finishedGood = inventory.find((item) => item.id === draftFinishedGoodId && item.category === 'Finished Good');
    const normalizedIngredients = draftIngredients.filter((ingredient) => ingredient.amount > 0);

    if (!finishedGood || normalizedIngredients.length === 0) return;

    try {
      await addDoc(collection(db, 'recipes'), {
        name: finishedGood.name,
        finishedGoodId: finishedGood.id,
        finishedGoodName: finishedGood.name,
        locationId,
        ingredients: normalizedIngredients,
      });
      resetDraft();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'recipes');
    }
  };

  const handleDeleteRecipe = async (id: string | undefined) => {
    if (!id || !window.confirm('Are you sure you want to delete this formula?')) return;
    try {
      await deleteDoc(doc(db, 'recipes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `recipes/${id}`);
    }
  };

  const getIngredientName = (id: string) => inventory.find((i) => i.id === id)?.name || 'Unknown';
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
        {!isDrafting && (
          <button
            onClick={() => setIsDrafting(true)}
            className="px-6 py-2.5 bg-zinc-900 text-white rounded text-[12px] font-bold flex items-center gap-2 hover:bg-black transition-colors"
          >
            <Plus className="h-4 w-4 text-accent" />
            NEW FORMULA
          </button>
        )}
      </div>

      {isDrafting && (
        <div className="technical-card p-8 bg-zinc-50/30 border-accent/20 animate-in zoom-in-95 duration-300">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between mb-8">
            <div className="flex-1 max-w-2xl space-y-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Finished Good Target</label>
                <select
                  className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/20"
                  value={draftFinishedGoodId}
                  onChange={(e) => setDraftFinishedGoodId(e.target.value)}
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
                <Beaker className="h-4 w-4" /> Ingredient Library
              </h4>
              <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
                {groupedIngredients.map((group) => (
                  <div key={group.category} className="rounded-2xl border border-zinc-100 bg-white/70 p-4">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                      {group.category}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => addIngredientToDraft(item.id)}
                          className="flex justify-between items-center p-3 rounded-xl border border-zinc-200 bg-white hover:border-accent hover:bg-zinc-50 transition-all text-left"
                        >
                          <div className="flex flex-col truncate">
                            <span className="text-[13px] font-medium text-zinc-700 truncate">{item.name}</span>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase">{item.unit}</span>
                          </div>
                          <Plus className="h-3.5 w-3.5 text-zinc-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Active Formula Composition</h4>
              <div className="space-y-3 min-h-[140px] bg-white/50 p-4 rounded-2xl border border-zinc-100">
                {draftIngredients.length === 0 ? (
                  <p className="text-zinc-400 text-sm italic py-16 text-center border-2 border-dashed border-zinc-100 rounded-xl">
                    Add ingredients from the library, then set the volume and measure for each line.
                  </p>
                ) : (
                  draftIngredients.map((ri) => (
                    <div key={ri.ingredientId} className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-[1.2fr_0.55fr_0.4fr_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-zinc-800 truncate">{getIngredientName(ri.ingredientId)}</div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.18em] mt-1">{getIngredientCategory(ri.ingredientId)}</div>
                      </div>
                      <input
                        type="number"
                        step="0.001"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-right font-mono text-[13px] font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                        value={ri.amount === 0 ? '' : ri.amount}
                        onChange={(e) => updateDraftIngredient(ri.ingredientId, { amount: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                      />
                      <select
                        className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-[12px] font-bold uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                        value={ri.unit}
                        onChange={(e) => updateDraftIngredient(ri.ingredientId, { unit: e.target.value as RecipeMeasureUnit })}
                      >
                        {MEASURE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeIngredientFromDraft(ri.ingredientId)}
                        className="p-2 text-zinc-300 hover:text-red-500 rounded transition-colors justify-self-end"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {draftIngredients.length > 0 && (
                <button
                  onClick={handleSaveRecipe}
                  disabled={!draftFinishedGoodId || draftIngredients.every((ingredient) => ingredient.amount <= 0)}
                  className="w-full mt-8 bg-accent text-zinc-900 py-4 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-100 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Finalize Formula
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
              <button
                onClick={() => handleDeleteRecipe(recipe.id)}
                className="p-1.5 opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all rounded"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
                    <span className="text-zinc-600 truncate">{getIngredientName(ri.ingredientId)}</span>
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
