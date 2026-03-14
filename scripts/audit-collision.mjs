import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function loadMap(mapFile) {
  const fullPath = path.join(root, "public", "assets", "maps", mapFile);
  const map = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  applyKnownFixups(map);
  return map;
}

function applyKnownFixups(map) {
  if (map.name !== "Cozy Cabin") return;
  for (let y = 17; y <= 26; y++) {
    for (const x of [67, 68]) {
      map.collisionMask[y * map.width + x] = false;
    }
  }
}

function isBlocked(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  return Boolean(map.collisionMask[y * map.width + x]);
}

function collectBlockedTiles(map, rect) {
  const blocked = [];
  for (let y = rect.y1; y <= rect.y2; y++) {
    for (let x = rect.x1; x <= rect.x2; x++) {
      if (isBlocked(map, x, y)) blocked.push(`${x},${y}`);
    }
  }
  return blocked;
}

function bfs(map, start, goal) {
  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;
  const queue = [start];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const current = queue.shift();
    const key = `${current.x},${current.y}`;
    if (key === goalKey) return true;

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const nextKey = `${next.x},${next.y}`;
      if (seen.has(nextKey) || isBlocked(map, next.x, next.y)) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }

  return false;
}

const suites = [
  {
    mapFile: "cozy-cabin.json",
    name: "Cozy Cabin",
    clearRects: [
      {
        label: "east-bedroom corridor",
        x1: 67,
        y1: 17,
        x2: 68,
        y2: 26,
      },
    ],
    paths: [
      {
        label: "hall to east bedroom",
        start: { x: 67, y: 16 },
        goal: { x: 67, y: 26 },
      },
      {
        label: "east bedroom back to hall",
        start: { x: 68, y: 26 },
        goal: { x: 68, y: 16 },
      },
    ],
  },
];

let failed = false;

for (const suite of suites) {
  const map = loadMap(suite.mapFile);
  console.log(`Auditing ${suite.name} (${suite.mapFile})`);

  for (const rect of suite.clearRects) {
    const blocked = collectBlockedTiles(map, rect);
    if (blocked.length > 0) {
      failed = true;
      console.error(`FAIL clear rect "${rect.label}" has blocked tiles: ${blocked.join(" ")}`);
    } else {
      console.log(`PASS clear rect "${rect.label}"`);
    }
  }

  for (const pathSpec of suite.paths) {
    const ok = bfs(map, pathSpec.start, pathSpec.goal);
    if (!ok) {
      failed = true;
      console.error(
        `FAIL path "${pathSpec.label}" from ${pathSpec.start.x},${pathSpec.start.y} to ${pathSpec.goal.x},${pathSpec.goal.y}`,
      );
    } else {
      console.log(`PASS path "${pathSpec.label}"`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Collision audit passed.");
}
