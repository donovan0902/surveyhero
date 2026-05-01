"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  BarChart3,
  CheckCircle2,
  FilePlus2,
  Inbox,
  LayoutDashboard,
  Link2,
  Mic,
  PenLine,
  Send,
  Sparkles,
} from "lucide-react";

import { AuthStatus } from "@/components/AuthStatus";
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
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type CreatedSurveyRow = FunctionReturnType<
  typeof api.surveys.listDashboard
>[number];
type RespondedSurveyRow = FunctionReturnType<
  typeof api.surveyResponses.listMineWithSurveys
>[number];

const surveyStatusStyles: Record<Doc<"surveys">["status"], string> = {
  draft: "border-border bg-muted text-muted-foreground",
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-300 bg-slate-100 text-slate-700",
};

const responseStatusStyles: Record<Doc<"surveyResponses">["status"], string> =
  {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "in-progress": "border-amber-200 bg-amber-50 text-amber-700",
    abandoned: "border-border bg-muted text-muted-foreground",
  };

export function DashboardShell() {
  const router = useRouter();
  const createSurvey = useMutation(api.surveys.create);
  const createdSurveys = useQuery(api.surveys.listDashboard, {});
  const respondedSurveys = useQuery(api.surveyResponses.listMineWithSurveys, {});

  const [creating, setCreating] = useState(false);
  const [copiedSurveyId, setCopiedSurveyId] = useState<Id<"surveys"> | null>(
    null,
  );

  const stats = useMemo(() => {
    const created = createdSurveys ?? [];
    const responded = respondedSurveys ?? [];
    return {
      createdCount: created.length,
      publishedCount: created.filter((row) => row.survey.status === "published")
        .length,
      responseCount: created.reduce(
        (sum, row) => sum + row.responseCount,
        0,
      ),
      completedResponses: responded.filter(
        (row) => row.response.status === "completed",
      ).length,
    };
  }, [createdSurveys, respondedSurveys]);

  async function handleCreateSurvey() {
    if (creating) return;
    setCreating(true);
    try {
      const surveyId = await createSurvey({ title: "Untitled survey" });
      router.push(`/surveys/${surveyId}/edit`);
    } finally {
      setCreating(false);
    }
  }

  async function copyRespondLink(surveyId: Id<"surveys">) {
    const url = `${window.location.origin}/surveys/${surveyId}/respond`;
    await navigator.clipboard.writeText(url);
    setCopiedSurveyId(surveyId);
    window.setTimeout(() => setCopiedSurveyId(null), 1600);
  }

  const isLoading =
    createdSurveys === undefined || respondedSurveys === undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <DashboardTopBar onCreateSurvey={handleCreateSurvey} creating={creating} />
      <main className="flex flex-1 overflow-hidden bg-muted/30">
        <ScrollArea className="flex-1">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
            <DashboardHero onCreateSurvey={handleCreateSurvey} creating={creating} />
            {isLoading ? (
              <DashboardLoading />
            ) : (
              <>
                <SummaryGrid stats={stats} />
                <CreatedSurveysSection
                  rows={createdSurveys}
                  copiedSurveyId={copiedSurveyId}
                  onCreateSurvey={handleCreateSurvey}
                  onCopyRespondLink={copyRespondLink}
                  creating={creating}
                />
                <RespondedSurveysSection rows={respondedSurveys} />
              </>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function DashboardTopBar({
  onCreateSurvey,
  creating,
}: {
  onCreateSurvey: () => void;
  creating: boolean;
}) {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 text-muted-foreground">
        <Mic className="size-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          SurveyHero
        </span>
      </Link>
      <Separator orientation="vertical" className="mx-1" />
      <div className="flex min-w-0 items-center gap-2">
        <LayoutDashboard className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Dashboard</span>
      </div>
      <div className="flex-1" />
      <Button
        size="sm"
        onClick={onCreateSurvey}
        disabled={creating}
        className="gap-1.5"
      >
        <FilePlus2 className="size-3.5" />
        {creating ? "Creating..." : "New survey"}
      </Button>
      <Separator orientation="vertical" className="mx-1 hidden sm:block" />
      <AuthStatus />
    </header>
  );
}

function DashboardHero({
  onCreateSurvey,
  creating,
}: {
  onCreateSurvey: () => void;
  creating: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-background p-6 shadow-sm sm:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_32%),linear-gradient(135deg,transparent,oklch(0.963_0.002_197.1/_0.7))]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Badge variant="outline" className="mb-4 gap-1.5 bg-background/80">
            <Sparkles className="size-3" />
            Voice surveys, ready to share
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Manage the surveys you create and the ones you answer.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Build voice-led questionnaires, publish respondent links, and review
            answer summaries from one place.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onCreateSurvey} disabled={creating} className="gap-1.5">
            <FilePlus2 className="size-4" />
            {creating ? "Creating..." : "Create survey"}
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="#responded">
              <Inbox className="size-4" />
              My responses
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SummaryGrid({
  stats,
}: {
  stats: {
    createdCount: number;
    publishedCount: number;
    responseCount: number;
    completedResponses: number;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Created surveys"
        value={stats.createdCount}
        icon={<PenLine className="size-4" />}
      />
      <MetricCard
        label="Published"
        value={stats.publishedCount}
        icon={<Send className="size-4" />}
      />
      <MetricCard
        label="Responses received"
        value={stats.responseCount}
        icon={<BarChart3 className="size-4" />}
      />
      <MetricCard
        label="Surveys completed"
        value={stats.completedResponses}
        icon={<CheckCircle2 className="size-4" />}
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

function CreatedSurveysSection({
  rows,
  copiedSurveyId,
  onCreateSurvey,
  onCopyRespondLink,
  creating,
}: {
  rows: CreatedSurveyRow[];
  copiedSurveyId: Id<"surveys"> | null;
  onCreateSurvey: () => void;
  onCopyRespondLink: (surveyId: Id<"surveys">) => void;
  creating: boolean;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">
              Created surveys
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Draft, publish, share, and review the surveys you own.
            </p>
          </div>
          <Button
            size="sm"
            onClick={onCreateSurvey}
            disabled={creating}
            className="gap-1.5"
          >
            <FilePlus2 className="size-3.5" />
            New survey
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={<PenLine className="size-8" />}
            title="No surveys yet"
            description="Create your first survey, add questions, then publish a voice response link."
            action={
              <Button onClick={onCreateSurvey} disabled={creating}>
                Create survey
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
                <TableRow>
                  <TableHead className="px-5">Survey</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                  <TableHead className="px-4">Questions</TableHead>
                  <TableHead className="px-4">Responses</TableHead>
                  <TableHead className="px-4">Last response</TableHead>
                  <TableHead className="px-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <CreatedSurveyTableRow
                    key={row.survey._id}
                    row={row}
                    copied={copiedSurveyId === row.survey._id}
                    onCopyRespondLink={() => onCopyRespondLink(row.survey._id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreatedSurveyTableRow({
  row,
  copied,
  onCopyRespondLink,
}: {
  row: CreatedSurveyRow;
  copied: boolean;
  onCopyRespondLink: () => void;
}) {
  const canShare = row.survey.status === "published";

  return (
    <TableRow>
      <TableCell className="min-w-64 px-5 py-3">
        <div className="flex flex-col">
          <Link
            href={`/surveys/${row.survey._id}/edit`}
            className="font-medium hover:underline"
          >
            {row.survey.title || "Untitled survey"}
          </Link>
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {row.survey.description || `Created ${formatDate(row.survey._creationTime)}`}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <SurveyStatusBadge status={row.survey.status} />
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {row.questionCount}
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {formatCount(row.responseCount, row.responseCountIsCapped)}
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {row.lastResponseAtMs ? formatDate(row.lastResponseAtMs) : "None"}
      </TableCell>
      <TableCell className="px-5 py-3">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/surveys/${row.survey._id}/edit`}>Edit</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/surveys/${row.survey._id}/responses`}>Responses</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canShare}
            onClick={onCopyRespondLink}
            title={canShare ? "Copy response link" : "Publish before sharing"}
            className="gap-1.5"
          >
            <Link2 className="size-3.5" />
            {copied ? "Copied" : "Share"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RespondedSurveysSection({ rows }: { rows: RespondedSurveyRow[] }) {
  return (
    <Card id="responded" className="border-border shadow-sm">
      <CardHeader className="border-b px-5 py-4">
        <div>
          <CardTitle className="text-sm font-semibold">
            Surveys you responded to
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Signed-in response sessions are saved here so you can track what is
            in progress or completed.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-8" />}
            title="No responses yet"
            description="When you answer a survey while signed in, it will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
                <TableRow>
                  <TableHead className="px-5">Survey</TableHead>
                  <TableHead className="px-4">Owner</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                  <TableHead className="px-4">Answers</TableHead>
                  <TableHead className="px-4">Started</TableHead>
                  <TableHead className="px-5 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <RespondedSurveyTableRow key={row.response._id} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RespondedSurveyTableRow({ row }: { row: RespondedSurveyRow }) {
  const canResume =
    row.survey.status === "published" && row.response.status !== "completed";

  return (
    <TableRow>
      <TableCell className="min-w-64 px-5 py-3">
        <div className="flex flex-col">
          <span className="font-medium">{row.survey.title}</span>
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {row.survey.description || "Voice survey"}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {row.creator?.name ?? row.creator?.email ?? "Unknown owner"}
      </TableCell>
      <TableCell className="px-4 py-3">
        <ResponseStatusBadge status={row.response.status} />
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {row.answerCount} / {row.questionCount}
      </TableCell>
      <TableCell className="px-4 py-3 text-muted-foreground">
        {formatDate(row.response.startedAtMs)}
      </TableCell>
      <TableCell className="px-5 py-3 text-right">
        <Button asChild={canResume} variant="outline" size="sm" disabled={!canResume}>
          {canResume ? (
            <Link href={`/surveys/${row.survey._id}/respond`}>
              {row.response.status === "abandoned" ? "Restart" : "Resume"}
            </Link>
          ) : (
            <span>{row.response.status === "completed" ? "Completed" : "Unavailable"}</span>
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full border-2 border-dashed border-border p-5 text-muted-foreground/50">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

function DashboardLoading() {
  return (
    <>
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
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-2 h-3 w-72" />
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function SurveyStatusBadge({ status }: { status: Doc<"surveys">["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", surveyStatusStyles[status])}
    >
      {status}
    </Badge>
  );
}

function ResponseStatusBadge({
  status,
}: {
  status: Doc<"surveyResponses">["status"];
}) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", responseStatusStyles[status])}
    >
      {status.replace("-", " ")}
    </Badge>
  );
}

function formatCount(count: number, capped: boolean) {
  return `${count}${capped ? "+" : ""}`;
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
