import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { setEmergencyStop } from '@/lib/admin';

const Body = z.object({ active: z.boolean() });

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }
  await setEmergencyStop(body.data.active);
  return NextResponse.json({ ok: true, active: body.data.active });
}
