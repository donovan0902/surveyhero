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

  // One session per (respondent x survey). Transcript text remains in ElevenLabs.
  surveyResponses: defineTable({
    surveyId: v.id("surveys"),
    respondentId: v.id("users"),
    status: v.union(
      v.literal("in-progress"),
      v.literal("completed"),
      v.literal("abandoned"),
    ),
    startedAtMs: v.number(),
    completedAtMs: v.optional(v.number()),
    elevenLabsConversationId: v.optional(v.string()),
    analysisReceivedAtMs: v.optional(v.number()),
  })
    .index("by_surveyId", ["surveyId"])
    .index("by_respondentId", ["respondentId"])
    .index("by_elevenLabsConversationId", ["elevenLabsConversationId"])
    .index("by_surveyId_and_respondentId", ["surveyId", "respondentId"]),

  // One record per (respondent × question). Enables "all answers to question X".
  questionResponses: defineTable({
    surveyResponseId: v.id("surveyResponses"),
    questionId: v.id("questions"),
    surveyId: v.id("surveys"),
    respondentId: v.id("users"),
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
});
