import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const RESPONSE_COUNT_LIMIT = 1000;

type CreatedSurveyDashboardRow = {
  survey: Doc<"surveys">;
  questionCount: number;
  responseCount: number;
  responseCountIsCapped: boolean;
  completedCount: number;
  inProgressCount: number;
  abandonedCount: number;
  lastResponseAtMs: number | null;
};

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

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"surveys">> => {
    const user = await requireUser(ctx);
    return ctx.db.insert("surveys", {
      creatorId: user._id,
      title: args.title,
      description: args.description,
      status: "draft",
    });
  },
});

export const updateTitle = mutation({
  args: {
    surveyId: v.id("surveys"),
    title: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      throw new Error("Survey not found or access denied");
    }
    await ctx.db.patch(args.surveyId, { title: args.title });
  },
});

export const updateStatus = mutation({
  args: {
    surveyId: v.id("surveys"),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("closed"),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      throw new Error("Survey not found or access denied");
    }
    await ctx.db.patch(args.surveyId, { status: args.status });
  },
});

export const remove = mutation({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      throw new Error("Survey not found or access denied");
    }
    // Delete all child questions first
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_surveyId", (q) => q.eq("surveyId", args.surveyId))
      .collect();
    await Promise.all(questions.map((q) => ctx.db.delete(q._id)));
    await ctx.db.delete(args.surveyId);
  },
});

export const get = query({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args): Promise<Doc<"surveys"> | null> => {
    return ctx.db.get(args.surveyId);
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx): Promise<Doc<"surveys">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return [];

    return ctx.db
      .query("surveys")
      .withIndex("by_creatorId", (q) => q.eq("creatorId", user._id))
      .order("desc")
      .take(50);
  },
});

export const listDashboard = query({
  args: {},
  handler: async (ctx): Promise<CreatedSurveyDashboardRow[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return [];

    const surveys = await ctx.db
      .query("surveys")
      .withIndex("by_creatorId", (q) => q.eq("creatorId", user._id))
      .order("desc")
      .take(50);

    const rows: CreatedSurveyDashboardRow[] = [];
    for (const survey of surveys) {
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_surveyId", (q) => q.eq("surveyId", survey._id))
        .take(100);

      const responses = await ctx.db
        .query("surveyResponses")
        .withIndex("by_surveyId", (q) => q.eq("surveyId", survey._id))
        .order("desc")
        .take(RESPONSE_COUNT_LIMIT + 1);
      const countedResponses = responses.slice(0, RESPONSE_COUNT_LIMIT);

      rows.push({
        survey,
        questionCount: questions.length,
        responseCount: countedResponses.length,
        responseCountIsCapped: responses.length > RESPONSE_COUNT_LIMIT,
        completedCount: countedResponses.filter(
          (response) => response.status === "completed",
        ).length,
        inProgressCount: countedResponses.filter(
          (response) => response.status === "in-progress",
        ).length,
        abandonedCount: countedResponses.filter(
          (response) => response.status === "abandoned",
        ).length,
        lastResponseAtMs: countedResponses[0]?.startedAtMs ?? null,
      });
    }

    return rows;
  },
});
