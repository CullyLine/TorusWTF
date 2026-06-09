'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/useToast';

export function WelcomeToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || searchParams.get('welcome') !== '1') return;
    shown.current = true;
    toast({ message: 'Signed in — welcome to torus', variant: 'success' });
    const params = new URLSearchParams(searchParams.toString());
    params.delete('welcome');
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [searchParams, pathname, router, toast]);

  return null;
}
