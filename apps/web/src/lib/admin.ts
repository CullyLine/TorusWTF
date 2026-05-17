import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from './auth.js';
import type { User } from '@torus/db';

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUserFromCookies();
  if (!user || user.role !== 'admin') {
    redirect('/signin?error=Admin+access+required');
  }
  return user;
}

const EMERGENCY_KEY = 'admin:emergency_stop';

export async function isEmergencyStopActive(): Promise<boolean> {
  if (process.env.EMERGENCY_STOP?.toLowerCase() === 'true') return true;
  const { getRedis } = await import('./redis.js');
  const flag = await getRedis().get(EMERGENCY_KEY);
  return flag === '1';
}

export async function setEmergencyStop(active: boolean): Promise<void> {
  const { getRedis } = await import('./redis.js');
  await getRedis().set(EMERGENCY_KEY, active ? '1' : '0');
}
