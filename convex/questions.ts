import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const questionTypeValidator = v.union(
  v.literal("open-ended"),
  v.literal("closed"),
  v.literal("rating"),
  v.literal("yes-no"),
);

const followUpBehaviorValidator = v.union(
  v.literal("none"),
  v.literal("probe-once"),
  v.literal("probe-until-answered"),
);

async function requireSurveyOwner(
  ctx: MutationCtx | QueryCtx,
  surveyId: Id<"surveys">,
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");

  const survey = await ctx.db.get(surveyId);
  if (!survey || survey.creatorId !== user._id) {
    throw new Error("Survey not found or access denied");
  }
}

export const create = mutation({
  args: {
    surveyId: v.id("surveys"),
    prompt: v.string(),
    type: questionTypeValidator,
    description: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    required: v.optional(v.boolean()),
    followUpBehavior: v.optional(followUpBehaviorValidator),
  },
  handler: async (ctx, args): Promise<Id<"questions">> => {
    await requireSurveyOwner(ctx, args.surveyId);

    // Compute order: one past the current highest
    const existing = await ctx.db
      .query("questions")
      .withIndex("by_surveyId", (q) => q.eq("surveyId", args.surveyId))
      .collect();
    const maxOrder = existing.reduce((m, q) => Math.max(m, q.order), 0);

    return ctx.db.insert("questions", {
      surveyId: args.surveyId,
      order: maxOrder + 1,
      prompt: args.prompt,
      type: args.type,
      description: args.description,
      options: args.options,
      required: args.required ?? false,
      followUpBehavior: args.followUpBehavior ?? "none",
    });
  },
});

export const update = mutation({
  args: {
    questionId: v.id("questions"),
    prompt: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(questionTypeValidator),
    options: v.optional(v.array(v.string())),
    required: v.optional(v.boolean()),
    followUpBehavior: v.optional(followUpBehaviorValidator),
  },
  handler: async (ctx, args): Promise<void> => {
    const { questionId, ...fields } = args;
    const question = await ctx.db.get(questionId);
    if (!question) throw new Error("Question not found");

    await requireSurveyOwner(ctx, question.surveyId);

    const patch: Partial<Doc<"questions">> = {};
    if (fields.prompt !== undefined) patch.prompt = fields.prompt;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.type !== undefined) patch.type = fields.type;
    if (fields.options !== undefined) patch.options = fields.options;
    if (fields.required !== undefined) patch.required = fields.required;
    if (fields.followUpBehavior !== undefined)
      patch.followUpBehavior = fields.followUpBehavior;

    await ctx.db.patch(questionId, patch);
  },
});

export const remove = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args): Promise<void> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");
    await requireSurveyOwner(ctx, question.surveyId);
    await ctx.db.delete(args.questionId);
  },
});

// Accepts an ordered array of question IDs and re-assigns order values 1..N.
export const reorder = mutation({
  args: {
    surveyId: v.id("surveys"),
    orderedIds: v.array(v.id("questions")),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireSurveyOwner(ctx, args.surveyId);
    await Promise.all(
      args.orderedIds.map((id, index) =>
        ctx.db.patch(id, { order: index + 1 }),
      ),
    );
  },
});

export const listForSurvey = query({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args): Promise<Doc<"questions">[]> => {
    return ctx.db
      .query("questions")
      .withIndex("by_surveyId_and_order", (q) =>
        q.eq("surveyId", args.surveyId),
      )
      .order("asc")
      .collect();
  },
});
