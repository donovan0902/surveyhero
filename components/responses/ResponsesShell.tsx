"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Inbox,
  MessageSquareText,
  Radio,
  XCircle,
} from "lucide-react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuthStatus } from "@/components/AuthStatus";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface ResponsesShellProps {
  surveyId: string;
}

type Dashboard = NonNullable<
  FunctionReturnType<typeof api.surveyResponses.getSurveyResponseDashboard>
>;
type ResponseRow = Dashboard["responses"][number];

const statusStyles: Record<Doc<"surveyResponses">["status"], string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "in-progress": "border-amber-200 bg-amber-50 text-amber-700",
  abandoned: "border-border bg-muted text-muted-foreground",
};

export function ResponsesShell({ surveyId: rawId }: ResponsesShellProps) {
  const surveyId = rawId as Id<"surveys">;
  const dashboard = useQuery(api.surveyResponses.getSurveyResponseDashboard, {
    surveyId,
  });
  const [selectedId, setSelectedId] = useState<Id<"surveyResponses"> | null>(
    null,
  );

  const selectedResponse = useMemo(() => {
    if (!dashboard || dashboard.responses.length === 0) return null;
    return (
      dashboard.responses.find((row) => row.response._id === selectedId) ??
      dashboard.responses[0]
    );
  }, [dashboard, selectedId]);

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
            It may have been deleted, or you may not have access to view its
            responses.
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
          <ScrollArea className="flex-1">
            <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
              <DashboardSummary dashboard={dashboard} />
              <ResponsesTable
                dashboard={dashboard}
                selectedId={selectedResponse?.response._id ?? null}
                onSelect={setSelectedId}
              />
              <MobileResponseDetail
                dashboard={dashboard}
                row={selectedResponse}
              />
            </div>
          </ScrollArea>
        </section>
        <ResponseDetail dashboard={dashboard} row={selectedResponse} />
      </main>
    </div>
  );
}

function ResponsesTopBar({
  title,
  surveyId,
}: {
  title: string;
  surveyId: Id<"surveys">;
}) {
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
          <p className="truncate text-sm font-semibold tracking-tight">
            {title}
          </p>
          <p className="text-xs text-muted-foreground">Survey responses</p>
        </div>
      </div>
      <div className="flex-1" />
      <AuthStatus />
    </header>
  );
}

function DashboardSummary({ dashboard }: { dashboard: Dashboard }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Latest responses"
        value={dashboard.latestResponseCount}
        icon={<Inbox className="size-4" />}
      />
      <MetricCard
        label="Completed"
        value={dashboard.completedCount}
        icon={<CheckCircle2 className="size-4" />}
      />
      <MetricCard
        label="In progress"
        value={dashboard.inProgressCount}
        icon={<Clock3 className="size-4" />}
      />
      <MetricCard
        label="Abandoned"
        value={dashboard.abandonedCount}
        icon={<XCircle className="size-4" />}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="flex items-center justify-between py-2">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-full bg-muted p-2 text-muted-foreground">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function ResponsesTable({
  dashboard,
  selectedId,
  onSelect,
}: {
  dashboard: Dashboard;
  selectedId: Id<"surveyResponses"> | null;
  onSelect: (id: Id<"surveyResponses">) => void;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">
              Response inbox
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Showing the latest 100 responses for this survey.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {dashboard.questions.length} questions
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {dashboard.responses.length === 0 ? (
          <EmptyResponses />
        ) : (
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
        )}
      </CardContent>
    </Card>
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
  const respondentLabel =
    row.respondent?.name ?? row.respondent?.email ?? "Anonymous respondent";

  return (
    <TableRow
      className={cn(
        "cursor-pointer",
        isSelected && "bg-muted",
      )}
      onClick={onSelect}
    >
      <TableCell className="px-5 py-3">
        <div className="flex flex-col">
          <span className="font-medium">{respondentLabel}</span>
          <span className="text-xs text-muted-foreground">
            {row.response.elevenLabsConversationId
              ? "Voice conversation"
            : "No conversation attached"}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <StatusBadge status={row.response.status} />
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {answerCount} / {dashboard.questions.length}
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {formatDate(row.response.startedAtMs)}
      </TableCell>
      <TableCell className="px-5 py-3 text-muted-foreground">
        {row.response.completedAtMs
          ? formatDate(row.response.completedAtMs)
          : "Not completed"}
      </TableCell>
    </TableRow>
  );
}

function ResponseDetail({
  dashboard,
  row,
}: {
  dashboard: Dashboard;
  row: ResponseRow | null;
}) {
  return (
    <aside className="hidden w-[26rem] shrink-0 flex-col border-l border-border bg-background lg:flex">
      {!row ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="rounded-full border-2 border-dashed border-border p-5">
            <MessageSquareText className="size-8 text-muted-foreground/40" />
          </div>
          <div>
            <p className="text-sm font-medium">No response selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Responses will appear here once respondents complete the survey.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {row.respondent?.name ??
                    row.respondent?.email ??
                    "Anonymous respondent"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Started {formatDate(row.response.startedAtMs)}
                </p>
              </div>
              <StatusBadge status={row.response.status} />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 p-4">
              {dashboard.questions.map((question) => {
                const answer = row.answersByQuestionId[question._id];
                return (
                  <Card key={question._id} size="sm" className="border-border">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-sm">
                          {question.prompt || `Question ${question.order}`}
                        </CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">
                          Q{question.order}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {answer ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {answer.response}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No answer captured.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}

function MobileResponseDetail({
  dashboard,
  row,
}: {
  dashboard: Dashboard;
  row: ResponseRow | null;
}) {
  if (!row) return null;

  return (
    <Card className="border-border shadow-sm lg:hidden">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">
              Selected response
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.respondent?.name ??
                row.respondent?.email ??
                "Anonymous respondent"}
            </p>
          </div>
          <StatusBadge status={row.response.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-4">
        {dashboard.questions.map((question) => {
          const answer = row.answersByQuestionId[question._id];
          return (
            <div key={question._id} className="rounded-lg border p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  {question.prompt || `Question ${question.order}`}
                </p>
                <Badge variant="outline" className="font-mono text-xs">
                  Q{question.order}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {answer?.response ?? "No answer captured."}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
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
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Once respondents start this survey, their latest sessions and
          extracted answers will show up here.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Doc<"surveyResponses">["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", statusStyles[status])}
    >
      {status.replace("-", " ")}
    </Badge>
  );
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
