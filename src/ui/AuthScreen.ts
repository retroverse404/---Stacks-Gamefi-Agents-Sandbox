/**
 * AuthScreen — displayed before the profile picker.
 * Handles sign-in via:
 *   - Email + password (sign in / sign up)
 *   - GitHub OAuth (production)
 */
import { getAuthManager } from "../lib/convexClient.ts";
import {
  connectStacksWallet,
  disconnectStacksWallet,
  formatStacksAddress,
  formatStacksProvider,
  getCachedStacksAddress,
  getCachedStacksProviderId,
  type StacksWalletProviderId,
} from "../lib/stacksWallet.ts";
import { isLocalConvexUrl } from "../lib/runtimeEnv.ts";
import "./AuthScreen.css";

// GitHub SVG icon (simple mark)
const GITHUB_ICON = `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;
const AUTO_RESUME_SESSION_FLAG = "VITE_AUTO_RESUME_SESSION";
const DEFAULT_AUTH_BACKGROUND_YOUTUBE_URL = "https://www.youtube.com/watch?v=QSNwU1lDhqI";

function getYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "") || null;
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

function createBackgroundMedia() {
  const type = ((import.meta.env.VITE_AUTH_BACKGROUND_MEDIA_TYPE as string | undefined) || "youtube")
    .toLowerCase();
  const videoUrl = import.meta.env.VITE_AUTH_BACKGROUND_VIDEO_URL as string | undefined;
  const youtubeUrl =
    (import.meta.env.VITE_AUTH_BACKGROUND_YOUTUBE_URL as string | undefined) ||
    DEFAULT_AUTH_BACKGROUND_YOUTUBE_URL;

  const shell = document.createElement("div");
  shell.className = "auth-background-shell";

  if (type === "video" && videoUrl) {
    const video = document.createElement("video");
    video.className = "auth-background-video";
    video.src = videoUrl;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    shell.appendChild(video);
    return shell;
  }

  const videoId = getYouTubeVideoId(youtubeUrl);
  if (!videoId) {
    return shell;
  }

  const iframe = document.createElement("iframe");
  iframe.className = "auth-background-iframe";
  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1`;
  iframe.title = "Auth screen background video";
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.tabIndex = -1;
  shell.appendChild(iframe);

  return shell;
}

export class AuthScreen {
  readonly el: HTMLElement;
  private statusEl: HTMLElement;
  private walletWrapEl: HTMLElement | null = null;
  private walletHeadingEl: HTMLElement | null = null;
  private walletHintEl: HTMLElement | null = null;
  private walletAddressEl: HTMLElement | null = null;
  private walletActionsEl: HTMLElement | null = null;
  private onAuthenticated: () => void;
  private onGuestJoin: (() => void) | null;
  private destroyed = false;
  private lastPasswordFlow: "signIn" | "signUp" = "signIn";
  private walletMode: "default" | "switching" = "default";

