import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Populated entirely by WorkOS webhooks via authKit.events().
  // authId = WorkOS user ID (event.data.id = identity.subject from JWT).
  users: defineTable({
    authId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    pictureUrl: v.optional(v.string()),
  }).index("by_authId", ["authId"]),

  // Questions live in a separate table to enable efficient per-question queries.
  surveys: defineTable({
    creatorId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("closed"),
    ),
    elevenLabsAgentId: v.optional(v.string()),
    elevenLabsAgentConfigHash: v.optional(v.string()),
    elevenLabsAgentSyncedAtMs: v.optional(v.number()),
  }).index("by_creatorId", ["creatorId"]),

  // Separate table so questionResponses can be indexed per-question.
  questions: defineTable({
    surveyId: v.id("surveys"),
    order: v.number(),
    prompt: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("open-ended"),
      v.literal("closed"),
      v.literal("rating"),
      v.literal("yes-no"),
    ),
    options: v.optional(v.array(v.string())),
    required: v.boolean(),
    followUpBehavior: v.union(
      v.literal("none"),
      v.literal("probe-once"),
      v.literal("probe-until-answered"),
    ),
  })
    .index("by_surveyId", ["surveyId"])
    .index("by_surveyId_and_order", ["surveyId", "order"]),

  // Authenticated respondents are limited to one session per survey. Anonymous
  // voice respondents omit respondentId and create a fresh response per start.
  surveyResponses: defineTable({
    surveyId: v.id("surveys"),
    respondentId: v.optional(v.id("users")),
    status: v.union(
      v.literal("in-progress"),
      v.literal("completed"),
      v.literal("abandoned"),
    ),
    startedAtMs: v.number(),
    completedAtMs: v.optional(v.number()),
    elevenLabsConversationId: v.optional(v.string()),
    analysisReceivedAtMs: v.optional(v.number()),
    // Tracks live progress as the agent records answers via record_answer tool
    // calls. Cleared once the post-call webhook flips status to "completed".
    currentQuestionId: v.optional(v.id("questions")),
  })
    .index("by_surveyId", ["surveyId"])
    .index("by_respondentId", ["respondentId"])
    .index("by_elevenLabsConversationId", ["elevenLabsConversationId"])
    .index("by_surveyId_and_respondentId", ["surveyId", "respondentId"]),

  // One record per response/question. respondentId is present for signed-in respondents.
  questionResponses: defineTable({
    surveyResponseId: v.id("surveyResponses"),
    questionId: v.id("questions"),
    surveyId: v.id("surveys"),
    respondentId: v.optional(v.id("users")),
    response: v.string(),
    dataCollectionId: v.string(),
  })
    .index("by_questionId", ["questionId"])
    .index("by_surveyResponseId", ["surveyResponseId"])
    .index("by_surveyResponseId_and_questionId", [
      "surveyResponseId",
      "questionId",
    ])
    .index("by_surveyId", ["surveyId"]),

  // One record per (questionResponse × extracted theme) — only populated for
  // open-ended questions via convex/aggregations.ts. themeKey is the canonical
  // grouping key (synonyms collapse to the same key after canonicalization);
  // themeLabel preserves the raw phrasing the LLM produced for this response.
  responseThemes: defineTable({
    questionResponseId: v.id("questionResponses"),
    questionId: v.id("questions"),
    surveyId: v.id("surveys"),
    themeKey: v.string(),
    themeLabel: v.string(),
    evidenceQuote: v.string(),
  })
    .index("by_questionId", ["questionId"])
    .index("by_questionResponseId", ["questionResponseId"])
    .index("by_questionId_and_themeKey", ["questionId", "themeKey"]),

  // One row per (question × themeKey). Maintained incrementally in
  // upsertResponseThemes and applyCanonicalization so counts are always current
  // without scanning responseThemes rows. Enables O(1) count reads and
  // cheap cross-question analytics via by_surveyId.
  themeCounters: defineTable({
    questionId: v.id("questions"),
    surveyId: v.id("surveys"),
    themeKey: v.string(),
    themeLabel: v.string(),
    count: v.number(),
  })
    .index("by_questionId", ["questionId"])
    .index("by_questionId_and_themeKey", ["questionId", "themeKey"])
    .index("by_surveyId", ["surveyId"]),

  // One row per question; holds the LLM-built narrative + theme distribution.
  // Refreshed via stale-while-revalidate from convex/aggregations.ts.
  questionAggregates: defineTable({
    questionId: v.id("questions"),
    surveyId: v.id("surveys"),
    rootSummary: v.optional(v.string()),
    themeDistribution: v.array(
      v.object({
        themeKey: v.string(),
        label: v.string(),
        count: v.number(),
        sampleQuotes: v.array(v.string()),
      }),
    ),
    lastBuiltAtMs: v.optional(v.number()),
    dirty: v.boolean(),
    responseCountAtBuild: v.number(),
    version: v.number(),
  }).index("by_questionId", ["questionId"]),
});
