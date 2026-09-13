import { z } from 'zod';

export const ProductIdSchema = z.enum(['super', 'anbu', 'bundle']);
export type ProductId = z.infer<typeof ProductIdSchema>;

export const ProductStatusSchema = z.enum(['active', 'presale', 'coming_soon']);
export const ProductSchema = z.object({
  id: ProductIdSchema,
  title: z.string().min(1),
  priceYuan: z.number().int().min(0),
  status: ProductStatusSchema,
  categoryId: z.string().min(1),
  description: z.string().min(1)
});
export type Product = z.infer<typeof ProductSchema>;

export const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mediaPath: z.string().startsWith('/'),
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
