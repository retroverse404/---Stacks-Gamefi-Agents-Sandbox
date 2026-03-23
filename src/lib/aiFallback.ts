export function isMissingBraintrustConfig(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as any).message)
      : typeof error === "string"
        ? error
        : "";

  return message.includes("BRAINTRUST_API_KEY not configured");
}

export function getLocalAiFallbackLine(agentName: string) {
  switch (agentName) {
    case "guide.btc":
      return "Local AI briefing is offline. Using authored guide context instead.";
    case "market.btc":
      return "Local AI market briefing is offline. Using the live ticker surface instead.";
    case "quests.btc":
      return "Local AI quest assistant is offline. Use the cached opportunity panels above.";
    case "Mel":
      return "Local AI curator is offline right now. The authored world context is still available.";
    default:
      return "Local AI is offline right now. Fallback content is still available.";
  }
}
