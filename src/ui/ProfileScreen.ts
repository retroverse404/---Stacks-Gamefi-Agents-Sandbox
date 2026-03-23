/**
 * ProfileScreen -- displayed on startup. Lists existing profiles,
 * allows creating new ones, deleting them, and viewing account info.
 */
import { getAuthManager, getConvexClient } from "../lib/convexClient.ts";
import {
  connectStacksWallet,
  disconnectStacksWallet,
  formatStacksAddress,
  formatStacksProvider,
  getCachedStacksAddress,
  getCachedStacksProviderId,
  getInstalledStacksProviderIds,
  type StacksWalletProviderId,
} from "../lib/stacksWallet.ts";
import { api } from "../../convex/_generated/api";
import type { ProfileData } from "../engine/types.ts";
import "./ProfileScreen.css";

const DEFAULT_PROFILE_BACKGROUND_VIDEO_URL = "/assets/Video%20Loops/DnA2A.webm";
const DEFAULT_PROFILE_SOUNDTRACK_URL = "/assets/audio/Opening%20To%20Profion%27s%20Dungeon.mp3";
const DEFAULT_PROFILE_SOUNDTRACK_TITLE = "Opening To Profion's Dungeon";
const DEFAULT_PROFILE_SOUNDTRACK_ARTIST = "Justin Caine Burnett";
const COZY_CABIN_THEME_TITLE = "Nardis (HipHop Remix)";
const COZY_CABIN_THEME_ARTIST = "Jackie Coleman";
const DEFAULT_PLAYER_PROFILE_NAME = "trip";
const CANONICAL_START_WORLD = "Cozy Cabin";

// Available character sprites the player can pick from
const SPRITE_OPTIONS = [
  { label: "Guest", url: "/assets/characters/guest.json" },
  { label: "Villager 1", url: "/assets/characters/villager2.json" },
  { label: "Villager 2", url: "/assets/characters/villager3.json" },
  { label: "Villager 3", url: "/assets/characters/villager4.json" },
  { label: "Villager 4", url: "/assets/characters/villager5.json" },
  { label: "Jane", url: "/assets/characters/villager-jane.json" },
  { label: "Woman", url: "/assets/characters/woman-med.json" },
];

const PROFILE_COLORS = [
  "#7a8796", "#a46a4b", "#4f7a63", "#8d7a45", "#4c7a7d", "#8b6b78",
];

