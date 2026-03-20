#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const adminKey = process.env.ADMIN_API_KEY;
const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;

if (!adminKey) {
  console.error("Error: ADMIN_API_KEY is not set.");
  console.error("  export ADMIN_API_KEY='your-secret'");
  process.exit(1);
}

if (!convexUrl) {
  console.error("Error: CONVEX_URL or VITE_CONVEX_URL is not set.");
  console.error("  export CONVEX_URL='https://<deployment>.convex.cloud'");
  process.exit(1);
}

const mapPathArg = process.argv[2] || "public/assets/maps/cozy-cabin.json";
const mapPath = resolve(ROOT, mapPathArg);
const mapData = JSON.parse(readFileSync(mapPath, "utf8"));

const client = new ConvexHttpClient(convexUrl);

const payload = {
  adminKey,
  name: mapData.name,
  width: mapData.width,
  height: mapData.height,
  tileWidth: mapData.tileWidth,
  tileHeight: mapData.tileHeight,
  tilesetUrl: mapData.tilesetUrl,
  tilesetPxW: mapData.tilesetPxW,
  tilesetPxH: mapData.tilesetPxH,
  layers: mapData.layers.map((layer) => ({
    name: layer.name,
    type: layer.type,
    tiles: JSON.stringify(layer.tiles),
    visible: layer.visible,
  })),
  collisionMask: JSON.stringify(mapData.collisionMask),
  labels: (mapData.labels ?? []).map((label) => ({
    name: label.name,
    x: label.x,
    y: label.y,
    width: label.width ?? 1,
    height: label.height ?? 1,
  })),
  portals: (mapData.portals ?? []).map((portal) => ({
    name: portal.name,
    x: portal.x,
    y: portal.y,
    width: portal.width,
    height: portal.height,
    targetMap: portal.targetMap,
    targetSpawn: portal.targetSpawn,
    direction: portal.direction,
    transition: portal.transition,
  })),
  ...(mapData.animationUrl ? { animationUrl: mapData.animationUrl } : {}),
  ...(mapData.musicUrl ? { musicUrl: mapData.musicUrl } : {}),
  ...(mapData.ambientSoundUrl ? { ambientSoundUrl: mapData.ambientSoundUrl } : {}),
  ...(typeof mapData.combatEnabled === "boolean"
    ? { combatEnabled: mapData.combatEnabled }
    : {}),
  ...(mapData.status ? { status: mapData.status } : {}),
};

const seededMap = await client.mutation(api.admin.seedSystemMap, payload);
console.log("seedSystemMap:", JSON.stringify(seededMap));

const seededDemo = await client.mutation(api.localDev.ensureDemoNpc, {
  mapName: mapData.name,
  adminKey,
});
console.log("ensureDemoNpc:", JSON.stringify(seededDemo));
