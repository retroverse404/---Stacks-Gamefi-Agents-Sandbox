/**
 * Root application controller.
 * Flow: AuthScreen → ProfileScreen → Game
 *       AuthScreen → Game (guest mode — read-only, no auth)
 */
import type { ConvexClient } from "convex/browser";
import { clearGateUnlocked, getGateRemainingMs, isGateEnabled, isGateUnlocked } from "./lib/gateAccess.ts";
import { AuthScreen } from "./ui/AuthScreen.ts";
import { GateScreen } from "./ui/GateScreen.ts";
import { ProfileScreen } from "./ui/ProfileScreen.ts";
import { GameShell } from "./ui/GameShell.ts";
import { SplashHost } from "./splash/SplashHost.ts";
import type { ProfileData } from "./engine/types.ts";
import { getAuthManager } from "./lib/convexClient.ts";
import { isLocalConvexUrl } from "./lib/runtimeEnv.ts";

const LOCAL_DEV_ID_KEY = "__tinyrealmsLocalDevId";
const LOCAL_DEV_SIGNED_OUT_KEY = "__tinyrealmsLocalDevSignedOut";
const LOCAL_DEV_AUTO_AUTH_FLAG = "VITE_LOCAL_DEV_AUTO_AUTH";

export class App {
  private root: HTMLElement;
  private convex: ConvexClient;
  private gateScreen: GateScreen | null = null;
  private authScreen: AuthScreen | null = null;
  private profileScreen: ProfileScreen | null = null;
  private gameShell: GameShell | null = null;
  private splashHost: SplashHost | null = null;
  private gateSessionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement, convex: ConvexClient) {
    this.root = root;
    this.convex = convex;
  }

  async start() {
    if (this.shouldStartLocalDev()) {
      await this.startLocalDev();
      return;
    }
    if (this.shouldShowGate()) {
      this.showGateScreen();
      return;
    }
    this.startGateSessionMonitor();
    this.showAuthScreen();
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  private showGateScreen() {
    this.stopGateSessionMonitor();
    this.clear();
    this.gateScreen = new GateScreen(() => {
      this.startGateSessionMonitor();
      this.showAuthScreen();
    });
    this.root.appendChild(this.gateScreen.el);
  }

  private showAuthScreen() {
    this.clear();
    this.authScreen = new AuthScreen(
      () => {
        this.clearLocalDevSignedOut();
        this.showProfileScreen();
      },
      () => {
        this.clearLocalDevSignedOut();
        this.showGameAsGuest();
      },
    );
    this.root.appendChild(this.authScreen.el);
  }

  // ---------------------------------------------------------------------------
  // Guest mode — skip auth + profile, use a synthetic read-only profile
  // ---------------------------------------------------------------------------

  private showGameAsGuest() {
    const guestProfile: ProfileData = {
      _id: "guest",
      name: "Guest",
      spriteUrl: "/assets/characters/guest.json",
      color: "#8899aa",
      role: "guest",
      mapName: "Cozy Cabin",
      stats: { hp: 100, maxHp: 100, atk: 0, def: 0, spd: 5, level: 1, xp: 0 },
      items: [],
      npcsChatted: [],
      createdAt: Date.now(),
    };
    this.showGame(guestProfile);
  }

  // ---------------------------------------------------------------------------
  // Profile selection
  // ---------------------------------------------------------------------------

  private showProfileScreen() {
    this.clear();
    this.profileScreen = new ProfileScreen(
      (profile) => this.showGame(profile),
      () => {
        if (this.isLocalDevAutoAuthEnabled()) {
          this.markLocalDevSignedOut();
          this.showAuthScreen();
          return;
        }
        this.showAuthScreen();
      },
    );
    this.root.appendChild(this.profileScreen.el);
  }

  // ---------------------------------------------------------------------------
  // Game
  // ---------------------------------------------------------------------------

  private showGame(profile: ProfileData) {
    this.clear();
    this.gameShell = new GameShell(profile);
    this.root.appendChild(this.gameShell.el);

    this.splashHost = new SplashHost();
    this.root.appendChild(this.splashHost.el);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private clear() {
    if (this.gateScreen) {
      this.gateScreen.destroy();
      this.gateScreen = null;
    }
    if (this.authScreen) {
      this.authScreen.destroy();
      this.authScreen = null;
    }
    if (this.profileScreen) {
      this.profileScreen.destroy();
      this.profileScreen = null;
    }
    if (this.gameShell) {
      this.gameShell.destroy();
      this.gameShell = null;
    }
    if (this.splashHost) {
      this.splashHost.destroy();
      this.splashHost = null;
    }
    this.root.innerHTML = "";
  }

  destroy() {
    this.stopGateSessionMonitor();
    this.clear();
  }

  private isLocalDev() {
    return isLocalConvexUrl(import.meta.env.VITE_CONVEX_URL as string | undefined);
  }

  private shouldShowGate() {
    return isGateEnabled() && !isGateUnlocked() && !this.isLocalDev();
  }

  private startGateSessionMonitor() {
    this.stopGateSessionMonitor();
    if (!isGateEnabled() || !isGateUnlocked()) return;
    const remainingMs = getGateRemainingMs();
    if (remainingMs <= 0) {
      clearGateUnlocked();
      this.showGateScreen();
      return;
    }
    this.gateSessionTimer = setTimeout(() => {
      clearGateUnlocked();
      this.showGateScreen();
    }, remainingMs);
  }

  private stopGateSessionMonitor() {
    if (this.gateSessionTimer) {
      clearTimeout(this.gateSessionTimer);
      this.gateSessionTimer = null;
    }
  }

  private isLocalDevAutoAuthEnabled() {
    return this.isLocalDev() && (import.meta.env[LOCAL_DEV_AUTO_AUTH_FLAG] as string) === "1";
  }

  private shouldStartLocalDev() {
    return this.isLocalDevAutoAuthEnabled() && !this.isLocalDevSignedOut();
  }

  private async startLocalDev() {
    try {
      this.clearLocalDevSignedOut();
      const auth = getAuthManager();
      const alreadyValid =
        auth.isAuthenticated() && (await auth.validateSession());

      if (!alreadyValid) {
        const { email, password } = this.getLocalDevCredentials();
        await auth.signInPassword(email, password, "signUp");
        await this.waitForAuth();
      }

      this.showProfileScreen();
    } catch (error) {
      console.error("Local dev bootstrap failed:", error);
      this.showAuthScreen();
    }
  }

  private getLocalDevCredentials() {
    let localId = localStorage.getItem(LOCAL_DEV_ID_KEY);
    if (!localId) {
      localId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `local-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(LOCAL_DEV_ID_KEY, localId);
    }

    return {
      email: `local-dev-${localId}@tinyrealms.local`,
      password: `tinyrealms-${localId}-local-dev`,
    };
  }

  private waitForAuth() {
    return new Promise((resolve) => setTimeout(resolve, 300));
  }

  private isLocalDevSignedOut() {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(LOCAL_DEV_SIGNED_OUT_KEY) === "1";
  }

  private markLocalDevSignedOut() {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(LOCAL_DEV_SIGNED_OUT_KEY, "1");
  }

  private clearLocalDevSignedOut() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(LOCAL_DEV_SIGNED_OUT_KEY);
  }
}
