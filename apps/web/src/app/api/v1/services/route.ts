import { NextResponse } from 'next/server';
import { SERVICES } from '@torus/shared';

/** GET /api/v1/services — public service catalog + pricing (for discovery). */
export function GET() {
  const services = Object.values(SERVICES).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    creditCost: s.creditCost,
    priceUsd: s.creditCost / 100,
    maxInputBytes: s.maxInputBytes,
    accept: s.acceptMime,
    outputs: s.outputs,
    endpoint: `/api/v1/${s.id}`,
  }));
  return NextResponse.json({ services });
}
