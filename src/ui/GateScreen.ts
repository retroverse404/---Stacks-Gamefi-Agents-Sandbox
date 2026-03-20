import {
  getGateSessionDurationMs,
  getInviteCodeFromUrl,
  markGateUnlocked,
  stripInviteCodeFromUrl,
  validateInviteCode,
} from "../lib/gateAccess.ts";
import "./GateScreen.css";

const DEFAULT_PLACEHOLDER_COPY =
  "A hosted dungeon lobby for evaluating agentic world simulation, Stacks auth, wallet-connected premium actions, and x402 transaction flows.";

function getGateImageUrl() {
  const url = import.meta.env.VITE_GATE_IMAGE_URL as string | undefined;
  return url?.trim() || "";
}

export class GateScreen {
  readonly el: HTMLElement;
  private statusEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private onUnlocked: () => void;

  constructor(onUnlocked: () => void) {
    this.onUnlocked = onUnlocked;

    this.el = document.createElement("div");
    this.el.className = "gate-screen";

    const shell = document.createElement("div");
    shell.className = "gate-shell";
    this.el.appendChild(shell);

    const copy = document.createElement("section");
    copy.className = "gate-copy";
    shell.appendChild(copy);

    const copyInner = document.createElement("div");
    copyInner.className = "gate-copy-inner";
    copy.appendChild(copyInner);

    const eyebrow = document.createElement("div");
    eyebrow.className = "gate-eyebrow";
    eyebrow.textContent = "Invite Access";
    copyInner.appendChild(eyebrow);

    const title = document.createElement("h1");
    title.innerHTML = `Enter <span>Stackshub</span>`;
    copyInner.appendChild(title);

    const lede = document.createElement("p");
    lede.className = "gate-lede";
    lede.textContent =
      "This hosted build is gated for live evaluation sessions. Enter the invite code to access the auth lobby and world entry flow.";
    copyInner.appendChild(lede);

    const notes = document.createElement("div");
    notes.className = "gate-notes";
    notes.innerHTML = `
      <div>Hosted access is intentionally controlled during the judging window.</div>
      <div>After unlock, you will continue into the Stackshub sign-in and wallet screen.</div>
      <div>If you need a code, request one directly from the project owner.</div>
    `;
    copyInner.appendChild(notes);

    const card = document.createElement("div");
    card.className = "gate-card";
    copyInner.appendChild(card);

    const label = document.createElement("div");
    label.className = "gate-card-label";
    label.textContent = "Invite code";
    card.appendChild(label);

    const hint = document.createElement("div");
    hint.className = "gate-card-hint";
    hint.textContent = `Use the access code provided for a live review session. Access stays active for ${Math.round(getGateSessionDurationMs() / 60000)} minutes.`;
    card.appendChild(hint);

    const form = document.createElement("div");
    form.className = "gate-form";
    card.appendChild(form);

    this.inputEl = document.createElement("input");
    this.inputEl.className = "gate-input";
    this.inputEl.type = "password";
    this.inputEl.placeholder = "Enter invite code";
    this.inputEl.autocomplete = "off";
    form.appendChild(this.inputEl);

    const actions = document.createElement("div");
    actions.className = "gate-actions";
    form.appendChild(actions);

    const enterBtn = document.createElement("button");
    enterBtn.className = "gate-btn primary";
    enterBtn.textContent = "Unlock access";
    enterBtn.addEventListener("click", () => this.tryUnlock());
    actions.appendChild(enterBtn);

    const clearBtn = document.createElement("button");
    clearBtn.className = "gate-btn secondary";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      this.inputEl.value = "";
      this.showStatus("");
      this.inputEl.focus();
    });
    actions.appendChild(clearBtn);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "gate-status";
    form.appendChild(this.statusEl);

    const footnote = document.createElement("div");
    footnote.className = "gate-footnote";
    footnote.textContent =
      "This invite screen is a hosted access checkpoint. It is not a substitute for server-side access control.";
    card.appendChild(footnote);

    const visual = document.createElement("section");
    visual.className = "gate-visual";
    shell.appendChild(visual);

    const frame = document.createElement("div");
    frame.className = "gate-visual-frame";
    visual.appendChild(frame);

    const imageUrl = getGateImageUrl();
    if (imageUrl) {
      frame.classList.add("has-image");
      const image = document.createElement("img");
      image.className = "gate-visual-image";
      image.src = imageUrl;
      image.alt = "Stackshub gate artwork";
      frame.appendChild(image);
    }

    const overlay = document.createElement("div");
    overlay.className = "gate-visual-overlay";
    frame.appendChild(overlay);

    const placeholder = document.createElement("div");
    placeholder.className = "gate-placeholder";
    placeholder.innerHTML = `
      <div class="gate-placeholder-badge">Live review checkpoint</div>
      <div class="gate-placeholder-copy">
        <h2>Dungeons & Agents</h2>
        <p>${DEFAULT_PLACEHOLDER_COPY}</p>
      </div>
      <div class="gate-grid" aria-hidden="true"></div>
    `;
    frame.appendChild(placeholder);

    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.tryUnlock();
      }
    });

    const inviteFromUrl = getInviteCodeFromUrl();
    if (inviteFromUrl) {
      this.inputEl.value = inviteFromUrl;
      queueMicrotask(() => this.tryUnlock(true));
    }
  }

  destroy() {
    this.el.remove();
  }

  private tryUnlock(fromQuery = false) {
    const candidate = this.inputEl.value;
    if (!validateInviteCode(candidate)) {
      this.showStatus("Invite code not recognized.", true);
      if (!fromQuery) this.inputEl.select();
      return;
    }

    markGateUnlocked();
    stripInviteCodeFromUrl();
    this.showStatus("Access granted. Opening Stackshub...", false, true);
    window.setTimeout(() => this.onUnlocked(), 180);
  }

  private showStatus(message: string, isError = false, isSuccess = false) {
    this.statusEl.textContent = message;
    this.statusEl.className = `gate-status${isError ? " error" : ""}${isSuccess ? " success" : ""}`;
  }
}
