import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'disabled';
export type ContactKind = 'phone' | 'email';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  phone_hmac: string | null;
  phone_mask: string | null;
  phone_bound_at: number | null;
  phone_verified_at: number | null;
  email_hmac: string | null;
  email_mask: string | null;
  email_bound_at: number | null;
  email_verified_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ContactRecord {
  hmac: string | null;
  mask: string | null;
  boundAt: number | null;
}

const USER_COLUMNS = [
  'id',
  'username',
  'password_hash',
  'role',
  'status',
  'phone_hmac',
  'phone_mask',
  'phone_bound_at',
  'phone_verified_at',
  'email_hmac',
  'email_mask',
  'email_bound_at',
  'email_verified_at',
  'created_at',
  'updated_at'
].join(', ');

export interface CreateUserInput {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  phone: ContactRecord;
  email: ContactRecord;
  createdAt: number;
  updatedAt: number;
}

export function buildInsertUserStatement(db: D1Database, input: CreateUserInput): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO users (
      id, username, password_hash, role, status,
      phone_hmac, phone_mask, phone_bound_at,
      email_hmac, email_mask, email_bound_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.id,
    input.username,
    input.passwordHash,
    input.role,
    input.phone.hmac,
    input.phone.mask,
    input.phone.boundAt,
    input.email.hmac,
    input.email.mask,
    input.email.boundAt,
    input.createdAt,
    input.updatedAt
  );
}

export function buildUpdateUserPasswordStatement(
  db: D1Database,
  userId: string,
  passwordHash: string,
  updatedAt: number
): D1PreparedStatement {
  return db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(
    passwordHash,
    updatedAt,
    userId
  );
}

export function buildBindUserContactStatement(
  db: D1Database,
  userId: string,
  kind: ContactKind,
  contact: ContactRecord,
  updatedAt: number
): D1PreparedStatement {
  if (kind === 'phone') {
    return db.prepare(
      'UPDATE users SET phone_hmac = ?, phone_mask = ?, phone_bound_at = ?, phone_verified_at = NULL, updated_at = ? WHERE id = ?'
    ).bind(contact.hmac, contact.mask, contact.boundAt, updatedAt, userId);
  }
  return db.prepare(
    'UPDATE users SET email_hmac = ?, email_mask = ?, email_bound_at = ?, email_verified_at = NULL, updated_at = ? WHERE id = ?'
  ).bind(contact.hmac, contact.mask, contact.boundAt, updatedAt, userId);
}

export function buildUnbindUserContactStatement(
  db: D1Database,
  userId: string,
  kind: ContactKind,
  updatedAt: number
): D1PreparedStatement {
  if (kind === 'phone') {
    return db.prepare(
      'UPDATE users SET phone_hmac = NULL, phone_mask = NULL, phone_bound_at = NULL, phone_verified_at = NULL, updated_at = ? WHERE id = ?'
    ).bind(updatedAt, userId);
  }
  return db.prepare(
    'UPDATE users SET email_hmac = NULL, email_mask = NULL, email_bound_at = NULL, email_verified_at = NULL, updated_at = ? WHERE id = ?'
  ).bind(updatedAt, userId);
}

export async function findUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`).bind(username).first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
}

export async function findUserByContactHmac(
  db: D1Database,
  kind: ContactKind,
  hmac: string
): Promise<UserRow | null> {
  const column = kind === 'phone' ? 'phone_hmac' : 'email_hmac';
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE ${column} = ?`).bind(hmac).first<UserRow>();
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<UserRow> {
  await buildInsertUserStatement(db, input).run();

  const created = await findUserById(db, input.id);
  if (!created) {
    throw new Error('Failed to load the newly created user');
  }
  return created;
}

export async function updateUserPassword(
  db: D1Database,
  userId: string,
  passwordHash: string,
  updatedAt: number
): Promise<void> {
  await buildUpdateUserPasswordStatement(db, userId, passwordHash, updatedAt).run();
}

export async function bindUserContact(
  db: D1Database,
  userId: string,
  kind: ContactKind,
  contact: ContactRecord,
  updatedAt: number
): Promise<UserRow | null> {
  await buildBindUserContactStatement(db, userId, kind, contact, updatedAt).run();
  return findUserById(db, userId);
}

export async function unbindUserContact(
  db: D1Database,
  userId: string,
  kind: ContactKind,
  updatedAt: number
): Promise<UserRow | null> {
  await buildUnbindUserContactStatement(db, userId, kind, updatedAt).run();
  return findUserById(db, userId);
}
