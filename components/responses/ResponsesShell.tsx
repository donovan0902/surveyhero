'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock3, Inbox, LayoutList, Radio, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthStatus } from '@/components/AuthStatus';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { cn } from '@/lib/utils';

interface ResponsesShellProps {
  surveyId: string;
}

type Dashboard = NonNullable<FunctionReturnType<typeof api.surveyResponses.getSurveyResponseDashboard>>;
type ResponseRow = Dashboard['responses'][number];

const statusStyles: Record<Doc<'surveyResponses'>['status'], string> = {
  'completed': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'in-progress': 'border-amber-200 bg-amber-50 text-amber-700',
  'abandoned': 'border-border bg-muted text-muted-foreground',
};

export function ResponsesShell({ surveyId: rawId }: ResponsesShellProps) {
  const surveyId = rawId as Id<'surveys'>;
  const dashboard = useQuery(api.surveyResponses.getSurveyResponseDashboard, {
    surveyId,
  });
  const [selectedId, setSelectedId] = useState<Id<'surveyResponses'> | null>(null);
  const [activeTab, setActiveTab] = useState('insights');

  const selectedResponse = useMemo(() => {
    if (!dashboard || !selectedId) return null;
    return dashboard.responses.find((row) => row.response._id === selectedId) ?? null;
  }, [dashboard, selectedId]);
  const [detailRow, setDetailRow] = useState<ResponseRow | null>(null);

  if (dashboard === undefined) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <ResponsesTopBar title="Responses" surveyId={surveyId} />
        <main className="flex flex-1 bg-muted/30">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="border-border shadow-sm">
                  <CardContent className="flex items-center justify-between py-2">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-8 w-10" />
                    </div>
                    <Skeleton className="size-8 rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="border-border shadow-sm">
              <CardHeader className="border-b px-5 py-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-64" />
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (dashboard === null) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <ResponsesTopBar title="Responses" surveyId={surveyId} />
        <main className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/30 text-center">
          <p className="text-sm font-medium">Survey not found</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            It may have been deleted, or you may not have access to view its responses.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href="/">Back to home</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <ResponsesTopBar title={dashboard.survey.title} surveyId={surveyId} />
      <main className="flex flex-1 overflow-hidden bg-muted/30">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-5">
                <ResponsesOverview dashboard={dashboard} />
                <TabsContent value="insights" className="mt-0">
                  <QuestionInsightsSection dashboard={dashboard} />
                </TabsContent>
                <TabsContent value="inbox" className="mt-0">
                  <ResponsesTable
                    dashboard={dashboard}
                    selectedId={selectedResponse?.response._id ?? null}
                    onSelect={(id) => {
                      const row = dashboard.responses.find((responseRow) => responseRow.response._id === id) ?? null;
                      setDetailRow(row);
                      setSelectedId(id);
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </section>
        <ResponseDetail
          dashboard={dashboard}
          row={selectedResponse ?? detailRow}
          open={selectedResponse !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        />
      </main>
    </div>
  );
}

function ResponsesTopBar({ title, surveyId }: { title: string; surveyId: Id<'surveys'> }) {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href={`/surveys/${surveyId}/edit`}>
          <ArrowLeft className="size-3.5" />
          Builder
        </Link>
      </Button>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex min-w-0 items-center gap-2">
        <Radio className="size-4 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{title}</p>
          <p className="text-xs text-muted-foreground">Survey responses</p>
        </div>
      </div>
      <div className="flex-1" />
      <AuthStatus />
    </header>
  );
}

function ResponsesOverview({ dashboard }: { dashboard: Dashboard }) {
  return (
    <Card className="overflow-hidden border-border bg-background shadow-sm">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-end gap-3">
              <p className="font-heading text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
                {dashboard.latestResponseCount}
              </p>
              <div className="pb-1">
                <p className="text-sm font-medium">responses</p>
              </div>
            </div>
          </div>
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="insights" className="gap-2">
              <Sparkles className="size-3.5" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="inbox" className="gap-2">
              <LayoutList className="size-3.5" />
              Inbox
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="grid border-t bg-muted/20 sm:grid-cols-3">
          <MetricCard
            label="Avg response time"
            value={formatDuration(dashboard.averageResponseTimeMs)}
            icon={<Clock3 className="size-4" />}
          />
          <MetricCard label="Completed" value={dashboard.completedCount} icon={<CheckCircle2 className="size-4" />} />
          <MetricCard label="Abandoned" value={dashboard.abandonedCount} icon={<XCircle className="size-4" />} />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-border px-5 py-3 sm:border-r sm:last:border-r-0">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </div>
      <div className="rounded-full bg-background p-2 text-muted-foreground shadow-sm ring-1 ring-border">{icon}</div>
    </div>
  );
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return '—';

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function ResponsesTable({
  dashboard,
  selectedId,
  onSelect,
}: {
  dashboard: Dashboard;
  selectedId: Id<'surveyResponses'> | null;
  onSelect: (id: Id<'surveyResponses'>) => void;
}) {
  return (
    <section>
      {dashboard.responses.length === 0 ? (
        <EmptyResponses />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
              <TableRow>
                <TableHead className="px-5">Respondent</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Answers</TableHead>
                <TableHead className="px-4">Started</TableHead>
                <TableHead className="px-5">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.responses.map((row) => (
                <ResponseTableRow
                  key={row.response._id}
                  dashboard={dashboard}
                  row={row}
                  isSelected={row.response._id === selectedId}
                  onSelect={() => onSelect(row.response._id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function ResponseTableRow({
  dashboard,
  row,
  isSelected,
  onSelect,
}: {
  dashboard: Dashboard;
  row: ResponseRow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const answerCount = Object.keys(row.answersByQuestionId).length;
  const respondentLabel = row.respondent?.name ?? row.respondent?.email ?? 'Anonymous respondent';

  return (
    <TableRow className={cn('cursor-pointer', isSelected && 'bg-muted')} onClick={onSelect}>
      <TableCell className="px-5 py-3">
        <div className="flex flex-col">
          <span className="font-medium">{respondentLabel}</span>
          <span className="text-xs text-muted-foreground">
            {row.response.elevenLabsConversationId ? 'Voice conversation' : 'No conversation attached'}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <StatusBadge status={row.response.status} />
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {answerCount} / {dashboard.questions.length}
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(row.response.startedAtMs)}</TableCell>
      <TableCell className="px-5 py-3 text-muted-foreground">
        {row.response.completedAtMs ? formatDate(row.response.completedAtMs) : 'Not completed'}
      </TableCell>
    </TableRow>
  );
}

function ResponseDetail({
  dashboard,
  row,
  open,
  onOpenChange,
}: {
  dashboard: Dashboard;
  row: ResponseRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl xl:max-w-3xl">
        <SheetHeader className="border-b pr-14">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {row.respondent?.name ?? row.respondent?.email ?? 'Anonymous respondent'}
              </SheetTitle>
              <SheetDescription>Completed {formatDate(row.response.startedAtMs)}</SheetDescription>
            </div>
            <StatusBadge status={row.response.status} />
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-4">
            {dashboard.questions.map((question) => {
              const answer = row.answersByQuestionId[question._id];
              return (
                <Card key={question._id} size="sm" className="border-border">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-sm">{question.prompt || `Question ${question.order}`}</CardTitle>
                      <Badge variant="outline" className="font-mono text-xs">
                        Q{question.order}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {answer ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer.response}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No answer captured.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function EmptyResponses() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="rounded-full border-2 border-dashed border-border p-5">
        <Inbox className="size-8 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-medium">No responses yet</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Doc<'surveyResponses'>['status'] }) {
  return (
    <Badge variant="outline" className={cn('capitalize', statusStyles[status])}>
      {status.replace('-', ' ')}
    </Badge>
  );
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function QuestionInsightsSection({ dashboard }: { dashboard: Dashboard }) {
  if (dashboard.questions.length === 0) return null;
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Question insights</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {dashboard.questions.map((question) => (
          <QuestionInsight key={question._id} question={question} />
        ))}
      </CardContent>
    </Card>
  );
}

function QuestionInsight({ question }: { question: Doc<'questions'> }) {
  const aggregate = useQuery(api.aggregations.getQuestionAggregate, {
    questionId: question._id,
  });
  const stats = useQuery(api.aggregations.getDeterministicStats, {
    questionId: question._id,
  });
  const requestRefresh = useMutation(api.aggregations.requestRefresh);

  // SWR: on mount and when the question id changes, ask the server to rebuild
  // the narrative if it's dirty or has never been built. The server
  // short-circuits when nothing needs doing.
  useEffect(() => {
    if (question.type !== 'open-ended') return;
    requestRefresh({ questionId: question._id }).catch(() => {});
  }, [question._id, question.type, requestRefresh]);

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{question.prompt || `Question ${question.order}`}</p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          Q{question.order}
        </Badge>
      </div>
      {question.type === 'open-ended' ? (
        <OpenEndedInsight
          questionId={question._id}
          aggregate={aggregate}
          onRefresh={() => requestRefresh({ questionId: question._id })}
        />
      ) : (
        <DeterministicInsight stats={stats} />
      )}
    </div>
  );
}

type AggregateResult = FunctionReturnType<typeof api.aggregations.getQuestionAggregate>;

function OpenEndedInsight({
  aggregate,
  onRefresh,
}: {
  questionId: Id<'questions'>;
  aggregate: AggregateResult | undefined;
  onRefresh: () => Promise<unknown>;
}) {
  const [refreshRequestedVersion, setRefreshRequestedVersion] = useState<number | null>(null);
  const isDirty = aggregate?.aggregate?.dirty ?? false;
  const aggregateVersion = aggregate?.aggregate?.version ?? null;
  const refreshRequested = isDirty && refreshRequestedVersion === aggregateVersion;

  const handleRefresh = async () => {
    if (refreshRequested || aggregateVersion === null) return;
    setRefreshRequestedVersion(aggregateVersion);
    try {
      await onRefresh();
    } catch {
      setRefreshRequestedVersion(null);
    }
  };

  if (aggregate === undefined) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (!aggregate || !aggregate.aggregate) {
    return <p className="text-xs text-muted-foreground">No responses yet</p>;
  }
  const { rootSummary, themeDistribution, responseCountAtBuild } = aggregate.aggregate;

  if (themeDistribution.length === 0) {
    return <p className="text-xs text-muted-foreground">No responses yet</p>;
  }

  const top = themeDistribution.slice(0, 8);
  const sampleSize = responseCountAtBuild > 0 ? responseCountAtBuild : (top[0]?.count ?? 1);

  return (
    <div className="flex flex-col gap-3">
      {rootSummary ? <p className="text-sm leading-relaxed">{rootSummary}</p> : null}
      <div className="flex flex-col gap-1.5 pt-4">
        {top.map((theme) => (
          <ThemeBar
            key={theme.themeKey}
            label={theme.label}
            count={theme.count}
            total={sampleSize}
            widthPercent={(theme.count / sampleSize) * 100}
            sampleQuote={theme.sampleQuotes[0]}
          />
        ))}
      </div>
      <div className="flex justify-end">
        {isDirty ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={handleRefresh}
            disabled={refreshRequested}
          >
            <RefreshCw className={cn('size-3', refreshRequested && 'animate-spin')} />
            {refreshRequested ? 'Refreshing' : 'Refresh'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ThemeBar({
  label,
  count,
  total,
  widthPercent,
  sampleQuote,
}: {
  label: string;
  count: number;
  total: number;
  widthPercent: number;
  sampleQuote?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <div className="w-44 shrink-0 truncate text-sm" title={label}>
          {label}
        </div>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.min(widthPercent, 100)}%` }} />
        </div>
        <div className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {count} · {pct}%
        </div>
      </div>
      {sampleQuote ? <p className="ml-44 truncate pl-2 text-xs italic text-muted-foreground">“{sampleQuote}”</p> : null}
    </div>
  );
}

type StatsResult = FunctionReturnType<typeof api.aggregations.getDeterministicStats>;

function DeterministicInsight({ stats }: { stats: StatsResult | undefined }) {
  if (stats === undefined) return <Skeleton className="h-12 w-full" />;
  if (!stats || stats.kind === 'open-ended') return null;

  if (stats.kind === 'rating') {
    if (stats.count === 0) {
      return <p className="text-xs text-muted-foreground">No ratings yet.</p>;
    }
    const max = Math.max(...stats.distribution.map((d) => d.count), 1);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          Average: <span className="font-semibold">{stats.average !== null ? stats.average.toFixed(2) : '—'}</span>{' '}
          <span className="text-xs text-muted-foreground">
            ({stats.count} response{stats.count === 1 ? '' : 's'})
          </span>
        </p>
        <div className="flex flex-col gap-1">
          {stats.distribution.map((d) => (
            <ThemeBar
              key={d.value}
              label={String(d.value)}
              count={d.count}
              total={stats.count}
              widthPercent={(d.count / max) * 100}
            />
          ))}
        </div>
      </div>
    );
  }

  if (stats.kind === 'yes-no') {
    const total = stats.yes + stats.no;
    if (total === 0) {
      return <p className="text-xs text-muted-foreground">No answers yet.</p>;
    }
    const max = Math.max(stats.yes, stats.no, 1);
    return (
      <div className="flex flex-col gap-1">
        <ThemeBar label="Yes" count={stats.yes} total={total} widthPercent={(stats.yes / max) * 100} />
        <ThemeBar label="No" count={stats.no} total={total} widthPercent={(stats.no / max) * 100} />
      </div>
    );
  }

  // closed
  const total = stats.counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) {
    return <p className="text-xs text-muted-foreground">No answers yet.</p>;
  }
  const max = stats.counts[0]?.count ?? 1;
  return (
    <div className="flex flex-col gap-1">
      {stats.counts.map((c) => (
        <ThemeBar key={c.option} label={c.option} count={c.count} total={total} widthPercent={(c.count / max) * 100} />
      ))}
    </div>
  );
}
