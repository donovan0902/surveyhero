import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;

// Internal: list questions with theme rows that have shifted in the last day.
// We canonicalize per-question rather than globally to keep the LLM input
// bounded and to avoid mixing labels across unrelated questions.
export const listQuestionsNeedingCanonicalization = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"questions">[]> => {
    const cutoff = Date.now() - DAY_MS;
    const recent = await ctx.db
      .query("responseThemes")
      .order("desc")
      .take(2000);
    const recentlyTouched = new Set<Id<"questions">>();
    for (const row of recent) {
      if (row._creationTime < cutoff) break;
      recentlyTouched.add(row.questionId);
    }
    return Array.from(recentlyTouched);
  },
});

// Action: fan out canonicalization runs for each touched question.
export const runDailyCanonicalization = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const questionIds: Id<"questions">[] = await ctx.runQuery(
      internal.crons.listQuestionsNeedingCanonicalization,
      {},
    );
    for (const questionId of questionIds) {
      await ctx.runAction(internal.aggregations.canonicalizeThemes, {
        questionId,
      });
    }
  },
});

const crons = cronJobs();

crons.interval(
  "daily theme canonicalization",
  { hours: 24 },
  internal.crons.runDailyCanonicalization,
  {},
);

export default crons;
