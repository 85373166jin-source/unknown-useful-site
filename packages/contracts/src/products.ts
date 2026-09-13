export const PRODUCT_IDS = [
  'super',
  'anbu',
  'bundle',
  'vip_monthly',
  'svip_monthly',
  'partner_basic',
  'partner_advanced',
  'partner_top'
] as const;

export type SiteProductId = (typeof PRODUCT_IDS)[number];
