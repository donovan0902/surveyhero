import Link from 'next/link';
import type { ReactNode } from 'react';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { ArrowRight, BarChart3, CheckCircle2, Mic, Radio, Sparkles } from 'lucide-react';

import { AuthStatus } from '@/components/AuthStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function Home() {
  const { accessToken } = await withAuth();
  const isSignedIn = Boolean(accessToken);

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section className="relative min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_30%),radial-gradient(circle_at_82%_8%,oklch(0.872_0.007_219.6/_0.75),transparent_24%),linear-gradient(135deg,oklch(1_0_0),oklch(0.963_0.002_197.1))] dark:hidden" />
        <div className="absolute inset-0 hidden bg-[radial-gradient(circle_at_18%_18%,color-mix(in_oklch,var(--primary)_24%,transparent),transparent_30%),radial-gradient(circle_at_82%_8%,oklch(0.378_0.015_216/_0.45),transparent_26%),linear-gradient(135deg,oklch(0.148_0.004_228.8),oklch(0.218_0.008_223.9))] dark:block" />
        <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full border border-primary/10 bg-background/30 blur-3xl dark:bg-primary/10" />

        <header className="relative z-10 mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Mic className="size-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">SurveyHero</span>
          </Link>
          <nav className="flex items-center gap-2">
            <AuthStatus />
          </nav>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              Ask better questions without making people type.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Turn your surveys into conversations and get richer, more honest feedback.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-1.5">
                <Link href={isSignedIn ? '/dashboard' : '/sign-up'}>
                  {isSignedIn ? 'Go to dashboard' : 'Create your first survey'}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <LandingPreview />
        </div>
      </section>
    </main>
  );
}

function LandingPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-6 rounded-[2rem] bg-primary/10 blur-3xl" />
      <Card className="relative border-border bg-background/85 shadow-2xl backdrop-blur dark:bg-card/90">
        <CardHeader className="border-b px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Customer discovery</CardTitle>
            </div>
            <Badge className="bg-emerald-600 text-white">Published</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Voice session</span>
              <Radio className="size-4 text-primary" />
            </div>
            <p className="text-sm leading-6">
              “What problem were you trying to solve when you looked for this product?”
            </p>
            <div className="mt-4 grid grid-cols-12 items-end gap-1">
              {[28, 42, 58, 38, 70, 52, 84, 44, 64, 36, 76, 46].map((height, index) => (
                <div key={index} className="rounded-full bg-primary/70" style={{ height }} />
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Responses" value="128" icon={<BarChart3 className="size-4" />} />
            <MiniMetric label="Complete" value="84%" icon={<CheckCircle2 className="size-4" />} />
            <MiniMetric label="Themes" value="12" icon={<Sparkles className="size-4" />} />
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">Top theme</p>
            <p className="mt-1 text-sm">Teams want faster qualitative feedback without scheduling live interviews.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background p-3">
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