// Trash icon SVG
const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>`;

function createProfileBackgroundMedia() {
  const shell = document.createElement("div");
  shell.className = "profile-background-shell";

  const video = document.createElement("video");
  video.className = "profile-background-video";
  video.src =
    (import.meta.env.VITE_PROFILE_BACKGROUND_VIDEO_URL as string | undefined) ||
    DEFAULT_PROFILE_BACKGROUND_VIDEO_URL;
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.tabIndex = -1;
  video.setAttribute("aria-hidden", "true");

  shell.appendChild(video);
  return shell;
}

function isCozyCabinName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "cozy cabin" || normalized === "cozy-cabin";
}

export class ProfileScreen {
  readonly el: HTMLElement;
  private onSelect: (profile: ProfileData) => void;
  private onSignOut: (() => void) | null;

  // Sub-views
  private formEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private accountEl: HTMLElement | null = null;
  private superuserEl: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private startMapSelect: HTMLSelectElement | null = null;
  private startLabelSelect: HTMLSelectElement | null = null;
  /** Map name → list of label names (populated by loadStartMaps) */
  private mapLabels = new Map<string, string[]>();
  private selectedSpriteUrl = SPRITE_OPTIONS[0].url;
  private statusEl: HTMLElement | null = null;
  private profilesUnsub: (() => void) | null = null;
  private titleEl: HTMLElement | null = null;
  private subEl: HTMLElement | null = null;
  private walletStatusEl: HTMLElement | null = null;
  private soundtrackStatusEl: HTMLElement | null = null;
  private soundtrackCreditEl: HTMLElement | null = null;
  private soundtrackToggleBtn: HTMLButtonElement | null = null;
  private soundtrackAudio: HTMLAudioElement | null = null;
  private soundtrackNeedsGesture = false;
  private soundtrackEnabled = true;
  private leatherWalletBtn: HTMLButtonElement | null = null;
  private xverseWalletBtn: HTMLButtonElement | null = null;
  private otherWalletBtn: HTMLButtonElement | null = null;
  private superuserBtn: HTMLButtonElement | null = null;
  private actingSuperuserProfileId: string | null = null;

  // Confirm dialog
  private confirmOverlay: HTMLElement | null = null;
  private deleteStatusEl: HTMLElement | null = null;
  private readonly handleSoundtrackGesture = () => {
    if (!this.soundtrackEnabled) return;
    if (!this.soundtrackNeedsGesture) return;
    void this.playSoundtrack();
  };

  constructor(
    onSelect: (profile: ProfileData) => void,
    onSignOut?: () => void,
  ) {
    this.onSelect = onSelect;
    this.onSignOut = onSignOut ?? null;

    this.el = document.createElement("div");
    this.el.className = "profile-screen";
    this.el.appendChild(createProfileBackgroundMedia());

    const overlay = document.createElement("div");
    overlay.className = "profile-overlay";
    this.el.appendChild(overlay);

    const content = document.createElement("div");
    content.className = "profile-content";
    this.el.appendChild(content);

    // Top bar with account link + sign-out
    const topBar = document.createElement("div");
    topBar.className = "profile-top-bar";

    const accountBtn = document.createElement("button");
    accountBtn.className = "profile-btn secondary";
    accountBtn.textContent = "Account";
    accountBtn.style.fontSize = "12px";
    accountBtn.style.padding = "6px 14px";
    accountBtn.addEventListener("click", () => this.showAccountInfo());
    topBar.appendChild(accountBtn);

    const leatherBtn = document.createElement("button");
    leatherBtn.className = "profile-btn secondary";
    leatherBtn.textContent = "Leather";
    leatherBtn.style.fontSize = "12px";
    leatherBtn.style.padding = "6px 14px";
    this.leatherWalletBtn = leatherBtn;

    const xverseBtn = document.createElement("button");
    xverseBtn.className = "profile-btn secondary";
    xverseBtn.textContent = "Xverse";
    xverseBtn.style.fontSize = "12px";
    xverseBtn.style.padding = "6px 14px";
    this.xverseWalletBtn = xverseBtn;

    const otherBtn = document.createElement("button");
    otherBtn.className = "profile-btn secondary";
    otherBtn.textContent = "Other Wallet";
    otherBtn.style.fontSize = "12px";
    otherBtn.style.padding = "6px 14px";
    this.otherWalletBtn = otherBtn;

    leatherBtn.addEventListener("click", () => {
      void this.handleWalletAction("LeatherProvider", [leatherBtn, xverseBtn, otherBtn]);
    });
    xverseBtn.addEventListener("click", () => {
      void this.handleWalletAction("XverseProviders.BitcoinProvider", [leatherBtn, xverseBtn, otherBtn]);
    });
    otherBtn.addEventListener("click", () => {
      const cachedProviderId = getCachedStacksProviderId();
      const providerId =
        cachedProviderId &&
        cachedProviderId !== "LeatherProvider" &&
        cachedProviderId !== "XverseProviders.BitcoinProvider"
          ? cachedProviderId
          : undefined;
      void this.handleWalletAction(providerId, [leatherBtn, xverseBtn, otherBtn]);
    });

    topBar.appendChild(leatherBtn);
    topBar.appendChild(xverseBtn);
    topBar.appendChild(otherBtn);

    this.superuserBtn = document.createElement("button");
    this.superuserBtn.className = "profile-btn secondary";
    this.superuserBtn.textContent = "Superuser";
    this.superuserBtn.style.fontSize = "12px";
    this.superuserBtn.style.padding = "6px 14px";
    this.superuserBtn.style.display = "none";
    this.superuserBtn.addEventListener("click", () => this.toggleSuperuserPanel());
    topBar.appendChild(this.superuserBtn);

    if (this.onSignOut) {
      const signOutBtn = document.createElement("button");
      signOutBtn.className = "profile-btn secondary";
      signOutBtn.textContent = "Sign Out";
      signOutBtn.style.fontSize = "12px";
      signOutBtn.style.padding = "6px 14px";
      signOutBtn.addEventListener("click", () => this.handleSignOut());
      topBar.appendChild(signOutBtn);
    }
    this.el.appendChild(topBar);

    const eyebrow = document.createElement("div");
    eyebrow.className = "profile-eyebrow";
    eyebrow.textContent = "Dungeons and Agents";
    content.appendChild(eyebrow);

    const categories = document.createElement("div");
    categories.className = "profile-categories";
    ["GameFi", "AI", "NFTs"].forEach((label) => {
      const chip = document.createElement("span");
      chip.textContent = label;
      categories.appendChild(chip);
    });
    content.appendChild(categories);

    this.titleEl = document.createElement("h1");
    this.titleEl.textContent = "Choose Your Agent";
    content.appendChild(this.titleEl);

    this.subEl = document.createElement("div");
    this.subEl.className = "subtitle";
    this.subEl.textContent =
      "Wallet-backed roles, paid actions, and live world state. Pick your role and step into the sandbox.";
    content.appendChild(this.subEl);

    this.walletStatusEl = document.createElement("div");
    this.walletStatusEl.className = "profile-wallet-status";
    content.appendChild(this.walletStatusEl);
    this.renderWalletStatus(getCachedStacksAddress());
    this.refreshWalletButtons();
    void this.refreshWalletDiagnostics();

    this.listEl = document.createElement("div");
    this.listEl.className = "profile-list";
    content.appendChild(this.listEl);

    this.formEl = this.buildCreateForm();
    this.formEl.style.display = "none";
    content.appendChild(this.formEl);

    // Account info panel (hidden by default)
    this.accountEl = document.createElement("div");
    this.accountEl.className = "profile-account-panel";
    this.accountEl.style.display = "none";
    content.appendChild(this.accountEl);

    // Superuser panel (hidden by default)
    this.superuserEl = document.createElement("div");
    this.superuserEl.className = "profile-account-panel";
    this.superuserEl.style.display = "none";
    content.appendChild(this.superuserEl);

    const bottomRail = document.createElement("div");
    bottomRail.className = "profile-bottom-rail";

    const footerNote = document.createElement("div");
    footerNote.className = "profile-footer-note";
    footerNote.textContent =
      "* Demo build. Some wallet, payment, and market features currently run on testnet or prototype infrastructure.";
    bottomRail.appendChild(footerNote);

    const soundtrackBar = document.createElement("div");
    soundtrackBar.className = "profile-soundtrack";

    const soundtrackMeta = document.createElement("div");
    soundtrackMeta.className = "profile-soundtrack-meta";

    const soundtrackLabel = document.createElement("div");
    soundtrackLabel.className = "profile-soundtrack-label";
    soundtrackLabel.textContent = "Now Playing";
    soundtrackMeta.appendChild(soundtrackLabel);

    this.soundtrackStatusEl = document.createElement("div");
    this.soundtrackStatusEl.className = "profile-soundtrack-status";
    soundtrackMeta.appendChild(this.soundtrackStatusEl);

    this.soundtrackCreditEl = document.createElement("div");
    this.soundtrackCreditEl.className = "profile-soundtrack-credit";
    soundtrackMeta.appendChild(this.soundtrackCreditEl);

    this.soundtrackToggleBtn = document.createElement("button");
    this.soundtrackToggleBtn.className = "profile-soundtrack-toggle";
    this.soundtrackToggleBtn.type = "button";
    this.soundtrackToggleBtn.addEventListener("click", () => this.toggleSoundtrack());

    soundtrackBar.append(soundtrackMeta, this.soundtrackToggleBtn);
    bottomRail.appendChild(soundtrackBar);
    this.el.appendChild(bottomRail);
    this.renderSoundtrackStatus();
    this.startSoundtrack();

    // Confirm dialog overlay (hidden)
    this.confirmOverlay = document.createElement("div");
    this.confirmOverlay.className = "profile-confirm-overlay";
    this.confirmOverlay.style.display = "none";
    this.el.appendChild(this.confirmOverlay);

    void this.initSession();
  }

  private async initSession() {
    try {
      const auth = getAuthManager();
      const valid = auth.isAuthenticated() && (await auth.validateSession());
      if (!valid) {
        this.onSignOut?.();
        return;
      }

      await this.loadProfiles();
      this.subscribeToProfiles();
    } catch (error) {
      console.warn("Profile screen session init failed:", error);
      this.onSignOut?.();
    }
  }

  // ---------------------------------------------------------------------------
  // Load & render profiles
  // ---------------------------------------------------------------------------

  private async loadProfiles() {
    try {
      const convex = getConvexClient();
      const profiles = await convex.query(api.profiles.list, {});
      const mapped = (profiles as any[]).map((p) => ({
        ...p,
        role: p.role ?? "player",
      })) as ProfileData[];
      this.renderList(mapped);
    } catch (err) {
      if (await this.handleAuthError(err)) return;
      console.warn("Failed to load profiles:", err);
      this.renderList([]);
    }
  }

  /** Subscribe to profile changes so in-use state updates live */
  private subscribeToProfiles() {
    const convex = getConvexClient();
    this.profilesUnsub = convex.onUpdate(
      api.profiles.list,
      {},
      (profiles: any[]) => {
        const mapped = profiles.map((p) => ({
          ...p,
          role: p.role ?? "player",
        })) as ProfileData[];
        this.renderList(mapped);
      },
      (err) => console.warn("Profile subscription error:", err),
    );
  }

  private renderList(profiles: ProfileData[]) {
    if (!this.listEl) return;
    this.listEl.innerHTML = "";

    const superusers = profiles.filter((p) => p.role === "superuser");
    this.actingSuperuserProfileId = superusers.length > 0 ? String(superusers[0]._id) : null;
    if (this.superuserBtn) {
      this.superuserBtn.style.display = this.actingSuperuserProfileId ? "" : "none";
    }

    for (const p of profiles) {
      const card = this.buildProfileCard(p);
      this.listEl.appendChild(card);
    }

    // "New" card
    const newCard = document.createElement("div");
    newCard.className = "profile-card new-profile";
    newCard.innerHTML = `<div class="plus">+</div><div>New Agent</div>`;
    newCard.addEventListener("click", () => this.showCreateForm());
    this.listEl.appendChild(newCard);
  }

  private buildProfileCard(profile: ProfileData): HTMLElement {
    const card = document.createElement("div");
    card.className = "profile-card";

    // Delete button (top-right corner)
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "profile-delete-btn";
    deleteBtn.innerHTML = TRASH_ICON;
    deleteBtn.title = "Delete agent";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.confirmDelete(profile);
    });
    card.appendChild(deleteBtn);

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.borderColor = profile.color;
    this.renderSpritePreview(avatar, profile.spriteUrl);
    card.appendChild(avatar);

    // Name + role badge + in-use indicator
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = profile.name;
    if (profile.role === "superuser") {
      const badge = document.createElement("span");
      badge.className = "role-badge admin";
      badge.textContent = "superuser";
      name.appendChild(badge);
    }
    card.appendChild(name);

    // Stats row
    const statsRow = document.createElement("div");
    statsRow.className = "stats-row";
    statsRow.innerHTML =
      `<span>Lv ${profile.stats.level}</span>` +
      `<span>${profile.npcsChatted.length} contacts</span>`;
    card.appendChild(statsRow);

    // Meta
    const meta = document.createElement("div");
    meta.className = "meta";
    const itemCount = profile.items.reduce((s, i) => s + i.quantity, 0);
    meta.textContent = `${itemCount} items`;
    card.appendChild(meta);

    card.addEventListener("click", () => this.selectProfile(profile));
    return card;
  }

  // ---------------------------------------------------------------------------
  // Delete confirmation
  // ---------------------------------------------------------------------------

  private confirmDelete(profile: ProfileData) {
    if (!this.confirmOverlay) return;

    this.confirmOverlay.innerHTML = "";
    this.confirmOverlay.style.display = "flex";
    this.deleteStatusEl = null;

    const dialog = document.createElement("div");
    dialog.className = "profile-confirm-dialog";

    const msg = document.createElement("p");
    msg.innerHTML =
      `Are you sure you want to delete <strong>${profile.name}</strong>?` +
      `<br><span class="confirm-warning">This cannot be undone. All stats, items, and progress will be lost.</span>`;
    dialog.appendChild(msg);

    const btnRow = document.createElement("div");
    btnRow.className = "profile-btn-row";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "profile-btn secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.hideConfirm());

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "profile-btn danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => this.doDelete(profile, deleteBtn));

    btnRow.append(cancelBtn, deleteBtn);
    dialog.appendChild(btnRow);

    const status = document.createElement("div");
    status.className = "profile-status error";
    status.style.marginTop = "8px";
    status.textContent = "";
    dialog.appendChild(status);
    this.deleteStatusEl = status;

    this.confirmOverlay.appendChild(dialog);
  }

  private hideConfirm() {
    if (this.confirmOverlay) {
      this.confirmOverlay.style.display = "none";
      this.confirmOverlay.innerHTML = "";
    }
    this.deleteStatusEl = null;
  }

  private async doDelete(profile: ProfileData, btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.textContent = "Deleting...";
    if (this.deleteStatusEl) this.deleteStatusEl.textContent = "";
    try {
      const convex = getConvexClient();
      await convex.mutation(api.profiles.remove, { id: profile._id as any });
      this.hideConfirm();
      // List will auto-update via subscription
    } catch (err: any) {
      btn.disabled = false;
      btn.textContent = "Delete";
      const message = err?.message || "Failed to delete profile";
      if (this.deleteStatusEl) {
        this.deleteStatusEl.textContent = message;
      }
      console.warn("Failed to delete profile:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Profile selection
  // ---------------------------------------------------------------------------

  /** Select the profile and start the game */
  private async selectProfile(profile: ProfileData) {
    try {
      const convex = getConvexClient();
      await convex.mutation(api.profiles.resetMap, {
        id: profile._id as any,
        mapName: CANONICAL_START_WORLD,
      });
      const refreshed = await convex.query(api.profiles.get, { id: profile._id as any });
      const selected = refreshed
        ? ({ ...refreshed, role: (refreshed as any).role ?? "player" } as unknown as ProfileData)
        : ({ ...profile, mapName: CANONICAL_START_WORLD } as ProfileData);
      await this.bindCachedWalletToProfile(selected);
      this.profilesUnsub?.();
      this.profilesUnsub = null;
      this.onSelect(selected);
    } catch (err: any) {
      if (await this.handleAuthError(err)) return;
      console.warn("Failed to select profile:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Sprite preview (render first frame of the sprite sheet onto a tiny canvas)
  // ---------------------------------------------------------------------------

  private async renderSpritePreview(container: HTMLElement, spriteUrl: string) {
    try {
      const resp = await fetch(spriteUrl);
      const json = await resp.json();
      const imgPath = spriteUrl.replace(/[^/]+$/, "") + (json.meta?.image ?? "");
      const img = new Image();
      img.src = imgPath;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const frameKeys = Object.keys(json.frames);
      if (frameKeys.length === 0) return;
      const firstFrame = json.frames[frameKeys[0]];
      const f = firstFrame.frame ?? firstFrame;
      const fw = f.w;
      const fh = f.h;

      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = fw * scale;
      canvas.height = fh * scale;
      canvas.style.width = `${fw * scale}px`;
      canvas.style.height = `${fh * scale}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, f.x, f.y, fw, fh, 0, 0, fw * scale, fh * scale);
      container.appendChild(canvas);
    } catch {
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:32px;height:32px;border-radius:50%;background:var(--accent);";
      container.appendChild(dot);
    }
  }

  // ---------------------------------------------------------------------------
  // Create form
  // ---------------------------------------------------------------------------

  private buildCreateForm(): HTMLElement {
    const form = document.createElement("div");
    form.className = "profile-create-form";

    const h2 = document.createElement("h2");
    h2.textContent = "Create Agent";
    form.appendChild(h2);

    // Name field
    const nameField = document.createElement("div");
    nameField.className = "field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = "Agent name";
    this.nameInput.value = DEFAULT_PLAYER_PROFILE_NAME;
    this.nameInput.maxLength = 24;
    nameField.append(nameLabel, this.nameInput);
    form.appendChild(nameField);

    // Sprite picker
    const spriteField = document.createElement("div");
    spriteField.className = "field";
    const spriteLabel = document.createElement("label");
    spriteLabel.textContent = "Appearance";
    spriteField.appendChild(spriteLabel);

    const picker = document.createElement("div");
    picker.className = "sprite-picker";

    for (const opt of SPRITE_OPTIONS) {
      const btn = document.createElement("div");
      btn.className = `sprite-option${opt.url === this.selectedSpriteUrl ? " selected" : ""}`;
      btn.title = opt.label;
      this.renderSpritePreview(btn, opt.url);
      btn.addEventListener("click", () => {
        this.selectedSpriteUrl = opt.url;
        picker.querySelectorAll(".sprite-option").forEach((el) =>
          el.classList.remove("selected"),
        );
        btn.classList.add("selected");
      });
      picker.appendChild(btn);
    }
    spriteField.appendChild(picker);
    form.appendChild(spriteField);

    // Starting world
    const startMapField = document.createElement("div");
    startMapField.className = "field";
    const startMapLabel = document.createElement("label");
    startMapLabel.textContent = "Starting world";
    this.startMapSelect = document.createElement("select");
    this.startMapSelect.className = "profile-select";
    this.startMapSelect.innerHTML = `<option value="${CANONICAL_START_WORLD}">${CANONICAL_START_WORLD}</option>`;
    startMapField.append(startMapLabel, this.startMapSelect);
    form.appendChild(startMapField);

    // Starting spawn label
    const startLabelField = document.createElement("div");
    startLabelField.className = "field";
    const startLabelLabel = document.createElement("label");
    startLabelLabel.textContent = "Starting position";
    this.startLabelSelect = document.createElement("select");
    this.startLabelSelect.className = "profile-select";
    this.startLabelSelect.innerHTML = `<option value="start1">start1</option>`;
    startLabelField.append(startLabelLabel, this.startLabelSelect);
    form.appendChild(startLabelField);

    // Status
    this.statusEl = document.createElement("div");
    this.statusEl.className = "profile-status";
    form.appendChild(this.statusEl);

    // Buttons
    const btnRow = document.createElement("div");
    btnRow.className = "profile-btn-row";

    const createBtn = document.createElement("button");
    createBtn.className = "profile-btn primary";
    createBtn.textContent = "Create & Play";
    createBtn.addEventListener("click", () => this.doCreate());

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "profile-btn secondary";
    cancelBtn.textContent = "Back";
    cancelBtn.addEventListener("click", () => this.hideCreateForm());

    btnRow.append(createBtn, cancelBtn);
    form.appendChild(btnRow);

    return form;
  }

  private showCreateForm() {
    if (this.listEl) this.listEl.style.display = "none";
    if (this.formEl) this.formEl.style.display = "";
    this.loadStartMaps();
    if (this.nameInput) {
      this.nameInput.value = DEFAULT_PLAYER_PROFILE_NAME;
      this.nameInput.focus();
      this.nameInput.select();
    }
  }

  private hideCreateForm() {
    if (this.formEl) this.formEl.style.display = "none";
    if (this.listEl) this.listEl.style.display = "";
    if (this.statusEl) this.statusEl.textContent = "";
  }

  private async loadStartMaps() {
    if (!this.startMapSelect) return;
    try {
      const convex = getConvexClient();
      // listStartMaps returns system maps + current user's own maps
      const maps = await convex.query(api.maps.listStartMaps, {});

      // Build label lookup and deduplicate map names
      this.mapLabels.clear();
      const seenNames = new Set<string>();
      const names: string[] = [];
      for (const m of maps as any[]) {
        const name = String(m.name);
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        names.push(name);
        this.mapLabels.set(name, (m.labelNames as string[]) ?? []);
      }

      const preferred = names.find((name) => isCozyCabinName(name))
        ?? names[0]
        ?? CANONICAL_START_WORLD;

      this.startMapSelect.innerHTML = "";
      for (const name of names.length ? names : [CANONICAL_START_WORLD]) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        this.startMapSelect.appendChild(opt);
      }
      this.startMapSelect.value = preferred;

      // Wire up change event to update label dropdown
      this.startMapSelect.addEventListener("change", () => {
        this.updateLabelDropdown(this.startMapSelect!.value);
      });

      // Populate labels for the initially selected map
      this.updateLabelDropdown(preferred);
    } catch {
      this.startMapSelect.innerHTML = `<option value="${CANONICAL_START_WORLD}">${CANONICAL_START_WORLD}</option>`;
      this.startMapSelect.value = CANONICAL_START_WORLD;
      this.mapLabels.clear();
      this.updateLabelDropdown(CANONICAL_START_WORLD);
    }
  }

  /** Refresh the starting-position dropdown with labels for the given map */
  private updateLabelDropdown(mapName: string) {
    if (!this.startLabelSelect) return;
    const labels = this.mapLabels.get(mapName) ?? [];
    this.startLabelSelect.innerHTML = "";

    if (labels.length === 0) {
      const opt = document.createElement("option");
      opt.value = "start1";
      opt.textContent = "start1 (default)";
      this.startLabelSelect.appendChild(opt);
      return;
    }

    for (const label of labels) {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      this.startLabelSelect.appendChild(opt);
    }

    // Prefer "start1" if it exists, otherwise use the first label
    if (labels.includes("start1")) {
      this.startLabelSelect.value = "start1";
    } else {
      this.startLabelSelect.value = labels[0];
    }
  }

  private async doCreate() {
    const name = this.nameInput?.value.trim();
    if (!name) {
      this.showStatus("Name is required", true);
      return;
    }

    this.showStatus("Creating...");

    try {
      const convex = getConvexClient();
      const color = PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)];
      const startMapName = this.startMapSelect?.value?.trim() || CANONICAL_START_WORLD;
      const startLabel = this.startLabelSelect?.value?.trim() || "start1";
      const profileId = await convex.mutation(api.profiles.create, {
        name,
        spriteUrl: this.selectedSpriteUrl,
        color,
        startMapName,
        startLabel,
      });

      const profile = await convex.query(api.profiles.get, { id: profileId });
      if (profile) {
        const p = { ...profile, role: (profile as any).role ?? "player" } as unknown as ProfileData;
        await this.bindCachedWalletToProfile(p);
        this.onSelect(p);
      }
    } catch (err: any) {
      if (await this.handleAuthError(err)) return;
      this.showStatus(err.message || "Failed to create profile", true);
    }
  }

  private async bindCachedWalletToProfile(profile: ProfileData) {
    const address = getCachedStacksAddress();
    if (!address) return;

    const convex = getConvexClient();
    const providerId = getCachedStacksProviderId();

    try {
      await convex.mutation(api.wallets.bindPlayerWallet, {
        profileId: profile._id as any,
        network: "testnet",
        address,
        provider: providerId ?? undefined,
        walletRole: "payer",
        custodyType: "browser",
      });
    } catch (error) {
      console.warn("Failed to bind cached wallet to profile:", error);
    }
  }

  private async handleAuthError(err: unknown) {
    const message =
      err && typeof err === "object" && "message" in err ? String((err as any).message) : "";

    if (!message.includes("Not authenticated")) return false;

    this.showStatus("Local auth was reset. Please sign in again.", true);
    try {
      await getAuthManager().signOut();
    } catch {
      // Ignore sign-out failures; the goal is to clear stale local tokens.
    }
    this.profilesUnsub?.();
    this.profilesUnsub = null;
    window.setTimeout(() => this.onSignOut?.(), 250);
    return true;
  }

  private showStatus(text: string, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `profile-status${isError ? " error" : ""}`;
  }

  private refreshWalletButtons() {
    const address = getCachedStacksAddress();
    const providerId = getCachedStacksProviderId();
    if (!this.leatherWalletBtn || !this.xverseWalletBtn || !this.otherWalletBtn) return;

    const applyLabel = (
      btn: HTMLButtonElement,
      buttonProviderId: StacksWalletProviderId | undefined,
      label: string,
      disabled = false,
    ) => {
      btn.textContent = label;
      btn.disabled = disabled;
      if (buttonProviderId) {
        btn.dataset.providerId = buttonProviderId;
      } else {
        delete btn.dataset.providerId;
      }
    };

    if (!address || !providerId) {
      applyLabel(this.leatherWalletBtn, "LeatherProvider", "Leather");
      applyLabel(this.xverseWalletBtn, "XverseProviders.BitcoinProvider", "Xverse");
      applyLabel(this.otherWalletBtn, undefined, "Other Wallet");
      return;
    }

    if (providerId === "LeatherProvider") {
      applyLabel(this.leatherWalletBtn, "LeatherProvider", "Disconnect Leather");
      applyLabel(this.xverseWalletBtn, "XverseProviders.BitcoinProvider", "Switch to Xverse");
      applyLabel(this.otherWalletBtn, undefined, "Other Wallet");
      return;
    }

    if (providerId === "XverseProviders.BitcoinProvider") {
      applyLabel(this.leatherWalletBtn, "LeatherProvider", "Switch to Leather");
      applyLabel(this.xverseWalletBtn, "XverseProviders.BitcoinProvider", "Disconnect Xverse");
      applyLabel(this.otherWalletBtn, undefined, "Other Wallet");
      return;
    }

    applyLabel(this.leatherWalletBtn, "LeatherProvider", "Switch to Leather");
    applyLabel(this.xverseWalletBtn, "XverseProviders.BitcoinProvider", "Switch to Xverse");
    applyLabel(this.otherWalletBtn, providerId, `Disconnect ${formatStacksProvider(providerId)}`);
  }

  private async handleWalletAction(
    providerId: StacksWalletProviderId | undefined,
    buttons: HTMLButtonElement[],
  ) {
    const providerName = providerId ? formatStacksProvider(providerId) : "wallet";
    const cachedAddress = getCachedStacksAddress();
    const cachedProviderId = getCachedStacksProviderId();

    if (providerId && cachedAddress && cachedProviderId === providerId) {
      for (const button of buttons) {
        button.disabled = true;
      }
      this.renderWalletStatus(null, `Disconnecting ${providerName}...`);
      try {
        await disconnectStacksWallet();
        this.renderWalletStatus(null, `${providerName} disconnected.`);
        this.refreshWalletButtons();
      } catch (err: any) {
        this.renderWalletStatus(null, err?.message || `Failed to disconnect ${providerName}.`, true);
      } finally {
        for (const button of buttons) {
          button.disabled = false;
        }
      }
      return;
    }

    const installedProviders = await getInstalledStacksProviderIds();
    if (providerId && !installedProviders.includes(providerId)) {
      this.renderWalletStatus(
        null,
        `${providerName} is not detected in this browser profile. Enable or unlock that extension and try again.`,
        true,
      );
      return;
    }

    const btn =
      (providerId
        ? buttons.find((button) => button.dataset.providerId === providerId)
        : this.otherWalletBtn) ?? buttons[0];
    const originalLabel = btn.textContent || providerName;
    for (const button of buttons) {
      button.disabled = true;
    }
    btn.textContent = "Connecting...";
    this.renderWalletStatus(
      null,
      providerId
        ? `Connecting ${providerName} on Stacks testnet...`
        : "Opening wallet chooser on Stacks testnet...",
    );

    try {
      const account = await connectStacksWallet("testnet", {
        forceWalletSelect: true,
        providerId,
      });
      this.renderWalletStatus(account.address);
      this.refreshWalletButtons();
    } catch (err: any) {
      console.warn("Failed to connect wallet:", err);
      btn.textContent = originalLabel;
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
      this.renderWalletStatus(null, message, true);
    } finally {
      for (const button of buttons) {
        button.disabled = false;
      }
      this.refreshWalletButtons();
    }
  }

  private async refreshWalletDiagnostics() {
    try {
      const installedProviders = await getInstalledStacksProviderIds();
      if (getCachedStacksAddress()) return;
      if (installedProviders.length === 0) {
        this.renderWalletStatus(
          null,
          "No supported Stacks wallet extension is detected in this browser profile.",
          true,
        );
        return;
      }

      const labels = installedProviders.map((providerId) => formatStacksProvider(providerId));
      this.renderWalletStatus(
        null,
        `Detected wallets: ${labels.join(", ")}. Connect a testnet wallet before using premium x402 actions.`,
      );
    } catch (error) {
      console.warn("Failed to inspect installed wallets:", error);
    }
  }

  private renderWalletStatus(address: string | null, message?: string, isError = false) {
    if (!this.walletStatusEl) return;
    const providerId = getCachedStacksProviderId();
    this.walletStatusEl.textContent = message
      ? message
      : address
        ? `Payer wallet connected: ${formatStacksAddress(address)} via ${formatStacksProvider(providerId)}`
        : "No payer wallet connected yet. Connect a testnet wallet before using premium x402 actions.";
    this.walletStatusEl.className = `profile-wallet-status${isError ? " error" : ""}`;
  }

  // ---------------------------------------------------------------------------
  // Account info panel
  // ---------------------------------------------------------------------------

  private async showAccountInfo() {
    if (!this.accountEl) return;

    // Hide other views
    if (this.listEl) this.listEl.style.display = "none";
    if (this.formEl) this.formEl.style.display = "none";
    if (this.titleEl) this.titleEl.style.display = "none";
    if (this.subEl) this.subEl.style.display = "none";
    this.accountEl.style.display = "";
    this.accountEl.innerHTML = `<div class="profile-status">Loading account info...</div>`;

    try {
      const convex = getConvexClient();
      const info = await convex.query(api.admin.myAccountInfo, {});
      if (!info) {
        this.accountEl.innerHTML = `<div class="profile-status error">Could not load account info.</div>`;
        return;
      }

      this.accountEl.innerHTML = "";

      const h2 = document.createElement("h2");
      h2.textContent = "Account";
      this.accountEl.appendChild(h2);

      // Info rows
      const addRow = (label: string, value: string) => {
        const row = document.createElement("div");
        row.className = "account-row";
        row.innerHTML = `<span class="account-label">${label}</span><span class="account-value">${value}</span>`;
        this.accountEl!.appendChild(row);
      };

      addRow("Email", info.email || "(none)");
      addRow("Auth type", this.formatProviders(info.providers));
      addRow("Profiles", String(info.profileCount));
      if (info.createdAt) {
        addRow("Member since", new Date(info.createdAt).toLocaleDateString());
      }

      // Profiles section
      if (info.profiles.length > 0) {
        const profilesHeader = document.createElement("h3");
        profilesHeader.textContent = "Agents";
        this.accountEl.appendChild(profilesHeader);

        for (const p of info.profiles) {
          const row = document.createElement("div");
          row.className = "account-row";
          const roleTag = p.role === "superuser"
            ? ` <span class="role-badge admin">superuser</span>`
            : "";
          row.innerHTML = `<span class="account-label">${p.name}${roleTag}</span><span class="account-value">Lv ${p.level}</span>`;
          this.accountEl.appendChild(row);
        }
      }

      // Maps section
      if (info.mapsCreated.length > 0) {
        const mapsHeader = document.createElement("h3");
        mapsHeader.textContent = "Maps Created";
        this.accountEl.appendChild(mapsHeader);

        for (const m of info.mapsCreated) {
          const row = document.createElement("div");
          row.className = "account-row";
          const tags: string[] = [];
          if (m.mapType === "system") tags.push(`<span class="role-badge admin">system</span>`);
          if (m.status === "draft") tags.push(`<span class="role-badge in-use">draft</span>`);
          row.innerHTML = `<span class="account-label">${m.name} ${tags.join("")}</span><span class="account-value">${m.status}</span>`;
          this.accountEl.appendChild(row);
        }
      } else {
        const noMaps = document.createElement("div");
        noMaps.className = "account-row";
        noMaps.innerHTML = `<span class="account-label" style="color:var(--text-muted)">No maps created yet</span>`;
        this.accountEl.appendChild(noMaps);
      }

      // Back button
      const btnRow = document.createElement("div");
      btnRow.className = "profile-btn-row";
      btnRow.style.marginTop = "18px";
      const backBtn = document.createElement("button");
      backBtn.className = "profile-btn secondary";
      backBtn.textContent = "Back";
      backBtn.addEventListener("click", () => this.hideAccountInfo());
      btnRow.appendChild(backBtn);
      this.accountEl.appendChild(btnRow);
    } catch (err: any) {
      this.accountEl.innerHTML = `<div class="profile-status error">Failed to load account info.</div>`;
      console.warn("Account info error:", err);
    }
  }

  private formatProviders(providers: string[]): string {
    if (!providers || providers.length === 0) return "Unknown";
    return providers.map((p) => {
      if (p === "password") return "Email/Password";
      if (p === "github") return "GitHub";
      return p;
    }).join(", ");
  }

  private hideAccountInfo() {
    if (this.accountEl) this.accountEl.style.display = "none";
    if (this.listEl) this.listEl.style.display = "";
    if (this.titleEl) this.titleEl.style.display = "";
    if (this.subEl) this.subEl.style.display = "";
  }

  // ---------------------------------------------------------------------------
  // Superuser panel
  // ---------------------------------------------------------------------------

  private async showSuperuserPanel() {
    if (!this.superuserEl) return;
    if (!this.actingSuperuserProfileId) return;

    if (this.listEl) this.listEl.style.display = "none";
    if (this.formEl) this.formEl.style.display = "none";
    if (this.accountEl) this.accountEl.style.display = "none";
    if (this.titleEl) this.titleEl.style.display = "none";
    if (this.subEl) this.subEl.style.display = "none";
    this.superuserEl.style.display = "";
    this.superuserEl.innerHTML = `<div class="profile-status">Loading superuser panel...</div>`;

    try {
      const convex = getConvexClient();
      const superApi = (api as any).superuser;
      const data = await convex.query(superApi.dashboard, {
        profileId: this.actingSuperuserProfileId as any,
      });

      this.superuserEl.innerHTML = "";
      const h2 = document.createElement("h2");
      h2.textContent = "Superuser Panel";
      this.superuserEl.appendChild(h2);

      // Users section
      const usersHeader = document.createElement("h3");
      usersHeader.textContent = "Users & Permissions";
      this.superuserEl.appendChild(usersHeader);

      for (const u of data.users as any[]) {
        const userWrap = document.createElement("div");
        userWrap.className = "superuser-block";
        const email = u.email ?? "(no email)";
        userWrap.innerHTML = `<div class="account-row"><span class="account-label">${email}</span><span class="account-value">account</span></div>`;

        for (const p of u.profiles) {
          const row = document.createElement("div");
          row.className = "account-row";
          const roleSelect = document.createElement("select");
          roleSelect.className = "superuser-select";
          roleSelect.innerHTML = `<option value="player">player</option><option value="superuser">superuser</option>`;
          roleSelect.value = p.role;

          const saveBtn = document.createElement("button");
          saveBtn.className = "profile-btn secondary";
          saveBtn.textContent = "Save";
          saveBtn.style.padding = "4px 10px";
          saveBtn.addEventListener("click", async () => {
            saveBtn.disabled = true;
            try {
              await convex.mutation(superApi.setRole, {
                profileId: this.actingSuperuserProfileId as any,
                targetProfileId: p._id,
                role: roleSelect.value,
              });
              saveBtn.textContent = "Saved";
              setTimeout(() => (saveBtn.textContent = "Save"), 1000);
            } catch (err: any) {
              saveBtn.textContent = "Error";
              console.warn("setRole failed", err);
            } finally {
              saveBtn.disabled = false;
            }
          });

          row.innerHTML = `<span class="account-label">${p.name}</span>`;
          const right = document.createElement("span");
          right.className = "account-value";
          right.style.display = "flex";
          right.style.gap = "6px";
          right.append(roleSelect, saveBtn);
          row.appendChild(right);
          userWrap.appendChild(row);
        }

        const delRow = document.createElement("div");
        delRow.className = "profile-btn-row";
        delRow.style.marginTop = "6px";
        const delUserBtn = document.createElement("button");
        delUserBtn.className = "profile-btn danger";
        delUserBtn.style.padding = "6px 10px";
        delUserBtn.textContent = "Delete User";
        delUserBtn.addEventListener("click", async () => {
          if (!confirm(`Delete user ${email} and all their profiles?`)) return;
          delUserBtn.disabled = true;
          try {
            await convex.mutation(superApi.removeUser, {
              profileId: this.actingSuperuserProfileId as any,
              targetUserId: u._id,
            });
            await this.showSuperuserPanel();
          } catch (err) {
            console.warn("removeUser failed", err);
            delUserBtn.disabled = false;
          }
        });
        delRow.appendChild(delUserBtn);
        userWrap.appendChild(delRow);

        this.superuserEl.appendChild(userWrap);
      }

      // Maps section
      const mapsHeader = document.createElement("h3");
      mapsHeader.textContent = "Maps & Permissions";
      this.superuserEl.appendChild(mapsHeader);

      for (const m of data.maps as any[]) {
        const block = document.createElement("div");
        block.className = "superuser-block";
        block.innerHTML = `<div class="account-row"><span class="account-label">${m.name}${m.mapType === "system" ? ' <span class="role-badge admin">system</span>' : ""}</span><span class="account-value">${m.status}</span></div>`;

        // Map type selector
        const typeRow = document.createElement("div");
        typeRow.className = "account-row";
        typeRow.innerHTML = `<span class="account-label">Type</span>`;
        const typeRight = document.createElement("span");
        typeRight.className = "account-value";
        typeRight.style.display = "flex";
        typeRight.style.gap = "6px";
        const typeSelect = document.createElement("select");
        typeSelect.className = "superuser-select";
        typeSelect.innerHTML = `<option value="private">private</option><option value="public">public</option><option value="system">system</option>`;
        typeSelect.value = m.mapType ?? "private";
        const saveTypeBtn = document.createElement("button");
        saveTypeBtn.className = "profile-btn secondary";
        saveTypeBtn.textContent = "Save";
        saveTypeBtn.style.padding = "4px 10px";
        saveTypeBtn.addEventListener("click", async () => {
          saveTypeBtn.disabled = true;
          try {
            await convex.mutation(superApi.setMapType, {
              profileId: this.actingSuperuserProfileId as any,
              mapName: m.name,
              mapType: typeSelect.value,
            });
            saveTypeBtn.textContent = "Saved";
            setTimeout(() => (saveTypeBtn.textContent = "Save"), 1000);
          } catch (err: any) {
            saveTypeBtn.textContent = "Error";
            console.warn("setMapType failed", err);
          } finally {
            saveTypeBtn.disabled = false;
          }
        });
        typeRight.append(typeSelect, saveTypeBtn);
        typeRow.appendChild(typeRight);
        block.appendChild(typeRow);

        const editorsInput = document.createElement("input");
        editorsInput.className = "superuser-input";
        editorsInput.placeholder = "Editors: email:name, email:name";
        editorsInput.value = (m.editors as any[]).map((e) => e.label).join(", ");
        block.appendChild(editorsInput);

        const row = document.createElement("div");
        row.className = "profile-btn-row";
        row.style.marginTop = "8px";

        const saveEditorsBtn = document.createElement("button");
        saveEditorsBtn.className = "profile-btn secondary";
        saveEditorsBtn.style.padding = "6px 10px";
        saveEditorsBtn.textContent = "Save Editors";
        saveEditorsBtn.addEventListener("click", async () => {
          const specs = editorsInput.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const idx = s.lastIndexOf(":");
              if (idx < 1) return null;
              return { email: s.slice(0, idx), name: s.slice(idx + 1) };
            })
            .filter((x): x is { email: string; name: string } => !!x && !!x.email && !!x.name);

          saveEditorsBtn.disabled = true;
          try {
            await convex.mutation(superApi.setMapEditors, {
              profileId: this.actingSuperuserProfileId as any,
              mapName: m.name,
              editorSpecs: specs,
            });
            saveEditorsBtn.textContent = "Saved";
            setTimeout(() => (saveEditorsBtn.textContent = "Save Editors"), 1000);
          } catch (err) {
            console.warn("setMapEditors failed", err);
            saveEditorsBtn.textContent = "Error";
          } finally {
            saveEditorsBtn.disabled = false;
          }
        });

        const delMapBtn = document.createElement("button");
        delMapBtn.className = "profile-btn danger";
        delMapBtn.style.padding = "6px 10px";
        delMapBtn.textContent = "Delete Map";
        delMapBtn.addEventListener("click", async () => {
          if (!confirm(`Delete map "${m.name}" and all map data?`)) return;
          delMapBtn.disabled = true;
          try {
            await convex.mutation(superApi.removeMap, {
              profileId: this.actingSuperuserProfileId as any,
              name: m.name,
            });
            await this.showSuperuserPanel();
          } catch (err) {
            console.warn("removeMap failed", err);
            delMapBtn.disabled = false;
          }
        });

        row.append(saveEditorsBtn, delMapBtn);
        block.appendChild(row);
        this.superuserEl.appendChild(block);
      }

      const backRow = document.createElement("div");
      backRow.className = "profile-btn-row";
      const backBtn = document.createElement("button");
      backBtn.className = "profile-btn secondary";
      backBtn.textContent = "Back";
      backBtn.addEventListener("click", () => this.hideSuperuserPanel());
      backRow.appendChild(backBtn);
      this.superuserEl.appendChild(backRow);
    } catch (err) {
      this.superuserEl.innerHTML = `<div class="profile-status error">Failed to load superuser panel.</div>`;
      console.warn("superuser panel error:", err);
    }
  }

  private toggleSuperuserPanel() {
    if (!this.superuserEl) return;
    if (this.superuserEl.style.display === "none") {
      this.showSuperuserPanel();
      return;
    }
    this.hideSuperuserPanel();
  }

  private hideSuperuserPanel() {
    if (this.superuserEl) this.superuserEl.style.display = "none";
    if (this.listEl) this.listEl.style.display = "";
    if (this.titleEl) this.titleEl.style.display = "";
    if (this.subEl) this.subEl.style.display = "";
  }

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------

  private async handleSignOut() {
    try {
      const { getAuthManager } = await import("../lib/convexClient.ts");
      const auth = getAuthManager();
      await auth.signOut();
    } catch (err) {
      console.warn("Sign-out error:", err);
    }
    this.profilesUnsub?.();
    this.profilesUnsub = null;
    this.onSignOut?.();
  }

  private startSoundtrack() {
    if (typeof window === "undefined") return;
    if (this.soundtrackAudio) {
      void this.playSoundtrack();
      return;
    }

    const audio = new Audio(
      (import.meta.env.VITE_PROFILE_SOUNDTRACK_URL as string | undefined) ||
      DEFAULT_PROFILE_SOUNDTRACK_URL,
    );
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.42;
    this.soundtrackAudio = audio;

    document.addEventListener("pointerdown", this.handleSoundtrackGesture);
    void this.playSoundtrack();
  }

  private async playSoundtrack() {
    if (!this.soundtrackAudio || !this.soundtrackEnabled) return;
    try {
      await this.soundtrackAudio.play();
      this.soundtrackNeedsGesture = false;
    } catch {
      this.soundtrackNeedsGesture = true;
    }
    this.renderSoundtrackStatus();
  }

  private toggleSoundtrack() {
    this.soundtrackEnabled = !this.soundtrackEnabled;
    if (!this.soundtrackAudio) {
      if (this.soundtrackEnabled) this.startSoundtrack();
      this.renderSoundtrackStatus();
      return;
    }

    if (this.soundtrackEnabled) {
      void this.playSoundtrack();
    } else {
      this.soundtrackAudio.pause();
      this.soundtrackNeedsGesture = false;
      this.renderSoundtrackStatus();
    }
  }

  private renderSoundtrackStatus() {
    if (this.soundtrackStatusEl) {
      let detail = `${DEFAULT_PROFILE_SOUNDTRACK_TITLE} · ${DEFAULT_PROFILE_SOUNDTRACK_ARTIST}`;
      if (!this.soundtrackEnabled) {
        detail = `${detail} · muted`;
      } else if (this.soundtrackNeedsGesture) {
        detail = `${detail} · tap anywhere for sound`;
      }
      this.soundtrackStatusEl.textContent = detail;
    }

    if (this.soundtrackCreditEl) {
      this.soundtrackCreditEl.textContent =
        `Cozy Cabin theme: ${COZY_CABIN_THEME_TITLE} · ${COZY_CABIN_THEME_ARTIST}`;
    }

    if (this.soundtrackToggleBtn) {
      if (!this.soundtrackEnabled) {
        this.soundtrackToggleBtn.textContent = "Sound Off";
      } else if (this.soundtrackNeedsGesture) {
        this.soundtrackToggleBtn.textContent = "Tap for Sound";
      } else {
        this.soundtrackToggleBtn.textContent = "Sound On";
      }
    }
  }

  destroy() {
    this.profilesUnsub?.();
    this.profilesUnsub = null;
    document.removeEventListener("pointerdown", this.handleSoundtrackGesture);
    if (this.soundtrackAudio) {
      this.soundtrackAudio.pause();
      this.soundtrackAudio.src = "";
      this.soundtrackAudio.load();
      this.soundtrackAudio = null;
    }
    this.el.remove();
  }
}
