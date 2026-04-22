export interface LocationDef {
  id: string;
  name: string;
  orgId?: string;
  sourceApp?: string;
  createdAt?: string;
  isActive?: boolean;
  updatedAt?: string;
  deactivatedAt?: string;
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

export type RecipeMeasureUnit = 'g' | 'kg' | 'ml';

export interface RecipeIngredient {
  ingredientId: string;
  ingredientName?: string;
  amount: number;
  unit: RecipeMeasureUnit;
}

export interface Recipe {
  id: string;
  locationId?: string;
  name: string;
  finishedGoodId?: string;
  finishedGoodName?: string;
  ingredients: RecipeIngredient[];
}
