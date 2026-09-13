import {
  discountedCents,
  MembershipTierSchema,
  MoneyCentsSchema,
  type MembershipTier,
  type ProductType
} from '@site/contracts';

const DISCOUNTABLE_PRODUCT_TYPES = new Set<ProductType>(['course', 'digital']);

export interface PriceableProduct {
  price_cents: number;
  product_type: ProductType;
}

export interface MembershipForPricing {
  tier: MembershipTier;
}

export function priceForTier(cents: number, productType: ProductType, tier: MembershipTier): number {
  MoneyCentsSchema.parse(cents);
  MembershipTierSchema.parse(tier);

  if (!DISCOUNTABLE_PRODUCT_TYPES.has(productType)) {
    return cents;
  }

  return discountedCents(cents, tier);
}

export function priceProductForUser(
  product: PriceableProduct,
  membership: MembershipForPricing
): number {
  return priceForTier(product.price_cents, product.product_type, membership.tier);
}
