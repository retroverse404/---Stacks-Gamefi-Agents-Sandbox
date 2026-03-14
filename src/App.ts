/**
 * Root application controller.
 * Flow: AuthScreen → ProfileScreen → Game
 *       AuthScreen → Game (guest mode — read-only, no auth)
 */
import type { ConvexClient } from "convex/browser";
import { AuthScreen } from "./ui/AuthScreen.ts";
import { ProfileScreen } from "./ui/ProfileScreen.ts";
import { GameShell } from "./ui/GameShell.ts";
import { SplashHost } from "./splash/SplashHost.ts";
import type { ProfileData } from "./engine/types.ts";
import { getAuthManager } from "./lib/convexClient.ts";

const LOCAL_DEV_ID_KEY = "__tinyrealmsLocalDevId";

export class App {
  private root: HTMLElement;
  private convex: ConvexClient;
  private authScreen: AuthScreen | null = null;
  private profileScreen: ProfileScreen | null = null;
  private gameShell: GameShell | null = null;
  private splashHost: SplashHost | null = null;

  constructor(root: HTMLElement, convex: ConvexClient) {
    this.root = root;
    this.convex = convex;
  }

  async start() {
    if (this.isLocalDev()) {
      await this.startLocalDev();
      return;
    }
    this.showAuthScreen();
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  private showAuthScreen() {
    this.clear();
    this.authScreen = new AuthScreen(
      () => this.showProfileScreen(),
      () => this.showGameAsGuest(),
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
      () => this.start(),
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
    this.clear();
  }

  private isLocalDev() {
    return (import.meta.env.VITE_CONVEX_URL as string)?.includes("127.0.0.1");
  }

  private async startLocalDev() {
    try {
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
}
