// Per-process singleton DB client. Wraps @torus/db for the web app.
import 'server-only';
import { getDb } from '@torus/db';

export const db = getDb();
export * from '@torus/db';
