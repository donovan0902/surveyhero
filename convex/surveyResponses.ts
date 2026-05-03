import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function maybeScheduleThemeExtraction(
  ctx: MutationCtx,
  questionId: Id<"questions">,
  questionResponseId: Id<"questionResponses">,
): Promise<void> {
  const question = await ctx.db.get(questionId);
  if (!question || question.type !== "open-ended") return;
  await ctx.scheduler.runAfter(
    0,
    internal.aggregations.extractThemesForResponse,
    { questionResponseId },
  );
}

type ResponseDashboardRow = {
  response: Doc<"surveyResponses">;
  respondent: Pick<Doc<"users">, "_id" | "name" | "email" | "pictureUrl"> | null;
  answersByQuestionId: Record<Id<"questions">, Doc<"questionResponses">>;
};

type ResponseDashboard = {
  survey: Doc<"surveys">;
  questions: Doc<"questions">[];
  responses: ResponseDashboardRow[];
  latestResponseCount: number;
  completedCount: number;
  inProgressCount: number;
  abandonedCount: number;
  averageResponseTimeMs: number | null;
};

type MyResponseDashboardRow = {
  response: Doc<"surveyResponses">;
  survey: Pick<
    Doc<"surveys">,
    "_id" | "_creationTime" | "title" | "description" | "status"
  >;
  creator: Pick<Doc<"users">, "_id" | "name" | "email" | "pictureUrl"> | null;
  questionCount: number;
  answerCount: number;
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

async function getOptionalUser(
  ctx: MutationCtx | QueryCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

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
      startedAtMs: Date.now(),
    });
  },
});

