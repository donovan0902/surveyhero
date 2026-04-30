'use client';

import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function AuthStatus() {
  const { user } = useAuth();
  return (
    <>
      <AuthLoading>
        <div className="h-7 w-24 animate-pulse rounded bg-muted" />
      </AuthLoading>
      <Unauthenticated>
        <Link href="/sign-in">
          <Button variant="ghost" size="sm">Sign in</Button>
        </Link>
        <Link href="/sign-up">
          <Button size="sm">Sign up</Button>
        </Link>
      </Unauthenticated>
      <Authenticated>
        <span className="text-sm text-muted-foreground">
          {user?.firstName ?? user?.email}
        </span>
        <Link href="/sign-out">
          <Button variant="ghost" size="sm">Sign out</Button>
        </Link>
      </Authenticated>
    </>
  );
}
