import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { buildWorldEventRecord } from "../lib/worldEvents";

const EVENT_STATUS = {
  APPLIED: "applied",
  ROLLED_BACK: "rolled-back",
} as const;

export const listReceipts = query({
  args: {
    txHash: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { txHash, status }) => {
    if (txHash) {
      return await ctx.db
        .query("chainhookReceipts")
        .withIndex("by_txHash", (q) => q.eq("txHash", txHash))
        .collect();
    }

    const rows = await ctx.db.query("chainhookReceipts").collect();
    if (!status) return rows;
    return rows.filter((row) => row.status === status);
  },
});

export const ingestNormalizedEvents = mutation({
  args: {
    events: v.array(v.object({
      dedupeKey: v.string(),
      txHash: v.optional(v.string()),
      blockHash: v.optional(v.string()),
      chain: v.string(),
      network: v.string(),
      eventType: v.string(),
      status: v.string(),
      source: v.optional(v.string()),
      payloadJson: v.string(),
      mapName: v.optional(v.string()),
      actorId: v.optional(v.string()),
      targetId: v.optional(v.string()),
      objectKey: v.optional(v.string()),
      zoneKey: v.optional(v.string()),
      summary: v.string(),
      factKey: v.optional(v.string()),
      factType: v.optional(v.string()),
      factValueJson: v.optional(v.string()),
      factScope: v.optional(v.string()),
      factSubjectId: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { events }) => {
    const results: Array<{ dedupeKey: string; action: string; receiptId: string }> = [];

    for (const event of events) {
      const existing = await ctx.db
        .query("chainhookReceipts")
        .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", event.dedupeKey))
        .first();

      const receiptPayload = {
        dedupeKey: event.dedupeKey,
        txHash: event.txHash,
        blockHash: event.blockHash,
        chain: event.chain,
        network: event.network,
        eventType: event.eventType,
        status: event.status,
        source: event.source,
        payloadJson: event.payloadJson,
        relatedFactKey: event.factKey,
        updatedAt: Date.now(),
      };

      if (existing && existing.status === event.status) {
        results.push({
          dedupeKey: event.dedupeKey,
          action: "duplicate-ignored",
          receiptId: String(existing._id),
        });
        continue;
      }

      if (event.status === EVENT_STATUS.APPLIED) {
        let relatedEventId = existing?.relatedEventId;
        if (!relatedEventId) {
          relatedEventId = await ctx.db.insert("worldEvents", buildWorldEventRecord({
            mapName: event.mapName,
            sourceType: "integration",
            sourceId: event.source ?? event.dedupeKey,
            eventType: event.eventType,
            actorId: event.actorId,
            targetId: event.targetId,
            objectKey: event.objectKey,
            zoneKey: event.zoneKey,
            summary: event.summary,
            payloadJson: event.payloadJson,
          }));
        }

        if (event.factKey && event.factType && event.factValueJson) {
          const existingFact = event.mapName
            ? await ctx.db
                .query("worldFacts")
                .withIndex("by_map_factKey", (q) =>
                  q.eq("mapName", event.mapName).eq("factKey", event.factKey!),
                )
                .first()
            : await ctx.db
                .query("worldFacts")
                .withIndex("by_factKey", (q) => q.eq("factKey", event.factKey!))
                .first();

          const factPayload = {
            mapName: event.mapName,
            factKey: event.factKey,
            factType: event.factType,
            valueJson: event.factValueJson,
            scope: event.factScope,
            subjectId: event.factSubjectId,
            source: event.source ?? "chainhook",
            updatedAt: Date.now(),
          };

          if (existingFact) {
            await ctx.db.patch(existingFact._id, factPayload);
          } else {
            await ctx.db.insert("worldFacts", factPayload);
          }
        }

        if (existing) {
          await ctx.db.patch(existing._id, {
            ...receiptPayload,
            relatedEventId,
          });
          results.push({
            dedupeKey: event.dedupeKey,
            action: "reapplied",
            receiptId: String(existing._id),
          });
        } else {
          const receiptId = await ctx.db.insert("chainhookReceipts", {
            ...receiptPayload,
            relatedEventId,
          });
          results.push({
            dedupeKey: event.dedupeKey,
            action: "applied",
            receiptId: String(receiptId),
          });
        }
        continue;
      }

      if (event.status !== EVENT_STATUS.ROLLED_BACK) {
        throw new Error(`Unsupported chainhook event status: ${event.status}`);
      }

      const rollbackSummary = `Rollback applied for ${event.summary}`;
      const rollbackEventId = await ctx.db.insert("worldEvents", buildWorldEventRecord({
        mapName: event.mapName,
        sourceType: "integration",
        sourceId: event.source ?? event.dedupeKey,
        eventType: `${event.eventType}-rollback`,
        actorId: event.actorId,
        targetId: event.targetId,
        objectKey: event.objectKey,
        zoneKey: event.zoneKey,
        summary: rollbackSummary,
        payloadJson: event.payloadJson,
      }));

      if (event.factKey && event.factType) {
        const tombstoneValue = JSON.stringify({
          rolledBack: true,
          txHash: event.txHash,
          blockHash: event.blockHash,
          revertedAt: Date.now(),
        });
        const existingFact = event.mapName
          ? await ctx.db
              .query("worldFacts")
              .withIndex("by_map_factKey", (q) =>
                q.eq("mapName", event.mapName).eq("factKey", event.factKey!),
              )
              .first()
          : await ctx.db
              .query("worldFacts")
              .withIndex("by_factKey", (q) => q.eq("factKey", event.factKey!))
              .first();

        const tombstonePayload = {
          mapName: event.mapName,
          factKey: event.factKey,
          factType: event.factType,
          valueJson: tombstoneValue,
          scope: event.factScope,
          subjectId: event.factSubjectId,
          source: event.source ?? "chainhook-rollback",
          updatedAt: Date.now(),
        };

        if (existingFact) {
          await ctx.db.patch(existingFact._id, tombstonePayload);
        } else {
          await ctx.db.insert("worldFacts", tombstonePayload);
        }
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...receiptPayload,
          relatedEventId: rollbackEventId,
        });
        results.push({
          dedupeKey: event.dedupeKey,
          action: "rolled-back",
          receiptId: String(existing._id),
        });
      } else {
        const receiptId = await ctx.db.insert("chainhookReceipts", {
          ...receiptPayload,
          relatedEventId: rollbackEventId,
        });
        results.push({
          dedupeKey: event.dedupeKey,
          action: "rollback-recorded",
          receiptId: String(receiptId),
        });
      }
    }

    return {
      processed: results.length,
      results,
    };
  },
});
