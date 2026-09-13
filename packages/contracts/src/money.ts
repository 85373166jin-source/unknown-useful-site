import { z } from 'zod';

export const MoneyCentsSchema = z.number().int().nonnegative();
export type MoneyCents = z.infer<typeof MoneyCentsSchema>;

export function yuanToCents(value: number | string): number {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error('Invalid yuan amount: ' + text);
  const whole = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return whole * 100 + Number(fraction);
}

export function centsToYuanString(cents: number): string {
  MoneyCentsSchema.parse(cents);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return whole + '.' + fraction;
}

export function discountedCents(cents: number, tier: 'normal' | 'vip' | 'svip'): number {
  MoneyCentsSchema.parse(cents);
  const rateBps = tier === 'svip' ? 5000 : tier === 'vip' ? 8000 : 10000;
  return Math.round((cents * rateBps) / 10000);
}
