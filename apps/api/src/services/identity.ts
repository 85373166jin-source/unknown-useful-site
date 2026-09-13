import { PermissionRoleSchema, type PermissionRole } from '@site/contracts';

export function effectivePermissionRole(permissionRole: PermissionRole): PermissionRole {
  return PermissionRoleSchema.parse(permissionRole);
}