  constructor(onAuthenticated: () => void, onGuestJoin?: () => void) {
    this.onAuthenticated = onAuthenticated;
    this.onGuestJoin = onGuestJoin ?? null;

    this.el = document.createElement("div");
    this.el.className = "auth-screen";
    this.el.appendChild(createBackgroundMedia());

    const overlay = document.createElement("div");
    overlay.className = "auth-overlay";
    this.el.appendChild(overlay);

    const content = document.createElement("div");
    content.className = "auth-content";
    this.el.appendChild(content);

    const title = document.createElement("h1");
    title.textContent = "Stackshub";
    content.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "auth-subtitle";
    sub.textContent = "The Stacks ecosystem, made playable.";
    content.appendChild(sub);

    const support = document.createElement("div");
    support.className = "auth-support-line";
    support.textContent = "An agentic sandbox for simulated worlds, wallets and transactions.";
    content.appendChild(support);

    const card = document.createElement("div");
    card.className = "auth-card";

    const accountHeading = document.createElement("div");
    accountHeading.className = "auth-section-heading";
    accountHeading.textContent = "App account";
    card.appendChild(accountHeading);

    const accountHint = document.createElement("div");
    accountHint.className = "auth-section-hint";
    accountHint.textContent = "Sign in to enter the world. Wallet connection is separate and only used for paid actions.";
    card.appendChild(accountHint);

    // -----------------------------------------------------------------------
    // Email + password form
    // -----------------------------------------------------------------------
    const form = document.createElement("div");
    form.className = "auth-password-form";

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "Email";
    emailInput.className = "auth-input";
    emailInput.autocomplete = "email";
    form.appendChild(emailInput);

    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.placeholder = "Password (min 8 chars)";
    passwordInput.className = "auth-input";
    passwordInput.autocomplete = "current-password";
    form.appendChild(passwordInput);

    const pwBtnRow = document.createElement("div");
    pwBtnRow.className = "auth-btn-row";

    const signInBtn = document.createElement("button");
    signInBtn.className = "auth-btn primary";
    signInBtn.textContent = "Sign In";
    signInBtn.addEventListener("click", () => {
      this.lastPasswordFlow = "signIn";
      this.handlePassword(emailInput, passwordInput, "signIn", signInBtn, signUpBtn);
    });

    const signUpBtn = document.createElement("button");
    signUpBtn.className = "auth-btn secondary";
    signUpBtn.textContent = "Sign Up";
    signUpBtn.addEventListener("click", () => {
      this.lastPasswordFlow = "signUp";
      this.handlePassword(emailInput, passwordInput, "signUp", signUpBtn, signInBtn);
    });

    pwBtnRow.append(signInBtn, signUpBtn);
    form.appendChild(pwBtnRow);
    card.appendChild(form);

    const walletDivider = document.createElement("div");
    walletDivider.className = "auth-divider";
    walletDivider.textContent = "payer wallet";
    card.appendChild(walletDivider);

    const walletWrap = document.createElement("div");
    walletWrap.className = "auth-wallet";
    this.walletWrapEl = walletWrap;

    const walletHeading = document.createElement("div");
    walletHeading.className = "auth-wallet-heading";
    this.walletHeadingEl = walletHeading;
    walletWrap.appendChild(walletHeading);

    const walletHint = document.createElement("div");
    walletHint.className = "auth-wallet-hint";
    this.walletHintEl = walletHint;
    walletWrap.appendChild(walletHint);

    const walletAddress = document.createElement("div");
    walletAddress.className = "auth-wallet-address";
    this.walletAddressEl = walletAddress;
    walletWrap.appendChild(walletAddress);

    const walletBtnRow = document.createElement("div");
    walletBtnRow.className = "auth-wallet-actions";
    this.walletActionsEl = walletBtnRow;
    walletWrap.appendChild(walletBtnRow);

    card.appendChild(walletWrap);
    this.renderWalletSection();

    // Submit on Enter key
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (this.lastPasswordFlow === "signUp") {
          signUpBtn.click();
        } else {
          signInBtn.click();
        }
      }
    };
    emailInput.addEventListener("keydown", handleEnter);
    passwordInput.addEventListener("keydown", handleEnter);

    // -----------------------------------------------------------------------
    // GitHub OAuth
    // -----------------------------------------------------------------------
    const divider1 = document.createElement("div");
    divider1.className = "auth-divider";
    divider1.textContent = "or";
    card.appendChild(divider1);

    if (!isLocalConvexUrl(import.meta.env.VITE_CONVEX_URL as string | undefined)) {
      const ghBtn = document.createElement("button");
      ghBtn.className = "auth-btn github";
      ghBtn.innerHTML = `<span class="icon">${GITHUB_ICON}</span> Sign in with GitHub`;
      ghBtn.addEventListener("click", () => this.handleGitHub(ghBtn));
      card.appendChild(ghBtn);
    }

    // -----------------------------------------------------------------------
    // Status message
    // -----------------------------------------------------------------------
    this.statusEl = document.createElement("div");
    this.statusEl.className = "auth-status";
    card.appendChild(this.statusEl);

    content.appendChild(card);

    // -----------------------------------------------------------------------
    // Guest access — below the card
    // -----------------------------------------------------------------------
    if (this.onGuestJoin) {
      const guestWrap = document.createElement("div");
      guestWrap.className = "auth-guest-wrap";
      const guestBtn = document.createElement("button");
      guestBtn.className = "auth-guest-btn";
      guestBtn.textContent = "or explore as a guest";
      guestBtn.addEventListener("click", () => {
        if (this.destroyed) return;
        this.onGuestJoin?.();
      });
      guestWrap.appendChild(guestBtn);
      content.appendChild(guestWrap);
    }

    // Check for OAuth callback first, then existing session
    this.init();
  }

  private async init() {
    const auth = getAuthManager();

    // 1. Check for OAuth callback in URL
    try {
      this.showStatus("Checking session...");
      const wasCallback = await auth.handleOAuthCallback();
      if (wasCallback) {
        this.showStatus("Signed in!");
        this.done();
        return;
      }
    } catch {
      // Not an OAuth callback — continue
    }

    // 2. Check for existing session token
    if (auth.isAuthenticated()) {
      if (this.shouldClearStoredSessionOnLoad()) {
        await auth.signOut();
        this.showStatus("");
        return;
      }
      this.showStatus("Resuming session...");
      // Small delay to let the client set up auth
      await this.waitForAuth();
      const valid = await auth.validateSession();
      if (valid) {
        this.done();
        return;
      }
      this.showStatus("Session expired. Please sign in again.");
    }

    // 3. No session — show buttons
    this.showStatus("");
  }

  private async handlePassword(
    emailInput: HTMLInputElement,
    passwordInput: HTMLInputElement,
    flow: "signIn" | "signUp",
    primaryBtn: HTMLButtonElement,
    secondaryBtn: HTMLButtonElement,
  ) {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      this.showStatus("Email is required", true);
      return;
    }
    if (!password) {
      this.showStatus("Password is required", true);
      return;
    }
    if (flow === "signUp" && password.length < 8) {
      this.showStatus("Password must be at least 8 characters", true);
      return;
    }

    primaryBtn.disabled = true;
    secondaryBtn.disabled = true;
    this.showStatus(flow === "signUp" ? "Creating account..." : "Signing in...");

    try {
      const auth = getAuthManager();
      await auth.signInPassword(email, password, flow);
      this.showStatus("Signed in!");
      await this.waitForAuth();
      this.done();
    } catch (err: any) {
      const msg = this.getAuthErrorMessage(err, flow);
      this.showStatus(msg, true);
      primaryBtn.disabled = false;
      secondaryBtn.disabled = false;
    }
  }

  private async handleGitHub(btn: HTMLButtonElement) {
    btn.disabled = true;
    this.showStatus("Redirecting to GitHub...");
    try {
      const auth = getAuthManager();
      await auth.signInGitHub();
      // Browser will redirect — this code won't continue
    } catch (err: any) {
      this.showStatus(err.message || "Failed to start GitHub sign-in", true);
      btn.disabled = false;
    }
  }

  private makeWalletButton(label: string, variant: "primary" | "secondary" = "secondary") {
    const button = document.createElement("button");
    button.className = `auth-btn ${variant}`;
    button.textContent = label;
    return button;
  }

  private renderWalletSection() {
    if (!this.walletHeadingEl || !this.walletHintEl || !this.walletAddressEl || !this.walletActionsEl) {
      return;
    }

    const address = getCachedStacksAddress();
    const providerId = getCachedStacksProviderId();
    const providerLabel = formatStacksProvider(providerId);
    this.walletActionsEl.replaceChildren();
    this.walletActionsEl.classList.remove("is-stack");

    if (this.walletMode === "switching") {
      this.walletHeadingEl.textContent = "Choose a different payer wallet";
      this.walletHintEl.textContent =
        "This changes the wallet used for future x402 actions. Your app account will stay the same.";
      this.walletAddressEl.textContent = address
        ? `Current payer: ${providerLabel} • ${formatStacksAddress(address)}`
        : "No wallet connected yet.";

      const xverseBtn = this.makeWalletButton("Connect Xverse");
      xverseBtn.addEventListener("click", () => {
        void this.connectWallet("XverseProviders.BitcoinProvider");
      });

      const leatherBtn = this.makeWalletButton("Connect Leather");
      leatherBtn.addEventListener("click", () => {
        void this.connectWallet("LeatherProvider");
      });

      const otherBtn = this.makeWalletButton("Other wallet");
      otherBtn.addEventListener("click", () => {
        void this.connectWallet(undefined, "Other wallet");
      });

      const cancelBtn = this.makeWalletButton("Cancel", "secondary");
      cancelBtn.classList.add("auth-wallet-inline-btn");
      cancelBtn.addEventListener("click", () => {
        this.walletMode = "default";
        this.renderWalletSection();
        this.showStatus("");
      });

      this.walletActionsEl.append(leatherBtn, xverseBtn, otherBtn);
      this.walletActionsEl.classList.add("is-stack");
      this.walletActionsEl.appendChild(cancelBtn);
      return;
    }

    if (address && providerId) {
      this.walletHeadingEl.textContent = "Wallet ready";
      this.walletHintEl.textContent =
        "This wallet is only used when you approve a paid x402 action. You can still sign in with your app account normally.";
      this.walletAddressEl.textContent = `${providerLabel} • ${formatStacksAddress(address)}`;

      const switchBtn = this.makeWalletButton("Change wallet", "secondary");
      switchBtn.addEventListener("click", () => {
        this.walletMode = "switching";
        this.renderWalletSection();
        this.showStatus("Choose a different payer wallet.");
      });

      const disconnectBtn = this.makeWalletButton("Disconnect", "secondary");
      disconnectBtn.addEventListener("click", () => {
        void this.disconnectWallet();
      });

      this.walletActionsEl.append(disconnectBtn, switchBtn);
      return;
    }

    this.walletHeadingEl.textContent = "Optional payer wallet";
    this.walletHintEl.textContent =
      "Connect one testnet wallet now, or skip this and connect later when you actually need a paid x402 action.";
    this.walletAddressEl.textContent = "No wallet connected yet.";

    const xverseBtn = this.makeWalletButton("Connect Xverse");
    xverseBtn.addEventListener("click", () => {
      void this.connectWallet("XverseProviders.BitcoinProvider");
    });

    const leatherBtn = this.makeWalletButton("Connect Leather");
    leatherBtn.addEventListener("click", () => {
      void this.connectWallet("LeatherProvider");
    });

    const otherBtn = this.makeWalletButton("Other wallet");
    otherBtn.addEventListener("click", () => {
      void this.connectWallet(undefined, "Other wallet");
    });

    this.walletActionsEl.append(leatherBtn, xverseBtn, otherBtn);
  }

  private async disconnectWallet() {
    if (!this.walletActionsEl) return;
    const buttons = Array.from(this.walletActionsEl.querySelectorAll("button")) as HTMLButtonElement[];
    for (const button of buttons) button.disabled = true;
    this.showStatus("Disconnecting wallet...");
    try {
      await disconnectStacksWallet();
      this.walletMode = "default";
      this.renderWalletSection();
      this.showStatus("Wallet disconnected.");
    } catch (err: any) {
      this.showStatus(err?.message || "Failed to disconnect wallet.", true);
    } finally {
      for (const button of buttons) button.disabled = false;
    }
  }

  private async connectWallet(providerId?: StacksWalletProviderId, triggerLabel?: string) {
    if (!this.walletActionsEl) return;
    const providerName = providerId ? formatStacksProvider(providerId) : "wallet";
    const buttons = Array.from(this.walletActionsEl.querySelectorAll("button")) as HTMLButtonElement[];
    const activeButton =
      buttons.find((button) =>
        triggerLabel
          ? button.textContent?.includes(triggerLabel)
          : button.textContent?.includes(providerName),
      ) ?? buttons[0];
    const originalLabels = buttons.map((button) => button.textContent || "");
    for (const button of buttons) button.disabled = true;
    if (activeButton) activeButton.textContent = "Connecting...";
    this.showStatus(
      providerId
        ? `Connecting ${providerName}...`
        : "Opening wallet chooser...",
    );

    try {
      const shouldForceWalletSelect = this.walletMode === "switching" || !providerId;
      const account = await connectStacksWallet("testnet", {
        forceWalletSelect: shouldForceWalletSelect,
        providerId,
      });
      this.walletMode = "default";
      this.renderWalletSection();
      this.showStatus(
        `Wallet connected: ${formatStacksAddress(account.address)} via ${formatStacksProvider(account.providerId)}`,
      );
    } catch (err: any) {
      console.warn("Failed to connect wallet:", {
        providerName,
        message: err?.message,
        code: err?.code,
        error: err,
      });
      buttons.forEach((button, index) => {
        button.textContent = originalLabels[index] || button.textContent || "";
      });
      const message =
        typeof err?.message === "string" && err.message.includes("Wallet connection timed out")
          ? `${
              providerId ? providerName : "The selected wallet"
            } did not answer. Unlock the extension, approve the prompt, or disable the other Stacks wallet and try again.`
          : err?.message === "Wallet access denied." ||
              err?.message === "Access denied." ||
              err?.code === -32002
            ? `${
                providerId ? providerName : "The selected wallet"
              } rejected the account-access request. Open the extension and approve the connection prompt, then try again.`
          : err?.message || `Failed to connect ${providerId ? providerName : "wallet"}.`;
      this.showStatus(message, true);
    } finally {
      this.renderWalletSection();
    }
  }

  /** Wait briefly for the ConvexClient to become authenticated */
  private waitForAuth(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  private done() {
    if (this.destroyed) return;
    this.onAuthenticated();
  }

  private showStatus(text: string, isError = false) {
    this.statusEl.textContent = text;
    this.statusEl.className = `auth-status${isError ? " error" : ""}`;
  }

  private shouldClearStoredSessionOnLoad() {
    const localConvex = isLocalConvexUrl(import.meta.env.VITE_CONVEX_URL as string | undefined);
    return localConvex && (import.meta.env[AUTO_RESUME_SESSION_FLAG] as string) !== "1";
  }

  private getAuthErrorMessage(err: unknown, flow: "signIn" | "signUp") {
    const message =
      err && typeof err === "object" && "message" in err ? String((err as any).message) : "";

    if (
      message.includes("InvalidSecret") ||
      message.includes("Invalid credentials") ||
      message.includes("InvalidAccountId")
    ) {
      return flow === "signUp"
        ? "That email already exists. In local dev, click Sign Up again to reset its password."
        : "Invalid email or password. If the local database was reset, try Sign In again or use Sign Up once.";
    }

    if (message.includes("already exists")) {
      return "That email already exists. In local dev, Sign Up resets the password for it.";
    }

    return message || `Failed to ${flow === "signUp" ? "create account" : "sign in"}`;
  }

  destroy() {
    this.destroyed = true;
    this.el.remove();
  }
}
