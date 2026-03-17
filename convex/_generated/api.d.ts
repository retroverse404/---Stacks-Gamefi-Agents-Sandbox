/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agentRegistry from "../agentRegistry.js";
import type * as agents_agentEconomics from "../agents/agentEconomics.js";
import type * as agents_agentThink from "../agents/agentThink.js";
import type * as agents_runtime from "../agents/runtime.js";
import type * as agents_stateMachine from "../agents/stateMachine.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as http from "../http.js";
import type * as integrations_chainhooks from "../integrations/chainhooks.js";
import type * as integrations_tenero from "../integrations/tenero.js";
import type * as integrations_x402 from "../integrations/x402.js";
import type * as integrations_zeroAuthority from "../integrations/zeroAuthority.js";
import type * as items from "../items.js";
import type * as lib_getRequestUserId from "../lib/getRequestUserId.js";
import type * as lib_requireAdmin from "../lib/requireAdmin.js";
import type * as lib_requireAdminKey from "../lib/requireAdminKey.js";
import type * as lib_requireMapEditor from "../lib/requireMapEditor.js";
import type * as lib_requireSuperuser from "../lib/requireSuperuser.js";
import type * as lib_worldEvents from "../lib/worldEvents.js";
import type * as localDev from "../localDev.js";
import type * as mapObjects from "../mapObjects.js";
import type * as maps from "../maps.js";
import type * as mechanics_combat from "../mechanics/combat.js";
import type * as mechanics_economy from "../mechanics/economy.js";
import type * as mechanics_inventory from "../mechanics/inventory.js";
import type * as mechanics_loot from "../mechanics/loot.js";
import type * as migrations from "../migrations.js";
import type * as npcEngine from "../npcEngine.js";
import type * as npcProfiles from "../npcProfiles.js";
import type * as npcs from "../npcs.js";
import type * as players from "../players.js";
import type * as presence from "../presence.js";
import type * as profiles from "../profiles.js";
import type * as semantics from "../semantics.js";
import type * as spriteDefinitions from "../spriteDefinitions.js";
import type * as spriteSheets from "../spriteSheets.js";
import type * as storage from "../storage.js";
import type * as story_dialogue from "../story/dialogue.js";
import type * as story_events from "../story/events.js";
import type * as story_lore from "../story/lore.js";
import type * as story_quests from "../story/quests.js";
import type * as story_storyAi from "../story/storyAi.js";
import type * as superuser from "../superuser.js";
import type * as wallets from "../wallets.js";
import type * as worldItems from "../worldItems.js";
import type * as worldState from "../worldState.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentRegistry: typeof agentRegistry;
  "agents/agentEconomics": typeof agents_agentEconomics;
  "agents/agentThink": typeof agents_agentThink;
  "agents/runtime": typeof agents_runtime;
  "agents/stateMachine": typeof agents_stateMachine;
  auth: typeof auth;
  chat: typeof chat;
  http: typeof http;
  "integrations/chainhooks": typeof integrations_chainhooks;
  "integrations/tenero": typeof integrations_tenero;
  "integrations/x402": typeof integrations_x402;
  "integrations/zeroAuthority": typeof integrations_zeroAuthority;
  items: typeof items;
  "lib/getRequestUserId": typeof lib_getRequestUserId;
  "lib/requireAdmin": typeof lib_requireAdmin;
  "lib/requireAdminKey": typeof lib_requireAdminKey;
  "lib/requireMapEditor": typeof lib_requireMapEditor;
  "lib/requireSuperuser": typeof lib_requireSuperuser;
  "lib/worldEvents": typeof lib_worldEvents;
  localDev: typeof localDev;
  mapObjects: typeof mapObjects;
  maps: typeof maps;
  "mechanics/combat": typeof mechanics_combat;
  "mechanics/economy": typeof mechanics_economy;
  "mechanics/inventory": typeof mechanics_inventory;
  "mechanics/loot": typeof mechanics_loot;
  migrations: typeof migrations;
  npcEngine: typeof npcEngine;
  npcProfiles: typeof npcProfiles;
  npcs: typeof npcs;
  players: typeof players;
  presence: typeof presence;
  profiles: typeof profiles;
  semantics: typeof semantics;
  spriteDefinitions: typeof spriteDefinitions;
  spriteSheets: typeof spriteSheets;
  storage: typeof storage;
  "story/dialogue": typeof story_dialogue;
  "story/events": typeof story_events;
  "story/lore": typeof story_lore;
  "story/quests": typeof story_quests;
  "story/storyAi": typeof story_storyAi;
  superuser: typeof superuser;
  wallets: typeof wallets;
  worldItems: typeof worldItems;
  worldState: typeof worldState;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
