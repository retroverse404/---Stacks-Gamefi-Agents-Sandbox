export interface GuideTopic {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  userPrompt: string;
  authoredContext: string;
  sourceLabel: string;
  fallbackAnswer: string;
}

export const GUIDE_BTC_TOPICS: GuideTopic[] = [
  {
    id: "stacks-basics",
    label: "Stacks basics",
    eyebrow: "Learn",
    description: "What Stacks is, why it matters for Bitcoin builders, and how this world fits in.",
    userPrompt: "Teach me the basics of Stacks in plain language for a builder entering this world.",
    authoredContext:
      "Author notes: explain Stacks as a Bitcoin layer for smart contracts and apps. Keep it plain-language. Mention that stacks2d is a playable interface to ecosystem knowledge, not the ecosystem itself.",
    sourceLabel: "Source pack: official Stacks docs",
    fallbackAnswer:
      "Stacks is a Bitcoin layer for smart contracts and apps. In this world, guide.btc is a playable interface to that ecosystem rather than the ecosystem itself. The practical next step here is to explore the other agents, open the market and quests surfaces, and then test one wallet-backed action.",
  },
  {
    id: "sbtc-yield",
    label: "sBTC and yield",
    eyebrow: "Learn",
    description: "A careful explanation of sBTC, Dual Stacking, yield, and risk boundaries.",
    userPrompt: "Explain sBTC, Dual Stacking, and yield on Stacks in practical educational terms.",
    authoredContext:
      "Author notes: explain sBTC as a 1:1 programmable BTC representation on Stacks. Explain Dual Stacking as described by Stacks docs, and explicitly avoid promising returns or quoting live rates. Clarify that yield depends on protocols and risk.",
    sourceLabel: "Source pack: Stacks sBTC and Dual Stacking docs",
    fallbackAnswer:
      "sBTC is designed as a 1:1 programmable BTC representation on Stacks, and Dual Stacking is described in the Stacks docs as a BTC-denominated rewards mechanism involving stacked STX and sBTC. Yield depends on protocol design and risk, so the safe move here is to treat this as an educational surface rather than a promise of returns.",
  },
  {
    id: "agents",
    label: "Agents and skills",
    eyebrow: "Build",
    description: "How AIBTC-style agents, skills, identity, and paid actions fit this world.",
    userPrompt: "Explain how AIBTC-style agents, agent lookup, identity, and paid actions can fit into this world.",
    authoredContext:
      "Author notes: describe agents as modular service actors. Mention wallet, identity, reputation, validation, x402, and agent-lookup as AIBTC patterns. Be explicit that most of this is future-facing in stacks2d today.",
    sourceLabel: "Source pack: AIBTC docs and skills repo",
    fallbackAnswer:
      "AIBTC-style agents fit this world as modular service actors with identity, wallet capability, validation, and paid actions. In stacks2d today, the direction is visible in the architecture and payment surfaces, while the fuller autonomous agent model is still being expanded.",
  },
  {
    id: "ecosystem",
    label: "Opportunities",
    eyebrow: "Explore",
    description: "What the current Stacks opportunity surface looks like through cached Zero Authority data.",
    userPrompt: "Give a concise overview of what kinds of opportunities and ecosystem activity this world will surface for Stacks builders.",
    authoredContext:
      "Author notes: ground the response in cached Zero Authority categories such as users, bounties, grants, quests, gigs, and services. Mention Zero Authority directly. Do not imply every category is fully rendered in the game UI yet.",
    sourceLabel: "Source pack: Zero Authority API cache",
    fallbackAnswer:
      "This world is meant to surface ecosystem opportunities through Zero Authority categories like users, bounties, grants, quests, gigs, and services. Not every category is fully rendered in the in-world UI yet, but quests.btc and guide.btc are the current entry points for that direction.",
  },
  {
    id: "news",
    label: "News and signals",
    eyebrow: "Pulse",
    description: "A careful ecosystem pulse using sourced context, without pretending there is a live newsroom.",
    userPrompt:
      "Give a concise ecosystem news-style briefing for Stacks builders. Use cached ecosystem context when available. If live news is not connected yet, say that clearly and explain what kinds of feeds this world will eventually summarize.",
    authoredContext:
      "Author notes: be explicit about what is live now versus planned. Mention that Zero Authority is live in the backend. Mention that richer news and analytics layers such as Tenero or future AIBTC feeds are not yet live in the in-world experience.",
    sourceLabel: "Source pack: Zero Authority live cache + authored roadmap",
    fallbackAnswer:
      "The live news-style layer is still partial. Zero Authority is connected in the backend as the ecosystem context source, and Tenero is the stronger live market feed right now. The next useful step in this world is to open market.btc for token context or quests.btc for opportunity surfaces.",
  },
];

export const GUIDE_BTC_BRIEFING_INTRO = `Briefings on Stacks, sBTC, agents, ecosystem opportunities, and news. Sourced from Zero Authority data and authored context.\n\nSelect a topic.`;

export const GUIDE_BTC_VERIFIED_CONTEXT = `
You are guide.btc, speaking inside stacks2d, a playable 2D world for the Stacks ecosystem.

Only use verified notes and cached ecosystem data provided in the prompt.
Do not invent live prices, yields, token metrics, protocol states, or payment status.
If a question asks for live data that is not present, say so plainly.

Verified notes:
- Stacks is a Bitcoin layer for smart contracts and applications.
- sBTC is a 1:1 programmable representation of BTC on Stacks and is designed to unlock Bitcoin use in smart contracts and DeFi.
- Official Stacks docs describe Dual Stacking as a BTC-denominated rewards mechanism on Stacks involving stacked STX and sBTC.
- AIBTC provides an agent and skills model including wallet, identity, reputation, validation, x402, and agent-lookup capabilities.
- Zero Authority provides ecosystem data categories such as users, bounties, grants, quests, gigs, and services.
- News and analytics should be treated as sourced summaries, not invented live facts.
- x402 on Stacks is relevant as a future payment rail for paid actions and services.

Response rules:
- Be concise, practical, and calm.
- Teach without hype.
- Do not give financial advice.
- Mention when something in stacks2d is planned rather than already live.
- Prefer concrete language over generic AI assistant phrasing.
- End with one useful next step the player can take in this world.
- No markdown formatting. No bold asterisks, no headers, no bullet points with dashes or asterisks. Plain prose only. Short paragraphs separated by blank lines.
`.trim();
