import { z } from 'zod';
import { PRODUCT_IDS, type SiteProductId } from './products';

export * from './money';
export * from './identity';
export * from './products';

export const ProductIdSchema = z.enum(PRODUCT_IDS);
export type ProductId = SiteProductId;

export const CourseProductIdSchema = z.enum(['super', 'anbu', 'bundle']);
export type CourseProductId = z.infer<typeof CourseProductIdSchema>;

export const ProductTypeSchema = z.enum([
  'course',
  'membership',
  'partner_opening',
  'digital',
  'service',
  'other'
]);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const ProductStatusSchema = z.enum(['active', 'presale', 'coming_soon']);
export const ProductSchema = z.object({
  id: ProductIdSchema,
  title: z.string().min(1),
  priceYuan: z.number().int().min(0),
  productType: ProductTypeSchema,
  status: ProductStatusSchema,
  categoryId: z.string().min(1),
  description: z.string().min(1)
});
export type Product = z.infer<typeof ProductSchema>;

export const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mediaPath: z.string().refine(
    (value) => value.startsWith('/') || value.startsWith('https://'),
    'Media path must be a local path or HTTPS URL'
  ),
  coverPath: z.string().startsWith('/'),
  order: z.number().int().positive()
});
export type Lesson = z.infer<typeof LessonSchema>;

export const SeriesSchema = z.object({
  id: z.enum(['super', 'anbu']),
  title: z.string().min(1),
  status: z.enum(['active', 'coming_soon']),
  lessons: z.array(LessonSchema)
});
export type Series = z.infer<typeof SeriesSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export * from './catalog';
export * from './comments';
