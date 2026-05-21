export * as schema from './schema';
export {
  users,
  handleHistory,
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
} from './schema';
export type {
  HandleHistory,
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
} from './schema';
export { getDb, closeDb, type Db } from './client';