// Record the agent-extracted answer for a specific question.
export const recordAnswer = mutation({
  args: {
    responseId: v.id("surveyResponses"),
    questionId: v.id("questions"),
    response: v.string(),
    dataCollectionId: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"questionResponses">> => {
    const user = await requireUser(ctx);
    const surveyResponse = await ctx.db.get(args.responseId);

    if (!surveyResponse || surveyResponse.respondentId !== user._id) {
      throw new Error("Response not found or access denied");
    }

    const questionResponseId = await ctx.db.insert("questionResponses", {
      surveyResponseId: args.responseId,
      questionId: args.questionId,
      surveyId: surveyResponse.surveyId,
      respondentId: user._id,
      response: args.response,
      dataCollectionId: args.dataCollectionId,
    });
    await maybeScheduleThemeExtraction(ctx, args.questionId, questionResponseId);
    return questionResponseId;
  },
});

export const attachConversation = mutation({
  args: {
    responseId: v.id("surveyResponses"),
    conversationId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await getOptionalUser(ctx);
    const response = await ctx.db.get(args.responseId);

    if (!response) {
      throw new Error("Response not found or access denied");
    }
    if (response.respondentId) {
      if (!user || response.respondentId !== user._id) {
        throw new Error("Response not found or access denied");
      }
    } else if (
      response.elevenLabsConversationId &&
      response.elevenLabsConversationId !== args.conversationId
    ) {
      throw new Error("Response already has a different conversation attached");
    }

    if (response.elevenLabsConversationId === args.conversationId) return;

    await ctx.db.patch(args.responseId, {
      elevenLabsConversationId: args.conversationId,
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

export const listMineWithSurveys = query({
  args: {},
  handler: async (ctx): Promise<MyResponseDashboardRow[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return [];

    const responses = await ctx.db
      .query("surveyResponses")
      .withIndex("by_respondentId", (q) => q.eq("respondentId", user._id))
      .order("desc")
      .take(100);

    const rows: MyResponseDashboardRow[] = [];
    for (const response of responses) {
      const survey = await ctx.db.get(response.surveyId);
      if (!survey) continue;

      const creatorDoc = await ctx.db.get(survey.creatorId);
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_surveyId", (q) => q.eq("surveyId", survey._id))
        .take(100);
      const answers = await ctx.db
        .query("questionResponses")
        .withIndex("by_surveyResponseId", (q) =>
          q.eq("surveyResponseId", response._id),
        )
        .take(100);

      rows.push({
        response,
        survey: {
          _id: survey._id,
          _creationTime: survey._creationTime,
          title: survey.title,
          description: survey.description,
          status: survey.status,
        },
        creator: creatorDoc
          ? {
              _id: creatorDoc._id,
              name: creatorDoc.name,
              email: creatorDoc.email,
              pictureUrl: creatorDoc.pictureUrl,
            }
          : null,
        questionCount: questions.length,
        answerCount: answers.length,
      });
    }

    return rows;
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

export const getSurveyResponseDashboard = query({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args): Promise<ResponseDashboard | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (!user) return null;

    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      return null;
    }

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_surveyId_and_order", (q) =>
        q.eq("surveyId", args.surveyId),
      )
      .order("asc")
      .take(100);

    const responses = await ctx.db
      .query("surveyResponses")
      .withIndex("by_surveyId", (q) => q.eq("surveyId", args.surveyId))
      .order("desc")
      .take(100);

    const rows: ResponseDashboardRow[] = [];
    for (const response of responses) {
      const answerDocs = await ctx.db
        .query("questionResponses")
        .withIndex("by_surveyResponseId", (q) =>
          q.eq("surveyResponseId", response._id),
        )
        .take(100);

      const respondentDoc = response.respondentId
        ? await ctx.db.get(response.respondentId)
        : null;

      const answersByQuestionId: Record<
        Id<"questions">,
        Doc<"questionResponses">
      > = {};
      for (const answer of answerDocs) {
        answersByQuestionId[answer.questionId] = answer;
      }

      rows.push({
        response,
        respondent: respondentDoc
          ? {
              _id: respondentDoc._id,
              name: respondentDoc.name,
              email: respondentDoc.email,
              pictureUrl: respondentDoc.pictureUrl,
            }
          : null,
        answersByQuestionId,
      });
    }

    const completedDurationsMs = rows
      .map((row) => {
        const { completedAtMs, startedAtMs } = row.response;
        if (completedAtMs === undefined) return null;
        const durationMs = completedAtMs - startedAtMs;
        return Number.isFinite(durationMs) && durationMs >= 0
          ? durationMs
          : null;
      })
      .filter((durationMs): durationMs is number => durationMs !== null);

    const averageResponseTimeMs =
      completedDurationsMs.length > 0
        ? Math.round(
            completedDurationsMs.reduce((total, durationMs) => total + durationMs, 0) /
              completedDurationsMs.length,
          )
        : null;

    return {
      survey,
      questions,
      responses: rows,
      latestResponseCount: rows.length,
      completedCount: rows.filter((row) => row.response.status === "completed")
        .length,
      inProgressCount: rows.filter(
        (row) => row.response.status === "in-progress",
      ).length,
      abandonedCount: rows.filter((row) => row.response.status === "abandoned")
        .length,
      averageResponseTimeMs,
    };
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

// Live progress for the RespondHeader. Driven by surveyResponses.currentQuestionId
// (set initially to the first question and advanced by the record_answer tool),
// not by transcript turn counting. Anyone with the responseId can read it —
// this is the same trust boundary as joining the voice session.
export const getRespondProgress = query({
  args: { responseId: v.id("surveyResponses") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    currentQuestionOrder: number;
    totalQuestions: number;
    status: Doc<"surveyResponses">["status"];
  } | null> => {
    const response = await ctx.db.get(args.responseId);
    if (!response) return null;

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_surveyId_and_order", (q) =>
        q.eq("surveyId", response.surveyId),
      )
      .order("asc")
      .collect();

    const totalQuestions = questions.length;
    const currentQuestion = response.currentQuestionId
      ? questions.find((q) => q._id === response.currentQuestionId)
      : null;

    return {
      currentQuestionOrder: currentQuestion?.order ?? 1,
      totalQuestions: Math.max(1, totalQuestions),
      status: response.status,
    };
  },
});

export const upsertExtractedAnswer = internalMutation({
  args: {
    responseId: v.id("surveyResponses"),
    questionId: v.id("questions"),
    dataCollectionId: v.string(),
    response: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"questionResponses">> => {
    const surveyResponse = await ctx.db.get(args.responseId);
    if (!surveyResponse) throw new Error("Response not found");

    const existing = await ctx.db
      .query("questionResponses")
      .withIndex("by_surveyResponseId_and_questionId", (q) =>
        q
          .eq("surveyResponseId", args.responseId)
          .eq("questionId", args.questionId),
      )
      .unique();

    const fields = {
      surveyResponseId: args.responseId,
      questionId: args.questionId,
      surveyId: surveyResponse.surveyId,
      ...(surveyResponse.respondentId
        ? { respondentId: surveyResponse.respondentId }
        : {}),
      response: args.response,
      dataCollectionId: args.dataCollectionId,
    };

    let questionResponseId: Id<"questionResponses">;
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      questionResponseId = existing._id;
    } else {
      questionResponseId = await ctx.db.insert("questionResponses", fields);
    }
    await maybeScheduleThemeExtraction(
      ctx,
      args.questionId,
      questionResponseId,
    );
    return questionResponseId;
  },
});
