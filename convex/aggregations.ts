import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import Anthropic from "@anthropic-ai/sdk";

const EXTRACTION_MODEL = "claude-haiku-4-5";
const NARRATIVE_MODEL = "claude-sonnet-4-6";
const CANONICALIZATION_MODEL = "claude-haiku-4-5";

const STALE_THRESHOLD_MS = 1000 * 60 * 10;
const MAX_THEMES_PER_RESPONSE = 5;
const MAX_QUOTES_PER_THEME_FOR_NARRATIVE = 3;
const MAX_THEMES_FOR_NARRATIVE = 12;

type ThemeDistributionEntry = {
  themeKey: string;
  label: string;
  count: number;
  sampleQuotes: string[];
};

function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey });
}

function slugifyThemeKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

async function requireSurveyOwner(
  ctx: QueryCtx | MutationCtx,
  surveyId: Id<"surveys">,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");

  const survey = await ctx.db.get(surveyId);
  if (!survey || survey.creatorId !== user._id) {
    throw new Error("Access denied");
  }
  return user;
}

async function getOrCreateAggregate(
  ctx: MutationCtx,
  questionId: Id<"questions">,
  surveyId: Id<"surveys">,
): Promise<Doc<"questionAggregates">> {
  const existing = await ctx.db
    .query("questionAggregates")
    .withIndex("by_questionId", (q) => q.eq("questionId", questionId))
    .unique();
  if (existing) return existing;

  const id = await ctx.db.insert("questionAggregates", {
    questionId,
    surveyId,
    themeDistribution: [],
    dirty: false,
    responseCountAtBuild: 0,
    version: 0,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create aggregate row");
  return created;
}

// Increment or decrement the counter row for (questionId, themeKey).
// Deletes the row when count reaches 0 so the table stays clean.
async function adjustThemeCounter(
  ctx: MutationCtx,
  questionId: Id<"questions">,
  surveyId: Id<"surveys">,
  themeKey: string,
  themeLabel: string,
  delta: number,
): Promise<void> {
  const existing = await ctx.db
    .query("themeCounters")
    .withIndex("by_questionId_and_themeKey", (q) =>
      q.eq("questionId", questionId).eq("themeKey", themeKey),
    )
    .unique();

  if (existing) {
    const newCount = existing.count + delta;
    if (newCount <= 0) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.patch(existing._id, { count: newCount, themeLabel });
    }
  } else if (delta > 0) {
    await ctx.db.insert("themeCounters", {
      questionId,
      surveyId,
      themeKey,
      themeLabel,
      count: delta,
    });
  }
}

// Internal: load a questionResponse + its question, validating it's open-ended.
export const getResponseForExtraction = internalQuery({
  args: { questionResponseId: v.id("questionResponses") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    questionResponse: Doc<"questionResponses">;
    question: Doc<"questions">;
  } | null> => {
    const questionResponse = await ctx.db.get(args.questionResponseId);
    if (!questionResponse) return null;
    const question = await ctx.db.get(questionResponse.questionId);
    if (!question || question.type !== "open-ended") return null;
    return { questionResponse, question };
  },
});

// Internal: replace the theme rows for a response and mark its question's
// aggregate as dirty so the next view triggers a narrative rebuild.
export const upsertResponseThemes = internalMutation({
  args: {
    questionResponseId: v.id("questionResponses"),
    themes: v.array(
      v.object({
        themeKey: v.string(),
        themeLabel: v.string(),
        evidenceQuote: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const questionResponse = await ctx.db.get(args.questionResponseId);
    if (!questionResponse) return;

    const existing = await ctx.db
      .query("responseThemes")
      .withIndex("by_questionResponseId", (q) =>
        q.eq("questionResponseId", args.questionResponseId),
      )
      .collect();

    for (const row of existing) {
      await adjustThemeCounter(
        ctx,
        row.questionId,
        row.surveyId,
        row.themeKey,
        row.themeLabel,
        -1,
      );
      await ctx.db.delete(row._id);
    }

    for (const theme of args.themes) {
      await ctx.db.insert("responseThemes", {
        questionResponseId: args.questionResponseId,
        questionId: questionResponse.questionId,
        surveyId: questionResponse.surveyId,
        themeKey: theme.themeKey,
        themeLabel: theme.themeLabel,
        evidenceQuote: theme.evidenceQuote,
      });
      await adjustThemeCounter(
        ctx,
        questionResponse.questionId,
        questionResponse.surveyId,
        theme.themeKey,
        theme.themeLabel,
        +1,
      );
    }

    const aggregate = await getOrCreateAggregate(
      ctx,
      questionResponse.questionId,
      questionResponse.surveyId,
    );
    await ctx.db.patch(aggregate._id, { dirty: true });
  },
});

// Public mutation: called by the webhook after each upserted answer (and by
// recordAnswer for typed text responses) to trigger theme extraction.
// Internal-action scheduling lives in a mutation so it stays transactional.
export const scheduleExtraction = internalMutation({
  args: { questionResponseId: v.id("questionResponses") },
  handler: async (ctx, args): Promise<void> => {
    const questionResponse = await ctx.db.get(args.questionResponseId);
    if (!questionResponse) return;
    const question = await ctx.db.get(questionResponse.questionId);
    if (!question || question.type !== "open-ended") return;

    await ctx.scheduler.runAfter(
      0,
      internal.aggregations.extractThemesForResponse,
      { questionResponseId: args.questionResponseId },
    );
  },
});

// Internal action: call Anthropic with structured output to extract themes.
export const extractThemesForResponse = internalAction({
  args: { questionResponseId: v.id("questionResponses") },
  handler: async (ctx, args): Promise<void> => {
    const ctxData: {
      questionResponse: Doc<"questionResponses">;
      question: Doc<"questions">;
    } | null = await ctx.runQuery(
      internal.aggregations.getResponseForExtraction,
      { questionResponseId: args.questionResponseId },
    );
    if (!ctxData) return;
    const { questionResponse, question } = ctxData;

    const responseText = questionResponse.response.trim();
    if (responseText.length === 0) {
      await ctx.runMutation(internal.aggregations.upsertResponseThemes, {
        questionResponseId: args.questionResponseId,
        themes: [],
      });
      return;
    }

    const client = getAnthropic();
    const message = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      tool_choice: { type: "tool", name: "record_themes" },
      tools: [
        {
          name: "record_themes",
          description:
            "Record the discrete themes present in the respondent's answer.",
          input_schema: {
            type: "object",
            properties: {
              themes: {
                type: "array",
                description: `Up to ${MAX_THEMES_PER_RESPONSE} short noun-phrase themes (2–6 words each) naming distinct topics, opinions, or issues raised in the answer. Empty array if the answer is non-substantive.`,
                items: {
                  type: "object",
                  properties: {
                    label: {
                      type: "string",
                      description:
                        "Short noun phrase (2–6 words) naming the theme. Title case is fine. Avoid full sentences.",
                    },
                    evidenceQuote: {
                      type: "string",
                      description:
                        "Short verbatim snippet from the respondent's answer that supports this theme. ≤120 chars.",
                    },
                  },
                  required: ["label", "evidenceQuote"],
                },
                maxItems: MAX_THEMES_PER_RESPONSE,
              },
            },
            required: ["themes"],
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Survey question: ${question.prompt}`,
                question.description ? `Context: ${question.description}` : null,
                "",
                `Respondent's answer:`,
                responseText,
                "",
                "Extract the distinct themes in the answer. Each theme must be a short noun phrase that another respondent could plausibly also produce (avoid hyper-specific paraphrases). Skip filler.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find(
      (block) => block.type === "tool_use" && block.name === "record_themes",
    );
    if (!toolUse || toolUse.type !== "tool_use") return;
    const input = toolUse.input as {
      themes?: { label?: unknown; evidenceQuote?: unknown }[];
    };
    const themes = (input.themes ?? [])
      .map((t) => ({
        label: typeof t.label === "string" ? t.label.trim() : "",
        evidenceQuote:
          typeof t.evidenceQuote === "string" ? t.evidenceQuote.trim() : "",
      }))
      .filter((t) => t.label.length > 0)
      .slice(0, MAX_THEMES_PER_RESPONSE)
      .map((t) => ({
        themeKey: slugifyThemeKey(t.label),
        themeLabel: t.label,
        evidenceQuote: t.evidenceQuote.slice(0, 240),
      }))
      .filter((t) => t.themeKey.length > 0);

    await ctx.runMutation(internal.aggregations.upsertResponseThemes, {
      questionResponseId: args.questionResponseId,
      themes,
    });
  },
});

// Internal: gather data needed to rebuild the narrative root summary.
// Counts come from themeCounters (one row per unique theme — no scale ceiling).
// Quotes are fetched with targeted by_questionId_and_themeKey lookups for the
// top N themes only, so we read at most MAX_THEMES_FOR_NARRATIVE × MAX_QUOTES
// rows from responseThemes regardless of total response count.
export const getRebuildContext = internalQuery({
  args: { questionId: v.id("questions") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    question: Doc<"questions">;
    counters: Doc<"themeCounters">[];
    quotesPerThemeKey: Record<string, string[]>;
    responseCount: number;
  } | null> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return null;

    const counters = await ctx.db
      .query("themeCounters")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .collect();

    const topCounters = [...counters]
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_THEMES_FOR_NARRATIVE);

    const quotesPerThemeKey: Record<string, string[]> = {};
    for (const counter of topCounters) {
      const rows = await ctx.db
        .query("responseThemes")
        .withIndex("by_questionId_and_themeKey", (q) =>
          q.eq("questionId", args.questionId).eq("themeKey", counter.themeKey),
        )
        .take(MAX_QUOTES_PER_THEME_FOR_NARRATIVE);
      quotesPerThemeKey[counter.themeKey] = rows
        .map((r) => r.evidenceQuote)
        .filter(Boolean);
    }

    const responseCount = await ctx.db
      .query("questionResponses")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .take(2000)
      .then((rows) => rows.length);

    return { question, counters, quotesPerThemeKey, responseCount };
  },
});

// Internal: write the rebuilt narrative + distribution back, clear dirty.
export const writeRootSummary = internalMutation({
  args: {
    questionId: v.id("questions"),
    rootSummary: v.string(),
    themeDistribution: v.array(
      v.object({
        themeKey: v.string(),
        label: v.string(),
        count: v.number(),
        sampleQuotes: v.array(v.string()),
      }),
    ),
    responseCountAtBuild: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return;
    const aggregate = await getOrCreateAggregate(
      ctx,
      args.questionId,
      question.surveyId,
    );
    await ctx.db.patch(aggregate._id, {
      rootSummary: args.rootSummary,
      themeDistribution: args.themeDistribution,
      lastBuiltAtMs: Date.now(),
      dirty: false,
      responseCountAtBuild: args.responseCountAtBuild,
      version: aggregate.version + 1,
    });
  },
});

function buildThemeDistribution(
  counters: Doc<"themeCounters">[],
  quotesPerThemeKey: Record<string, string[]>,
): ThemeDistributionEntry[] {
  return [...counters]
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      themeKey: c.themeKey,
      label: c.themeLabel,
      count: c.count,
      sampleQuotes: quotesPerThemeKey[c.themeKey] ?? [],
    }));
}

// Internal action: rebuild the narrative root summary from theme distribution
// + sampled quotes. Never reads its own prior output, so it cannot drift.
export const rebuildRootSummary = internalAction({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args): Promise<void> => {
    const data: {
      question: Doc<"questions">;
      counters: Doc<"themeCounters">[];
      quotesPerThemeKey: Record<string, string[]>;
      responseCount: number;
    } | null = await ctx.runQuery(internal.aggregations.getRebuildContext, {
      questionId: args.questionId,
    });
    if (!data) return;

    const distribution = buildThemeDistribution(data.counters, data.quotesPerThemeKey);
    const distributionForPrompt = distribution.slice(0, MAX_THEMES_FOR_NARRATIVE);

    let summary = "";
    if (data.responseCount === 0 || distribution.length === 0) {
      summary = "";
    } else {
      const client = getAnthropic();
      const lines = distributionForPrompt
        .map(
          (entry) =>
            `- ${entry.label} (${entry.count} mention${entry.count === 1 ? "" : "s"})${
              entry.sampleQuotes.length
                ? `: e.g. "${entry.sampleQuotes[0]}"`
                : ""
            }`,
        )
        .join("\n");

      const message = await client.messages.create({
        model: NARRATIVE_MODEL,
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `Question: ${data.question.prompt}`,
                  `Total responses: ${data.responseCount}`,
                  `Top themes (with counts and sample evidence quotes):`,
                  lines,
                  "",
                  "Write a 2–3 sentence summary describing what respondents are saying. Be specific. Reference the most common themes proportionally — do not over-weight rare ones. Do not invent details. Plain prose only, no bullet lists or headings.",
                ].join("\n"),
              },
            ],
          },
        ],
      });

      const textBlock = message.content.find((block) => block.type === "text");
      summary = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    }

    await ctx.runMutation(internal.aggregations.writeRootSummary, {
      questionId: args.questionId,
      rootSummary: summary,
      themeDistribution: distribution,
      responseCountAtBuild: data.responseCount,
    });
  },
});

