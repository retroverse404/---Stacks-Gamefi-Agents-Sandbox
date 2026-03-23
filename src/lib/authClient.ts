/**
 * Vanilla-JS auth manager for @convex-dev/auth.
 *
 * Handles:
 *  - GitHub OAuth sign-in (production)
 *  - Token storage in localStorage
 *  - Token refresh
 *  - OAuth callback detection
 */
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const JWT_KEY = "__convexAuthJWT";
const REFRESH_KEY = "__convexAuthRefreshToken";
const VERIFIER_KEY = "__convexAuthOAuthVerifier";
const githubAuthFlag = (import.meta as any).env.VITE_ENABLE_GITHUB_AUTH as string | undefined;
// Default OFF. Opt in by setting VITE_ENABLE_GITHUB_AUTH=true once the backend provider is configured.
const GITHUB_AUTH_ENABLED = githubAuthFlag === "true";

export class AuthManager {
  private client: ConvexClient;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private storageHandler: ((e: StorageEvent) => void) | null = null;
  private _onAuthChange: (() => void) | null = null;

  constructor(client: ConvexClient) {
    this.client = client;
    this.token = localStorage.getItem(JWT_KEY);
    this.refreshToken = localStorage.getItem(REFRESH_KEY);

    // Set up the auth token provider on the ConvexClient
    this.client.setAuth(
      async () => this.token ?? null,
      () => this._onAuthChange?.(),
    );

    // Start periodic token refresh (every 5 minutes)
    this.refreshTimer = setInterval(() => this.tryRefresh(), 5 * 60 * 1000);

    // Listen for auth changes from other tabs/popups (GitHub popup flow)
    this.storageHandler = (event: StorageEvent) => {
      if (event.key !== JWT_KEY && event.key !== REFRESH_KEY) return;
      this.reloadTokensFromStorage();
    };
    window.addEventListener("storage", this.storageHandler);
  }

  /** Whether the user has a stored auth token */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /** Register a callback for auth state changes */
  onAuthChange(callback: () => void) {
    this._onAuthChange = callback;
  }

  isGitHubAuthEnabled(): boolean {
    return GITHUB_AUTH_ENABLED;
  }

  /**
   * Validate that the currently stored token is accepted by Convex.
   * If invalid/expired, clear local tokens and return false.
   */
  async validateSession(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const url = (import.meta as any).env.VITE_CONVEX_URL as string;
      const httpClient = new ConvexHttpClient(url);
      httpClient.setAuth(this.token);
      const user = await httpClient.query(api.admin.currentUser, {});
      if (user) return true;
    } catch {
      // Fall through to clear local token state
    }
    this.clearTokens();
    return false;
  }

  /**
   * Check if the current URL contains an OAuth callback code.
   * If so, exchange it for tokens and return true.
   */
  async handleOAuthCallback(): Promise<boolean> {
    if (!GITHUB_AUTH_ENABLED) return false;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return false;

    const verifier = localStorage.getItem(VERIFIER_KEY);
    try {
      const result = await this.unauthenticatedSignIn({
        provider: "github",
        params: { code },
        verifier: verifier ?? undefined,
      });

      if (result?.tokens) {
        this.setTokens(result.tokens.token, result.tokens.refreshToken);
        // Clean up URL and verifier
        localStorage.removeItem(VERIFIER_KEY);
        window.history.replaceState({}, "", "/");
        return true;
      }
    } catch (err) {
      console.warn("OAuth callback failed:", err);
      localStorage.removeItem(VERIFIER_KEY);
    }
    return false;
  }

  /** Sign in or sign up with email + password */
  async signInPassword(
    email: string,
    password: string,
    flow: "signIn" | "signUp",
  ): Promise<void> {
    const result = await this.unauthenticatedSignIn({
      provider: "password",
      params: { email, password, flow },
    });
    if (result?.tokens) {
      this.setTokens(result.tokens.token, result.tokens.refreshToken);
    }
  }

  /** Start GitHub OAuth flow (redirects the browser) */
  async signInGitHub(): Promise<void> {
    if (!GITHUB_AUTH_ENABLED) {
      throw new Error("GitHub sign-in is disabled for this deployment");
    }

    const redirectTo =
      `${window.location.pathname}${window.location.search}${window.location.hash}` ||
      "/";

    const result = await this.unauthenticatedSignIn({
      provider: "github",
      params: { redirectTo },
    });
    if (result?.redirect) {
      // Store the PKCE verifier for the callback
      if (result.verifier) {
        localStorage.setItem(VERIFIER_KEY, result.verifier);
      }
      window.location.href = result.redirect;
    }
  }

  /** Start GitHub OAuth flow but return the redirect URL so callers can open a popup. */
  async getGitHubRedirect(): Promise<{ redirect: string; verifier?: string } | null> {
    if (!GITHUB_AUTH_ENABLED) return null;
    const redirectTo =
      `${window.location.pathname}${window.location.search}${window.location.hash}` ||
      "/";
    const result = await this.unauthenticatedSignIn({
      provider: "github",
      params: { redirectTo },
    });
    if (result?.verifier) {
      localStorage.setItem(VERIFIER_KEY, result.verifier);
    }
    return result?.redirect ? { redirect: result.redirect, verifier: result.verifier } : null;
  }

  /** Sign out and clear all stored tokens */
  async signOut(): Promise<void> {
    try {
      await this.client.action(api.auth.signOut, {});
    } catch {
      // Ignore errors — we're clearing local state anyway
    }
    this.clearTokens();
  }

  destroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.storageHandler) {
      window.removeEventListener("storage", this.storageHandler);
      this.storageHandler = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Call the signIn action without existing auth.
   * Uses ConvexHttpClient to avoid needing an authenticated session.
   */
  private async unauthenticatedSignIn(args: {
    provider?: string;
    params?: any;
    verifier?: string;
    refreshToken?: string;
  }): Promise<any> {
    const url = (import.meta as any).env.VITE_CONVEX_URL as string;
    const httpClient = new ConvexHttpClient(url);

    // If we have a current token, set it on the HTTP client too
    // (some providers may need the current session for account linking)
    if (this.token) {
      httpClient.setAuth(this.token);
    }

    return await httpClient.action(api.auth.signIn, args);
  }

  private setTokens(token: string, refreshToken: string) {
    this.token = token;
    this.refreshToken = refreshToken;
    localStorage.setItem(JWT_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);

    // Re-set auth provider so the client picks up the new token
    this.client.setAuth(
      async () => this.token ?? null,
      () => this._onAuthChange?.(),
    );
  }

  private clearTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(VERIFIER_KEY);

    this.client.setAuth(
      async () => null,
      (isAuthenticated) => this._onAuthChange?.(),
    );
  }

  private reloadTokensFromStorage() {
    const storedToken = localStorage.getItem(JWT_KEY);
    const storedRefresh = localStorage.getItem(REFRESH_KEY);
    if (storedToken && storedRefresh) {
      this.token = storedToken;
      this.refreshToken = storedRefresh;
      this.client.setAuth(
        async () => this.token ?? null,
        () => this._onAuthChange?.(),
      );
      this._onAuthChange?.();
    }
  }

  /** Try to refresh the token using the stored refresh token */
  private async tryRefresh() {
    if (!this.refreshToken) return;
    try {
      const result = await this.unauthenticatedSignIn({
        refreshToken: this.refreshToken,
      });
      if (result?.tokens) {
        this.setTokens(result.tokens.token, result.tokens.refreshToken);
      }
    } catch {
      // Refresh failed — token may be expired. User will need to re-auth.
      console.warn("Token refresh failed");
    }
  }
}
