import "./QuestsNpcSplash.css";
import { getConvexClient } from "../../lib/convexClient.ts";
import { api } from "../../../convex/_generated/api";
import { getLocalAiFallbackLine, isMissingBraintrustConfig } from "../../lib/aiFallback.ts";

const QUESTS_SYSTEM_PROMPT =
  "You are quests.btc, a Stacks ecosystem agent who surfaces grants, bounties, and community quests. " +
  "You are concise, helpful, and focused on actionable opportunities. " +
  "When asked about a topic, briefly describe relevant opportunities, funding sources, or next steps. " +
  "Keep responses under 120 words.";
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";

export interface QuestsNpcSplashProps extends SplashScreenCallbacks {
  npcName: string;
}

type OpportunityRow = {
  title?: string;
  summary?: string;
  rewardAmount?: string;
  rewardUnit?: string;
  organizationName?: string;
};

type GuideSnapshotPayload = {
  bounties?: OpportunityRow[];
  grants?: OpportunityRow[];
  quests?: OpportunityRow[];
  syncLog?: Array<{ syncedAt?: number }>;
};

export function createQuestsNpcSplash(props: QuestsNpcSplashProps): SplashScreen {
  const { npcName, onClose } = props;
  const requestClose = () => onClose();
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
    }
  };
  window.addEventListener("keydown", handleKeydown);

  const el = document.createElement("div");
  el.className = "qns-overlay";
  el.addEventListener("click", (event) => {
    if (event.target === el) requestClose();
  });

  const card = document.createElement("div");
  card.className = "qns-card";
  card.addEventListener("click", (event) => event.stopPropagation());
  el.appendChild(card);

  const header = document.createElement("div");
  header.className = "qns-header";
  card.appendChild(header);

  const headingWrap = document.createElement("div");
  headingWrap.className = "qns-heading-wrap";
  header.appendChild(headingWrap);

  const eyebrow = document.createElement("div");
  eyebrow.className = "qns-eyebrow";
  eyebrow.textContent = "Opportunity surface";
  headingWrap.appendChild(eyebrow);

  const title = document.createElement("h2");
  title.className = "qns-title";
  title.textContent = npcName;
  headingWrap.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.className = "qns-subtitle";
  subtitle.textContent = "Zero Authority-backed grants, bounties, and quests";
  headingWrap.appendChild(subtitle);

  const closeBtn = document.createElement("button");
  closeBtn.className = "qns-close";
  closeBtn.textContent = "Close ×";
  closeBtn.addEventListener("click", () => requestClose());
  header.appendChild(closeBtn);

  const summary = document.createElement("div");
  summary.className = "qns-summary";
  card.appendChild(summary);

  const sourcePill = document.createElement("div");
  sourcePill.className = "qns-summary-card";
  sourcePill.textContent = "Loading opportunity source…";
  summary.appendChild(sourcePill);

  const syncPill = document.createElement("div");
  syncPill.className = "qns-summary-card";
  syncPill.textContent = "Waiting for cached snapshot…";
  summary.appendChild(syncPill);

  const lead = document.createElement("p");
  lead.className = "qns-lead";
  lead.textContent =
    "quests.btc curates live ecosystem opportunity surfaces so the world can expose real work, funding, and discovery paths.";
  card.appendChild(lead);

  const sections = document.createElement("div");
  sections.className = "qns-sections";
  card.appendChild(sections);

  const bountySection = buildSection("Bounties");
  const grantSection = buildSection("Grants");
  const questSection = buildSection("Quests");
  sections.append(bountySection.section, grantSection.section, questSection.section);

  const footer = document.createElement("div");
  footer.className = "qns-footer";
  footer.textContent = "Snapshots are cached from Zero Authority. Open items in the world feed remain offchain until a payment or proof path is added.";
  card.appendChild(footer);

  const convex = getConvexClient();
  const zeroAuthorityApi: any = (api as any)["integrations/zeroAuthority"];
  let unsub: (() => void) | null = null;

  function renderItems(target: HTMLElement, items: OpportunityRow[] | undefined) {
    target.replaceChildren();
    const safeItems = Array.isArray(items) ? items : [];
    if (safeItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "qns-empty";
      empty.textContent = "No cached entries yet.";
      target.appendChild(empty);
      return;
    }

    for (const item of safeItems.slice(0, 4)) {
      const row = document.createElement("div");
      row.className = "qns-row";

      const titleEl = document.createElement("div");
      titleEl.className = "qns-row-title";
      titleEl.textContent = item.title || "Untitled opportunity";

      const meta = document.createElement("div");
      meta.className = "qns-row-meta";
      const rewardBits = [item.rewardAmount, item.rewardUnit].filter(Boolean).join(" ");
      meta.textContent = [item.organizationName, rewardBits].filter(Boolean).join(" • ") || "Ecosystem opportunity";

      const summaryEl = document.createElement("div");
      summaryEl.className = "qns-row-summary";
      summaryEl.textContent = item.summary || "No summary available.";

      row.append(titleEl, meta, summaryEl);
      target.appendChild(row);
    }
  }

  function renderSnapshot(payload: GuideSnapshotPayload) {
    sourcePill.textContent = "Live source: Zero Authority cache";
    const lastSync = Array.isArray(payload.syncLog)
      ? payload.syncLog.find((entry) => typeof entry?.syncedAt === "number")?.syncedAt
      : undefined;
    syncPill.textContent = lastSync
      ? `Snapshot: ${new Date(lastSync).toLocaleString()}`
      : "Snapshot unavailable";

    renderItems(bountySection.body, payload.bounties);
    renderItems(grantSection.body, payload.grants);
    renderItems(questSection.body, payload.quests);
  }

  if (zeroAuthorityApi?.guideSnapshot) {
    unsub = convex.onUpdate(zeroAuthorityApi.guideSnapshot, {}, (payload: any) => {
      renderSnapshot((payload ?? {}) as GuideSnapshotPayload);
    });
  } else {
    renderSnapshot({});
  }

  // --- AI ask section ---
  const askDivider = document.createElement("hr");
  askDivider.className = "qns-divider";
  card.appendChild(askDivider);

  const askSection = document.createElement("div");
  askSection.className = "qns-ask-section";
  card.appendChild(askSection);

  const askLabel = document.createElement("div");
  askLabel.className = "qns-ask-label";
  askLabel.textContent = "Ask quests.btc directly";
  askSection.appendChild(askLabel);

  const askRow = document.createElement("div");
  askRow.className = "qns-ask-row";
  askSection.appendChild(askRow);

  const askInput = document.createElement("input");
  askInput.className = "qns-ask-input";
  askInput.type = "text";
  askInput.placeholder = "e.g. any Clarity grants open right now?";
  askRow.appendChild(askInput);

  const askBtn = document.createElement("button");
  askBtn.className = "qns-ask-btn";
  askBtn.textContent = "Ask";
  askRow.appendChild(askBtn);

  const askResponse = document.createElement("div");
  askResponse.className = "qns-ask-response";
  askSection.appendChild(askResponse);

  let aiPending = false;

  const runAsk = async () => {
    const question = askInput.value.trim();
    if (!question || aiPending) return;
    aiPending = true;
    askBtn.disabled = true;
    askResponse.textContent = "quests.btc is searching…";
    askResponse.classList.add("is-loading");
    try {
      const text = await convex.action((api as any)["story/storyAi"].generateDialogue, {
        agentId: "quests-btc",
        systemPrompt: QUESTS_SYSTEM_PROMPT,
        userMessage: question,
        conversationHistory: [],
      });
      askResponse.textContent =
        typeof text === "string" && text.trim().length > 0
          ? text.trim()
          : "No response available right now.";
    } catch (err: any) {
      askResponse.textContent = isMissingBraintrustConfig(err)
        ? getLocalAiFallbackLine("quests.btc")
        : "The quests.btc AI path is unavailable right now.";
      console.warn("[QuestsNpcSplash] AI ask failed", err);
    } finally {
      askResponse.classList.remove("is-loading");
      aiPending = false;
      askBtn.disabled = false;
    }
  };

  askBtn.addEventListener("click", () => void runAsk());
  askInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      void runAsk();
    }
  });

  return {
    el,
    destroy() {
      unsub?.();
      window.removeEventListener("keydown", handleKeydown);
      el.remove();
    },
  };
}

function buildSection(label: string) {
  const section = document.createElement("section");
  section.className = "qns-section";

  const heading = document.createElement("h3");
  heading.className = "qns-section-title";
  heading.textContent = label;
  section.appendChild(heading);

  const body = document.createElement("div");
  body.className = "qns-section-body";
  section.appendChild(body);

  return { section, body };
}
