export type WorldEventWrite = {
  mapName?: string;
  worldId?: string;
  eventType: string;
  sourceType?: string;
  sourceId?: string;
  actorId?: string;
  targetId?: string;
  objectKey?: string;
  zoneKey?: string;
  tileX?: number;
  tileY?: number;
  summary: string;
  payloadJson?: string;
  detailsJson?: string;
};

export function buildWorldEventRecord(event: WorldEventWrite) {
  const payloadJson = event.payloadJson ?? event.detailsJson;
  const detailsJson = event.detailsJson ?? event.payloadJson;

  return {
    ...event,
    worldId: event.worldId ?? event.mapName,
    payloadJson,
    detailsJson,
    timestamp: Date.now(),
  };
}
