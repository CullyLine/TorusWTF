export * as schema from './schema.js';
export {
  users,
  sessions,
  magicLinks,
  clips,
  clipTags,
  votes,
  comments,
  follows,
  weeklyCharts,
  reports,
  moderationLog,
} from './schema.js';
export type {
  User,
  NewUser,
  Session,
  NewSession,
  MagicLink,
  NewMagicLink,
  Clip,
  NewClip,
  Vote,
  Comment,
  Follow,
  WeeklyChart,
  Report,
  ModerationLogEntry,
} from './schema.js';
export { getDb, closeDb, type Db } from './client.js';
