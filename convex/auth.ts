import GitHub from "@auth/core/providers/github";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  convexAuth,
  createAccount,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { Scrypt } from "lucia";

function getRuntimeEnv() {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function isLocalDeployment() {
  const env = getRuntimeEnv();
  const deployment = env?.CONVEX_DEPLOYMENT ?? "";
  const siteUrl = env?.CONVEX_SITE_URL ?? "";
  return (
    deployment.startsWith("local:") ||
    siteUrl.includes("127.0.0.1") ||
    siteUrl.includes("localhost")
  );
}

function isGitHubAuthEnabled() {
  const env = getRuntimeEnv();
  return (
    env.AUTH_ENABLE_GITHUB_AUTH === "true" &&
    Boolean(env.AUTH_GITHUB_ID) &&
    Boolean(env.AUTH_GITHUB_SECRET)
  );
}

const PasswordWithLocalReset = ConvexCredentials({
  id: "password",
  authorize: async (params, ctx) => {
    const flow = params.flow as string | undefined;
    const email = String(params.email ?? "").trim().toLowerCase();
    const password = String(params.password ?? "");

    if (!email) throw new Error("Email is required");
    if (!password) throw new Error("Password is required");

    if (flow === "signUp") {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      try {
        const created = await createAccount(ctx, {
          provider: "password",
          account: { id: email, secret: password },
          profile: { email },
        });
        return { userId: created.user._id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isLocalDeployment() || !message.includes("already exists")) {
          throw error;
        }

        await modifyAccountCredentials(ctx, {
          provider: "password",
          account: { id: email, secret: password },
        });
        const retrieved = await retrieveAccount(ctx, {
          provider: "password",
          account: { id: email, secret: password },
        });
        return { userId: retrieved.user._id };
      }
    }

    if (flow === "signIn") {
      try {
        const retrieved = await retrieveAccount(ctx, {
          provider: "password",
          account: { id: email, secret: password },
        });
        return { userId: retrieved.user._id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isLocalDeployment() || !message.includes("InvalidAccountId")) {
          throw error;
        }

        // Local deployments are frequently reset during development. If the
        // account row was wiped with the local DB, recreate it seamlessly so
        // local sign-in does not fail with a raw server error.
        const created = await createAccount(ctx, {
          provider: "password",
          account: { id: email, secret: password },
          profile: { email },
        });
        return { userId: created.user._id };
      }
    }

    throw new Error(`Unsupported password flow "${flow ?? "unknown"}"`);
  },
  crypto: {
    async hashSecret(secret: string) {
      return await new Scrypt().hash(secret);
    },
    async verifySecret(secret: string, hash: string) {
      return await new Scrypt().verify(hash, secret);
    },
  },
});

const providers = isGitHubAuthEnabled()
  ? [GitHub, PasswordWithLocalReset]
  : [PasswordWithLocalReset];

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
});
