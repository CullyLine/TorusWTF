export * as schema from './schema';
export { users, handleHistory, sessions, magicLinks } from './schema';
export type {
  HandleHistory,
  User,
  NewUser,
  Session,
  NewSession,
  MagicLink,
  NewMagicLink,
} from './schema';
export { getDb, closeDb, type Db } from './client';
