import { signOut } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';

export async function GET() {
  redirect('/');
}

export async function POST() {
  await signOut({ returnTo: '/' });
}