// Internal: load all distinct theme labels for canonicalization.
export const getCanonicalizationContext = internalQuery({
  args: { questionId: v.id("questions") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    question: Doc<"questions">;
    themes: Doc<"responseThemes">[];
  } | null> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return null;
    const themes = await ctx.db
      .query("responseThemes")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .take(5000);
    return { question, themes };
  },
});

// Internal: bulk-update themeKey on responseThemes per a label→key mapping.
export const applyCanonicalization = internalMutation({
  args: {
    questionId: v.id("questions"),
    mappings: v.array(
      v.object({
        fromLabel: v.string(),
        toThemeKey: v.string(),
        toLabel: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return;

    const byLabel = new Map(
      args.mappings.map((m) => [m.fromLabel, { themeKey: m.toThemeKey, label: m.toLabel }]),
    );
    const rows = await ctx.db
      .query("responseThemes")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .take(5000);
    for (const row of rows) {
      const target = byLabel.get(row.themeLabel);
      if (!target) continue;
      if (row.themeKey === target.themeKey && row.themeLabel === target.label) {
        continue;
      }
      await adjustThemeCounter(
        ctx,
        args.questionId,
        question.surveyId,
        row.themeKey,
        row.themeLabel,
        -1,
      );
      await adjustThemeCounter(
        ctx,
        args.questionId,
        question.surveyId,
        target.themeKey,
        target.label,
        +1,
      );
      await ctx.db.patch(row._id, {
        themeKey: target.themeKey,
        themeLabel: target.label,
      });
    }

    const aggregate = await ctx.db
      .query("questionAggregates")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .unique();
    if (aggregate) await ctx.db.patch(aggregate._id, { dirty: true });
  },
});

// Internal action: cluster synonym labels into canonical groups via LLM.
export const canonicalizeThemes = internalAction({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args): Promise<void> => {
    const data: {
      question: Doc<"questions">;
      themes: Doc<"responseThemes">[];
    } | null = await ctx.runQuery(
      internal.aggregations.getCanonicalizationContext,
      { questionId: args.questionId },
    );
    if (!data || data.themes.length === 0) return;

    const distinctLabels = Array.from(
      new Set(data.themes.map((t) => t.themeLabel)),
    );
    if (distinctLabels.length < 2) return;

    const client = getAnthropic();
    const message = await client.messages.create({
      model: CANONICALIZATION_MODEL,
      max_tokens: 4096,
      tool_choice: { type: "tool", name: "record_clusters" },
      tools: [
        {
          name: "record_clusters",
          description:
            "Group synonymous theme labels into clusters and pick a canonical label for each cluster.",
          input_schema: {
            type: "object",
            properties: {
              clusters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    canonicalLabel: {
                      type: "string",
                      description: "The clearest label for the group.",
                    },
                    members: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Every original label that belongs to this cluster, including the canonical one.",
                    },
                  },
                  required: ["canonicalLabel", "members"],
                },
              },
            },
            required: ["clusters"],
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Survey question: ${data.question.prompt}`,
                "",
                "Cluster the following theme labels into groups of synonyms (same underlying meaning). Singletons (unique themes) should still appear as a one-member cluster. Choose a clear canonical label per cluster. Every input label MUST appear in exactly one cluster's members list.",
                "",
                "Labels:",
                distinctLabels.map((l) => `- ${l}`).join("\n"),
              ].join("\n"),
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find(
      (b) => b.type === "tool_use" && b.name === "record_clusters",
    );
    if (!toolUse || toolUse.type !== "tool_use") return;
    const input = toolUse.input as {
      clusters?: { canonicalLabel?: unknown; members?: unknown }[];
    };

    const mappings: { fromLabel: string; toThemeKey: string; toLabel: string }[] = [];
    for (const cluster of input.clusters ?? []) {
      const canonical =
        typeof cluster.canonicalLabel === "string"
          ? cluster.canonicalLabel.trim()
          : "";
      const members = Array.isArray(cluster.members) ? cluster.members : [];
      if (!canonical || members.length === 0) continue;
      const themeKey = slugifyThemeKey(canonical);
      if (!themeKey) continue;
      for (const member of members) {
        if (typeof member !== "string") continue;
        mappings.push({
          fromLabel: member.trim(),
          toThemeKey: themeKey,
          toLabel: canonical,
        });
      }
    }

    if (mappings.length === 0) return;
    await ctx.runMutation(internal.aggregations.applyCanonicalization, {
      questionId: args.questionId,
      mappings,
    });
  },
});

// Public query: read the current aggregate. Creator-only.
export const getQuestionAggregate = query({
  args: { questionId: v.id("questions") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    aggregate: Doc<"questionAggregates"> | null;
    questionType: Doc<"questions">["type"];
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return null;

    const question = await ctx.db.get(args.questionId);
    if (!question) return null;
    const survey = await ctx.db.get(question.surveyId);
    if (!survey || survey.creatorId !== user._id) return null;

    const aggregate = await ctx.db
      .query("questionAggregates")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .unique();

    return { aggregate, questionType: question.type };
  },
});

// Public mutation: stale-while-revalidate trigger. Schedules a rebuild if the
// aggregate is dirty or older than the staleness threshold. Idempotent enough
// for casual UI calls (multiple rapid calls just queue extra rebuilds, which
// are cheap; the narrative regenerates from current data each time).
export const requestRefresh = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args): Promise<{ scheduled: boolean }> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return { scheduled: false };
    await requireSurveyOwner(ctx, question.surveyId);

    const aggregate = await getOrCreateAggregate(
      ctx,
      args.questionId,
      question.surveyId,
    );

    const isStale =
      aggregate.dirty ||
      aggregate.lastBuiltAtMs === undefined ||
      Date.now() - aggregate.lastBuiltAtMs > STALE_THRESHOLD_MS;
    if (!isStale) return { scheduled: false };

    await ctx.scheduler.runAfter(
      0,
      internal.aggregations.rebuildRootSummary,
      { questionId: args.questionId },
    );
    return { scheduled: true };
  },
});

// Public query: live theme counts for a question, read directly from
// themeCounters — O(unique themes) not O(all response rows). Creator-only.
export const getThemeCounters = query({
  args: { questionId: v.id("questions") },
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"themeCounters">[] | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return null;

    const question = await ctx.db.get(args.questionId);
    if (!question) return null;
    const survey = await ctx.db.get(question.surveyId);
    if (!survey || survey.creatorId !== user._id) return null;

    return ctx.db
      .query("themeCounters")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .collect();
  },
});

// Public query: all theme counts across every question in a survey.
// Uses by_surveyId so this is one index scan, not one per question. Creator-only.
export const getSurveyThemeCounters = query({
  args: { surveyId: v.id("surveys") },
  handler: async (
    ctx,
    args,
  ): Promise<Doc<"themeCounters">[] | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return null;

    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) return null;

    return ctx.db
      .query("themeCounters")
      .withIndex("by_surveyId", (q) => q.eq("surveyId", args.surveyId))
      .collect();
  },
});

// Public query: per-question deterministic stats for non-text question types.
// Renders alongside the AI aggregate for open-ended questions.
export const getDeterministicStats = query({
  args: { questionId: v.id("questions") },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { kind: "rating"; count: number; average: number | null; distribution: { value: number; count: number }[] }
    | { kind: "yes-no"; yes: number; no: number }
    | { kind: "closed"; counts: { option: string; count: number }[] }
    | { kind: "open-ended" }
    | null
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return null;

    const question = await ctx.db.get(args.questionId);
    if (!question) return null;
    const survey = await ctx.db.get(question.surveyId);
    if (!survey || survey.creatorId !== user._id) return null;

    if (question.type === "open-ended") return { kind: "open-ended" };

    const responses = await ctx.db
      .query("questionResponses")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .take(2000);

    if (question.type === "rating") {
      const counts = new Map<number, number>();
      let sum = 0;
      let n = 0;
      for (const r of responses) {
        const parsed = Number.parseInt(r.response, 10);
        if (!Number.isFinite(parsed)) continue;
        counts.set(parsed, (counts.get(parsed) ?? 0) + 1);
        sum += parsed;
        n += 1;
      }
      const distribution = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value - b.value);
      return {
        kind: "rating",
        count: n,
        average: n > 0 ? sum / n : null,
        distribution,
      };
    }

    if (question.type === "yes-no") {
      let yes = 0;
      let no = 0;
      for (const r of responses) {
        const v = r.response.toLowerCase();
        if (v === "true" || v === "yes") yes += 1;
        else if (v === "false" || v === "no") no += 1;
      }
      return { kind: "yes-no", yes, no };
    }

    const counts = new Map<string, number>();
    for (const r of responses) {
      counts.set(r.response, (counts.get(r.response) ?? 0) + 1);
    }
    return {
      kind: "closed",
      counts: Array.from(counts.entries())
        .map(([option, count]) => ({ option, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});
