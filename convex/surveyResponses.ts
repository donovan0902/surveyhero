import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { transcriptEntryValidator } from "./schema";

async function requireUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

// Start or resume a response session. Enforces one per (respondent × survey).
export const getOrCreate = mutation({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args): Promise<Id<"surveyResponses">> => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("surveyResponses")
      .withIndex("by_surveyId_and_respondentId", (q) =>
        q.eq("surveyId", args.surveyId).eq("respondentId", user._id),
      )
      .unique();

    if (existing) return existing._id;

    return ctx.db.insert("surveyResponses", {
      surveyId: args.surveyId,
      respondentId: user._id,
      status: "in-progress",
      transcript: [],
      startedAtMs: Date.now(),
    });
  },
});

// Append transcript entries incrementally during the voice session.
export const appendTranscript = mutation({
  args: {
    responseId: v.id("surveyResponses"),
    entries: v.array(transcriptEntryValidator),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireUser(ctx);
    const response = await ctx.db.get(args.responseId);

    if (!response || response.respondentId !== user._id) {
      throw new Error("Response not found or access denied");
    }
    if (response.status === "completed") {
      throw new Error("Cannot append to a completed response");
    }

    await ctx.db.patch(args.responseId, {
      transcript: [...response.transcript, ...args.entries],
    });
  },
});

// Record the agent-extracted answer for a specific question.
export const recordAnswer = mutation({
  args: {
    responseId: v.id("surveyResponses"),
    questionId: v.id("questions"),
    response: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"questionResponses">> => {
    const user = await requireUser(ctx);
    const surveyResponse = await ctx.db.get(args.responseId);

    if (!surveyResponse || surveyResponse.respondentId !== user._id) {
      throw new Error("Response not found or access denied");
    }

    return ctx.db.insert("questionResponses", {
      surveyResponseId: args.responseId,
      questionId: args.questionId,
      surveyId: surveyResponse.surveyId,
      respondentId: user._id,
      response: args.response,
    });
  },
});

export const complete = mutation({
  args: { responseId: v.id("surveyResponses") },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireUser(ctx);
    const response = await ctx.db.get(args.responseId);

    if (!response || response.respondentId !== user._id) {
      throw new Error("Response not found or access denied");
    }
    await ctx.db.patch(args.responseId, {
      status: "completed",
      completedAtMs: Date.now(),
    });
  },
});

export const abandon = mutation({
  args: { responseId: v.id("surveyResponses") },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireUser(ctx);
    const response = await ctx.db.get(args.responseId);

    if (!response || response.respondentId !== user._id) {
      throw new Error("Response not found or access denied");
    }
    await ctx.db.patch(args.responseId, { status: "abandoned" });
  },
});

export const getMyResponse = query({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args): Promise<Doc<"surveyResponses"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return null;

    return ctx.db
      .query("surveyResponses")
      .withIndex("by_surveyId_and_respondentId", (q) =>
        q.eq("surveyId", args.surveyId).eq("respondentId", user._id),
      )
      .unique();
  },
});

// Creator-only: list all responses for a survey.
export const listForSurvey = query({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args): Promise<Doc<"surveyResponses">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return [];

    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      throw new Error("Access denied");
    }

    return ctx.db
      .query("surveyResponses")
      .withIndex("by_surveyId", (q) => q.eq("surveyId", args.surveyId))
      .order("desc")
      .take(100);
  },
});

// Creator-only: all answers for a specific question across all respondents.
export const getAnswersForQuestion = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args): Promise<Doc<"questionResponses">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return [];

    // Verify ownership via the question's parent survey
    const question = await ctx.db.get(args.questionId);
    if (!question) return [];

    const survey = await ctx.db.get(question.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      throw new Error("Access denied");
    }

    return ctx.db
      .query("questionResponses")
      .withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
      .collect();
  },
});
