import { CATALOG, type Category, type CourseProductId, type Product } from '@site/contracts';

export const PRODUCT_SORT_ORDER: Record<CourseProductId, number> = {
  super: 1,
  bundle: 2,
  anbu: 3
};

export function listProducts(): Product[] {
  return (Object.keys(CATALOG.products) as CourseProductId[])
    .sort((left, right) => PRODUCT_SORT_ORDER[left] - PRODUCT_SORT_ORDER[right])
    .map((id) => CATALOG.products[id]);
}

export function listCategories(): Category[] {
  return CATALOG.categories.map((category) => ({ ...category }));
}
