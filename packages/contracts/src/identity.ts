import { z } from 'zod';

export const PermissionRoleSchema = z.enum(['user', 'admin', 'owner']);
export const MembershipTierSchema = z.enum(['normal', 'vip', 'svip']);
export const PartnerLevelSchema = z.enum(['none', 'basic', 'advanced', 'top']);

export type PermissionRole = z.infer<typeof PermissionRoleSchema>;
export type MembershipTier = z.infer<typeof MembershipTierSchema>;
export type PartnerLevel = z.infer<typeof PartnerLevelSchema>;

export const MEMBERSHIP_DAYS = 30;
export const MEMBERSHIP_DAY_MS = 24 * 60 * 60 * 1000;
