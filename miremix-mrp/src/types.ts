export interface LocationDef {
  id: string;
  name: string;
  createdAt?: string;
}

export interface Ingredient {
  id: string;
  locationId?: string;
  name: string;
  unit: string; // kg, g, units
  category: 'Major Ingredient' | 'Minor Ingredient' | 'Finished Good';
  quantityOnHand: number;
  lastUpdated?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  amount: number;
}

export interface Recipe {
  id: string;
  locationId?: string;
  name: string;
  ingredients: RecipeIngredient[];
}
