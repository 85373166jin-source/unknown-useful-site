import { CATALOG, type Category, type Product, type ProductId } from '@site/contracts';

export const PRODUCT_SORT_ORDER: Record<ProductId, number> = {
  super: 1,
  bundle: 2,
  anbu: 3
};

export function listProducts(): Product[] {
  return (Object.keys(CATALOG.products) as ProductId[])
    .sort((left, right) => PRODUCT_SORT_ORDER[left] - PRODUCT_SORT_ORDER[right])
    .map((id) => CATALOG.products[id]);
}

export function listCategories(): Category[] {
  return CATALOG.categories.map((category) => ({ ...category }));
}