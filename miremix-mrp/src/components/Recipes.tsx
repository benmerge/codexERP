import { useState, useEffect } from 'react';
import { type Recipe, type Ingredient, type RecipeIngredient } from '../types';
import { Beaker, Plus, Save, Trash2, X, FolderOpen, Loader2 } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export function Recipes({ locationId }: { locationId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventory, setInventory] = useState<Ingredient[]>([]);
  const [isDrafting, setIsDrafting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [draftIngredients, setDraftIngredients] = useState<RecipeIngredient[]>([]);

  useEffect(() => {
    if (!locationId) return;

    // Sync Inventory for selection
    const qInv = query(collection(db, 'inventory'));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Ingredient[];
      items = items.filter(i => i.locationId === locationId || (!i.locationId && locationId === 'default'));
      setInventory(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'inventory');
    });

    // Sync Recipes
    const qRec = query(collection(db, 'recipes'));
    const unsubRec = onSnapshot(qRec, (snapshot) => {
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Recipe[];
      items = items.filter(i => i.locationId === locationId || (!i.locationId && locationId === 'default'));
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

  const addIngredientToDraft = (ingredientId: string) => {
    if (draftIngredients.find(ri => ri.ingredientId === ingredientId)) return;
    setDraftIngredients([...draftIngredients, { ingredientId, amount: 0 }]);
  };

  const removeIngredientFromDraft = (ingredientId: string) => {
    setDraftIngredients(draftIngredients.filter(ri => ri.ingredientId !== ingredientId));
  };

  const updateAmount = (ingredientId: string, amount: number) => {
    setDraftIngredients(draftIngredients.map(ri => 
      ri.ingredientId === ingredientId ? { ...ri, amount } : ri
    ));
  };

  const handleSaveRecipe = async () => {
    if (!draftName || draftIngredients.length === 0) return;
    
    try {
      await addDoc(collection(db, 'recipes'), {
        name: draftName,
        locationId,
        ingredients: draftIngredients
      });
      setIsDrafting(false);
      setDraftName('');
      setDraftIngredients([]);
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

  const getIngredientName = (id: string) => inventory.find(i => i.id === id)?.name || 'Unknown';
  const getIngredientUnit = (id: string) => inventory.find(i => i.id === id)?.unit || '';

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-zinc-200 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Recipe Formulas</h2>
          <p className="text-[13px] text-zinc-500 mt-1">Master production ratios and SKU logic</p>
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
          <div className="flex justify-between items-start mb-8">
            <div className="flex-1 max-w-xl">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Finished Good Target</label>
              <select
                className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              >
                <option value="">Select a Finished Good...</option>
                {inventory.filter(i => i.category === 'Finished Good').map(fg => (
                  <option key={fg.id} value={fg.name}>{fg.name}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={() => setIsDrafting(false)}
              className="p-2 text-zinc-400 hover:text-zinc-600 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mt-6"
            >
              <X className="h-5 w-5" /> CANCEL
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Beaker className="h-4 w-4" /> Available Ingredients
              </h4>
              <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-2 bg-white/50 p-2 rounded-lg border border-zinc-100">
                {inventory.filter(i => i.category !== 'Finished Good').map(item => (
                  <button
                    key={item.id}
                    onClick={() => addIngredientToDraft(item.id)}
                    className="flex justify-between items-center p-3 rounded-lg border border-zinc-200 bg-white hover:border-accent hover:bg-zinc-50 transition-all text-left"
                  >
                    <div className="flex flex-col truncate">
                      <span className="text-[13px] font-medium text-zinc-700 truncate">{item.name}</span>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase">{item.category}</span>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-zinc-300" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Active Formulation Composition</h4>
              <div className="space-y-3 min-h-[100px] bg-white/50 p-4 rounded-lg border border-zinc-100">
                {draftIngredients.length === 0 ? (
                  <p className="text-zinc-400 text-sm italic py-12 text-center border-2 border-dashed border-zinc-100 rounded-xl">
                    Select components from the inventory to build ratio
                  </p>
                ) : (
                  draftIngredients.map(ri => (
                    <div key={ri.ingredientId} className="flex items-center gap-4 p-4 bg-white border border-zinc-200 rounded-lg group animate-in slide-in-from-right-2">
                      <div className="flex-1">
                        <span className="text-[13px] font-bold text-zinc-800">{getIngredientName(ri.ingredientId)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="w-24 bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 text-right font-mono text-[13px] font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                          value={ri.amount === 0 ? '' : ri.amount}
                          onChange={(e) => updateAmount(ri.ingredientId, parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase w-8">{getIngredientUnit(ri.ingredientId)}</span>
                      </div>
                      <button
                        onClick={() => removeIngredientFromDraft(ri.ingredientId)}
                        className="p-1.5 text-zinc-300 hover:text-red-500 rounded transition-colors"
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
                  disabled={!draftName || draftIngredients.length === 0}
                  className="w-full mt-8 bg-accent text-zinc-900 py-4 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-100 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  FINALIZE FORMULA
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading && <div className="col-span-full py-20 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Syncing Master Formulas...
        </div>}
        
        {recipes.map(recipe => (
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
            
            <h4 className="text-lg font-bold text-zinc-900 mb-6 flex-1 leading-tight">{recipe.name}</h4>
            
            <div className="space-y-2 mb-6">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Ratio Composition</p>
              <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {recipe.ingredients.map((ri, idx) => (
                  <div key={idx} className="flex justify-between text-[12px] py-1 border-b border-zinc-50 last:border-0">
                    <span className="text-zinc-600 truncate mr-4">{getIngredientName(ri.ingredientId)}</span>
                    <span className="font-mono font-bold text-zinc-900 shrink-0">
                      {ri.amount} <span className="text-[9px] text-zinc-400 uppercase font-sans">{getIngredientUnit(ri.ingredientId)}</span>
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
            <p className="text-zinc-400 text-[12px] mt-1">Start by creating a new production formula.</p>
          </div>
        )}
      </div>
    </div>
  );
}

