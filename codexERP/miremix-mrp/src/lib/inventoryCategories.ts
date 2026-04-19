import { type Ingredient } from '../types';

export const INVENTORY_CATEGORIES: Ingredient['category'][] = [
  'Finished Good',
  'Major Ingredient',
  'Minor Ingredient',
];

export const normalizeInventoryCategory = (
  rawCategory: unknown,
  itemName: string
): Ingredient['category'] => {
  const lowCat = String(rawCategory || '').toLowerCase().trim();
  const lowName = String(itemName || '').toLowerCase().trim();

  if (
    lowCat.includes('finished') ||
    lowCat.includes('good') ||
    lowCat.includes('product') ||
    lowCat === 'fg'
  ) {
    return 'Finished Good';
  }

  if (
    lowCat.includes('minor') ||
    lowCat === 'mi'
  ) {
    return 'Minor Ingredient';
  }

  if (
    lowCat.includes('major') ||
    lowCat === 'maj'
  ) {
    return 'Major Ingredient';
  }

  if (
    lowName.includes('mix') ||
    lowName.includes('granola') ||
    lowName.includes('cookie') ||
    lowName.includes('bag') ||
    lowName.includes('finished good')
  ) {
    return 'Finished Good';
  }

  return 'Major Ingredient';
};

export const normalizeIngredient = (item: Ingredient): Ingredient => ({
  ...item,
  category: normalizeInventoryCategory(item.category, item.name),
});
