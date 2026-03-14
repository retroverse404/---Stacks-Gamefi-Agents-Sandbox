import { getAuthUserId } from "@convex-dev/auth/server";

export async function getRequestUserId(ctx: any) {
  return await getAuthUserId(ctx);
}
