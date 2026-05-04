'use client';

import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { useAuth } from '@workos-inc/authkit-nextjs/components';
import Link from 'next/link';
import { ModeToggle } from '@/components/mode-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export function AuthStatus() {
  const { user } = useAuth();
  const nameParts = [user?.firstName, user?.lastName].filter((name): name is string => Boolean(name));
  const displayName = nameParts.join(' ') || user?.email || 'User';
  const initials =
    nameParts
      .map((name) => name.charAt(0))
      .join('')
      .toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <>
      <ModeToggle />
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
        <Avatar aria-label={displayName} className="size-7">
          <AvatarImage src={user?.profilePictureUrl ?? undefined} alt={displayName} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <form action="/sign-out" method="post">
          <Button type="submit" variant="ghost" size="sm">Sign out</Button>
        </form>
      </Authenticated>
    </>
  );
}
