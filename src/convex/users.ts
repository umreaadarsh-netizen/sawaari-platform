import { getAuthUserId } from "@convex-dev/auth/server";
import { query, QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { Role } from "./schema";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx | MutationCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/**
 * Require a signed-in session and return the users-row doc, throwing
 * "Please sign in." when the caller is unauthenticated.
 *
 * This is the hard authorization gate for protected mutations/queries: it
 * validates BOTH the Convex Auth session (`getAuthUserId`) and the identity
 * claims (`ctx.auth.getUserIdentity`) so a stale or partial session can never
 * slip through. Prefer this over `getCurrentUser` on anything that writes.
 */
export const requireUser = async (ctx: QueryCtx | MutationCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Please sign in.");
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Please sign in.");
  return user;
};

/**
 * Role-based access control: require a signed-in user carrying `role`.
 * `message` overrides the default denial message (e.g. the admin surfaces
 * use "Administrator access required.").
 */
export const requireRole = async (
  ctx: QueryCtx | MutationCtx,
  role: Role,
  message = "You don't have permission to do that.",
) => {
  const user = await requireUser(ctx);
  if (user.role !== role) throw new Error(message);
  return user;
};

/**
 * Same hard auth gate as `requireUser`, but for Node-runtime `action`
 * handlers (Stripe actions). `getAuthUserId` and `getUserIdentity` accept
 * action contexts, so sessions validate identically here.
 */
export const requireUserAction = async (ctx: ActionCtx): Promise<Doc<"users">> => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Please sign in.");
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in.");
  const user = await ctx.runQuery(api.users.currentUser, {});
  if (!user) throw new Error("Please sign in.");
  return user;
};

/**
 * Role gate for actions: requires a signed-in user carrying `role`, throwing
 * the provided denial message otherwise. Used by Stripe Connect actions that
 * only drivers may call.
 */
export const requireRoleAction = async (
  ctx: ActionCtx,
  role: Role,
  message = "You don't have permission to do that.",
): Promise<Doc<"users">> => {
  const user = await requireUserAction(ctx);
  if (user.role !== role) throw new Error(message);
  return user;
};
