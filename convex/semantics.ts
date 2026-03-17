import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const getMapSemantics = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    const [zones, objects, roles] = await Promise.all([
      ctx.db
        .query("worldZones")
        .withIndex("by_map", (q) => q.eq("mapName", mapName))
        .collect(),
      ctx.db
        .query("semanticObjects")
        .withIndex("by_map", (q) => q.eq("mapName", mapName))
        .collect(),
      ctx.db
        .query("npcRoleAssignments")
        .withIndex("by_map_roleKey", (q) => q.eq("mapName", mapName))
        .collect(),
    ]);

    return { zones, objects, roles };
  },
});

export const listZones = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    return await ctx.db
      .query("worldZones")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
  },
});

export const listObjects = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    return await ctx.db
      .query("semanticObjects")
      .withIndex("by_map", (q) => q.eq("mapName", mapName))
      .collect();
  },
});

export const listInteractionSurfaces = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    const [objects, offers] = await Promise.all([
      ctx.db
        .query("semanticObjects")
        .withIndex("by_map", (q) => q.eq("mapName", mapName))
        .collect(),
      ctx.db.query("premiumContentOffers").collect(),
    ]);

    const offersByKey = new Map(offers.map((offer) => [offer.offerKey, offer]));

    return objects.map((object) => {
      const meta = parseJsonObject(object.metadataJson);
      const offerKey =
        object.premiumOfferKey ??
        (typeof meta.premiumOfferKey === "string" ? meta.premiumOfferKey : null) ??
        null;
      const offer = offerKey ? offersByKey.get(offerKey) ?? null : null;
      const offerMeta = parseJsonObject(offer?.metadataJson);

      return {
        objectKey: object.objectKey,
        label: object.label,
        objectType: object.objectType,
        zoneKey: object.zoneKey ?? null,
        linkedAgentId: object.linkedAgentId ?? null,
        triggerType:
          object.triggerType ??
          (typeof meta.trigger === "string" ? meta.trigger : null) ??
          null,
        freeActions:
          object.freeActions ??
          (Array.isArray(meta.freeActions) ? (meta.freeActions as string[]) : []),
        paidActions:
          object.paidActions ??
          (Array.isArray(meta.paidActions) ? (meta.paidActions as string[]) : []),
        premiumOfferKey: offerKey,
        interactionPrompt:
          object.interactionPrompt ??
          (typeof meta.interactionPrompt === "string" ? meta.interactionPrompt : null) ??
          null,
        interactionSummary:
          object.interactionSummary ??
          (typeof meta.interactionSummary === "string" ? meta.interactionSummary : null) ??
          null,
        inspectEventType:
          object.inspectEventType ??
          (meta.eventBindings && typeof meta.eventBindings === "object" && typeof (meta.eventBindings as any).inspect === "string"
            ? (meta.eventBindings as any).inspect
            : null) ??
          null,
        interactEventType:
          object.interactEventType ??
          (meta.eventBindings && typeof meta.eventBindings === "object" && typeof (meta.eventBindings as any).interact === "string"
            ? (meta.eventBindings as any).interact
            : null) ??
          null,
        paidEventType:
          object.paidEventType ??
          (meta.eventBindings && typeof meta.eventBindings === "object" && typeof (meta.eventBindings as any).paid === "string"
            ? (meta.eventBindings as any).paid
            : null) ??
          null,
        roomLabel:
          object.roomLabel ??
          (typeof meta.roomLabel === "string" ? meta.roomLabel : null) ??
          null,
        itemDefName:
          object.itemDefName ??
          (typeof meta.itemDefName === "string" ? meta.itemDefName : null) ??
          null,
        offer: offer
          ? {
              offerKey: offer.offerKey,
              agentId: offer.agentId,
              provider: offer.provider,
              priceAsset: offer.priceAsset,
              priceAmount: offer.priceAmount,
              endpointPath: offer.endpointPath ?? null,
              sourceType:
                offer.sourceType ??
                (typeof offerMeta.sourceType === "string" ? offerMeta.sourceType : null) ??
                null,
              deliveryType:
                offer.deliveryType ??
                (typeof offerMeta.delivery === "string" ? offerMeta.delivery : null) ??
                null,
              unlockEventType:
                offer.unlockEventType ??
                (typeof offerMeta.unlockEventType === "string" ? offerMeta.unlockEventType : null) ??
                null,
              unlockFactKey:
                offer.unlockFactKey ??
                (typeof offerMeta.unlockFactKey === "string" ? offerMeta.unlockFactKey : null) ??
                null,
              receiverAddress:
                offer.receiverAddress ??
                (typeof offerMeta.executionAddress === "string" ? offerMeta.executionAddress : null) ??
                null,
            }
          : null,
      };
    });
  },
});

export const listRoles = query({
  args: { mapName: v.string() },
  handler: async (ctx, { mapName }) => {
    return await ctx.db
      .query("npcRoleAssignments")
      .withIndex("by_map_roleKey", (q) => q.eq("mapName", mapName))
      .collect();
  },
});

export const upsertZone = mutation({
  args: {
    mapName: v.string(),
    zoneKey: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    zoneType: v.string(),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    tags: v.array(v.string()),
    accessType: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("worldZones")
      .withIndex("by_map_zoneKey", (q) => q.eq("mapName", args.mapName).eq("zoneKey", args.zoneKey))
      .first();
    const payload = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("worldZones", payload);
  },
});

export const upsertSemanticObject = mutation({
  args: {
    mapName: v.string(),
    objectKey: v.string(),
    label: v.string(),
    objectType: v.string(),
    sourceType: v.string(),
    mapObjectId: v.optional(v.id("mapObjects")),
    zoneKey: v.optional(v.string()),
    x: v.optional(v.float64()),
    y: v.optional(v.float64()),
    tags: v.array(v.string()),
    affordances: v.array(v.string()),
    valueClass: v.optional(v.string()),
    linkedAgentId: v.optional(v.string()),
    triggerType: v.optional(v.string()),
    freeActions: v.optional(v.array(v.string())),
    paidActions: v.optional(v.array(v.string())),
    premiumOfferKey: v.optional(v.string()),
    interactionPrompt: v.optional(v.string()),
    interactionSummary: v.optional(v.string()),
    inspectEventType: v.optional(v.string()),
    interactEventType: v.optional(v.string()),
    paidEventType: v.optional(v.string()),
    roomLabel: v.optional(v.string()),
    itemDefName: v.optional(v.string()),
    stateJson: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("semanticObjects")
      .withIndex("by_map_objectKey", (q) => q.eq("mapName", args.mapName).eq("objectKey", args.objectKey))
      .first();
    const payload = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("semanticObjects", payload);
  },
});

export const upsertNpcRole = mutation({
  args: {
    agentId: v.string(),
    mapName: v.string(),
    roleKey: v.string(),
    displayRole: v.optional(v.string()),
    behaviorMode: v.optional(v.string()),
    homeZoneKey: v.optional(v.string()),
    postObjectKey: v.optional(v.string()),
    permissions: v.array(v.string()),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("npcRoleAssignments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    const payload = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("npcRoleAssignments", payload);
  },
});
