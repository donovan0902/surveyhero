import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

async function getUserByAuthId(
  ctx: QueryCtx,
  authId: string,
): Promise<Doc<"users"> | null> {
  return ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authId))
    .unique();
}

export const current = query({
  args: {},
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return getUserByAuthId(ctx, identity.subject);
  },
});

export const getByAuthId = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return getUserByAuthId(ctx, args.authId);
  },
});
