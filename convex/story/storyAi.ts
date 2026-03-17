import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";

// Braintrust AI Proxy for LLM-assisted narrative generation
// Uses the Braintrust proxy endpoint for chat completions

function getBraintrustConfig() {
  const env = (globalThis as any)?.process?.env ?? {};
  const apiKey = env.BRAINTRUST_API_KEY as string | undefined;
  const configuredModel = (env.BRAINTRUST_MODEL as string | undefined) || "gemini-2.5-flash";
  const allowedModels = String(
    env.BRAINTRUST_ALLOWED_MODELS ??
      "gpt-4.1-mini,gpt-4.1,gemini-2.5-flash,gemini-2.5-pro",
  )
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
  const model = allowedModels.includes(configuredModel)
    ? configuredModel
    : allowedModels[0] ?? "gemini-2.5-flash";
  const maxHistoryMessages = Number(env.BRAINTRUST_MAX_HISTORY_MESSAGES ?? 8);
  const maxInputChars = Number(env.BRAINTRUST_MAX_INPUT_CHARS ?? 1200);
  const maxOutputTokens = Number(env.BRAINTRUST_MAX_OUTPUT_TOKENS ?? 360);

  if (!apiKey) throw new Error("BRAINTRUST_API_KEY not configured");

  return {
    apiKey,
    model,
    maxHistoryMessages: Number.isFinite(maxHistoryMessages) ? maxHistoryMessages : 8,
    maxInputChars: Number.isFinite(maxInputChars) ? maxInputChars : 1200,
    maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 360,
  };
}

function trimText(input: string, maxChars: number) {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function sanitizeConversationHistory(
  conversationHistory: any[] | undefined,
  maxHistoryMessages: number,
  maxInputChars: number,
) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return [];
  }

  return conversationHistory.slice(-maxHistoryMessages).map((message) => ({
    role: message?.role === "assistant" ? "assistant" : "user",
    content: trimText(String(message?.content ?? ""), maxInputChars),
  }));
}

export const generateDialogue = action({
  args: {
    agentId: v.optional(v.string()),
    systemPrompt: v.string(),
    userMessage: v.string(),
    conversationHistory: v.optional(v.any()),
  },
  handler: async (ctx, { agentId, systemPrompt, userMessage, conversationHistory }) => {
    const { apiKey, model, maxHistoryMessages, maxInputChars, maxOutputTokens } =
      getBraintrustConfig();

    if (agentId) {
      await ctx.runMutation((api as any)["agents/runtime"].registerAiCall, {
        agentId,
        reason: "generate-dialogue",
      });
    }

    const messages: any[] = [
      { role: "system", content: trimText(systemPrompt, maxInputChars * 2) },
    ];

    messages.push(
      ...sanitizeConversationHistory(
        conversationHistory as any[] | undefined,
        maxHistoryMessages,
        maxInputChars,
      ),
    );
    messages.push({ role: "user", content: trimText(userMessage, maxInputChars) });

    const response = await fetch(
      "https://api.braintrust.dev/v1/proxy/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: Math.max(64, Math.min(maxOutputTokens, 600)),
        }),
      }
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Braintrust API error: ${response.status} ${details}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  },
});

export const expandNarrative = action({
  args: {
    prompt: v.string(),
    context: v.optional(v.string()),
    type: v.union(
      v.literal("quest"),
      v.literal("dialogue"),
      v.literal("lore"),
      v.literal("backstory")
    ),
  },
  handler: async (_ctx, { prompt, context, type }) => {
    const { apiKey, model, maxInputChars, maxOutputTokens } = getBraintrustConfig();

    const systemPrompts: Record<string, string> = {
      quest:
        "You are a game narrative designer. Expand the following quest outline into detailed quest steps with conditions and dialogue. Output valid JSON.",
      dialogue:
        "You are a game narrative designer. Create dialogue tree nodes from the given outline. Each node should have an id, text, and optional responses array. Output valid JSON.",
      lore: "You are a world-builder for a 2D RPG. Write rich lore entries based on the keywords provided. Keep entries concise (2-3 paragraphs).",
      backstory:
        "You are a character writer for a 2D RPG. Flesh out the NPC backstory from the bullet points provided. Keep it concise but evocative.",
    };

    const messages = [
      { role: "system", content: systemPrompts[type] },
      ...(context ? [{ role: "user", content: `Context: ${trimText(context, maxInputChars)}` }] : []),
      { role: "user", content: trimText(prompt, maxInputChars) },
    ];

    const response = await fetch(
      "https://api.braintrust.dev/v1/proxy/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: Math.max(160, Math.min(maxOutputTokens * 2, 900)),
        }),
      }
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Braintrust API error: ${response.status} ${details}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  },
});
