/**
 * market-btc-m1 operator console
 * Minimal B&W terminal interface — reads live agent state from Hiro + local x402-api
 *
 * Usage:  node console.mjs
 */

import readline from "readline";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname    = dirname(fileURLToPath(import.meta.url));
const CONVEX_ROOT  = resolve(__dirname, "../..");
const CONVEX_ADMIN_KEY = "tinyrealms-local-admin-key";

// ── Config ─────────────────────────────────────────────────────────────────
const API_BASE          = "http://127.0.0.1:4020";
const HIRO_MAINNET      = "https://api.hiro.so";
const HIRO_TESTNET      = "https://api.testnet.hiro.so";

const MAINNET_ADDRESS   = "SP1SRTS9MKZH8ZNFRBYFWM9WA75KVK2AZ8K1JSSD7";
const TESTNET_ADDRESS   = "ST3EGPYCJ8JTC9QETJHM2T47ZCCWNM9VX98ZEPXWT";
const BTC_ADDRESS       = "bc1qu49c6ugn26k6fcm3y7a8sem0hcaag34qr4vk3t";

const STX_DECIMALS      = 1_000_000;
const ALEX_DECIMALS     = 100_000_000;
const ALEX_CONTRACT_KEY  = "token-alex";
const DEFAULT_TARGET     = { stx_pct: 60, alex_pct: 40 };
const DRIFT_THRESHOLD    = 2; // percent — no swap needed if within this tolerance

// ── Layout ─────────────────────────────────────────────────────────────────
const W     = 56;
const BAR   = "─".repeat(W);
const DBAR  = "═".repeat(W);

function row(label, value) {
  const l = ` ${label.padEnd(14)}: `;
  const v = String(value);
  // wrap long values
  if ((l + v).length <= W) return l + v;
  return l + v.slice(0, W - l.length - 1) + "…";
}

function banner() {
  console.clear();
  console.log(DBAR);
  console.log(` MARKET-BTC-M1  |  operator console  |  v0.1`);
  console.log(DBAR);
}

// ── Fetchers ───────────────────────────────────────────────────────────────
async function fetchSTX(address, network) {
  const base = network === "testnet" ? HIRO_TESTNET : HIRO_MAINNET;
  try {
    const r = await fetch(`${base}/extended/v1/address/${address}/stx`);
    const d = await r.json();
    return (Number(d.balance) / STX_DECIMALS).toFixed(4);
  } catch {
    return "?";
  }
}

async function fetchALEX(address) {
  try {
    const r = await fetch(`${HIRO_MAINNET}/extended/v1/address/${address}/balances`);
    const d = await r.json();
    const key = Object.keys(d.fungible_tokens || {}).find(k => k.includes(ALEX_CONTRACT_KEY));
    if (!key) return "0.0000";
    return (Number(d.fungible_tokens[key].balance) / ALEX_DECIMALS).toFixed(4);
  } catch {
    return "?";
  }
}

async function fetchHealth() {
  try {
    const r = await fetch(`${API_BASE}/health`);
    const d = await r.json();
    return d.ok
      ? { ok: true, label: `UP  (${d.network}, ${d.facilitatorMode})` }
      : { ok: false, label: "ERROR" };
  } catch {
    return { ok: false, label: "OFFLINE" };
  }
}

async function fetchProbe() {
  try {
    const r = await fetch(`${API_BASE}/api/premium/market-btc/quote?tokenX=STX&tokenY=ALEX&amountIn=1000000`);
    if (r.status === 402) {
      const header = r.headers.get("payment-required");
      if (header) {
        const ch = JSON.parse(Buffer.from(header, "base64").toString());
        const price = (Number(ch.accepts[0].amount) / STX_DECIMALS).toFixed(4);
        return { status: "ACTIVE", price: `${price} STX / call` };
      }
    }
    if (r.status === 503) return { status: "UNCONFIGURED", price: "—" };
    return { status: "UNKNOWN", price: "—" };
  } catch {
    return { status: "OFFLINE", price: "—" };
  }
}

// ── Load & display initial panel ───────────────────────────────────────────
async function loadAndRender() {
  banner();
  process.stdout.write(" loading...\r");

  const [mainStx, testStx, alexBal, health, probe] = await Promise.all([
    fetchSTX(MAINNET_ADDRESS, "mainnet"),
    fetchSTX(TESTNET_ADDRESS, "testnet"),
    fetchALEX(MAINNET_ADDRESS),
    fetchHealth(),
    fetchProbe(),
  ]);

  banner();
  console.log(row("wallet",      "market-btc-m1"));
  console.log(row("mainnet STX", `${mainStx} STX`));
  console.log(row("testnet STX", `${testStx} STX`));
  console.log(row("ALEX",        `${alexBal} ALEX`));
  console.log(BAR);
  console.log(row("x402-api",    health.label));
  console.log(row("quote gate",  probe.status));
  console.log(row("price",       probe.price));
  console.log(BAR);
  console.log(row("mainnet",     MAINNET_ADDRESS));
  console.log(row("testnet",     TESTNET_ADDRESS));
  console.log(row("btc",         BTC_ADDRESS));
  console.log(BAR);
  console.log(` type 'help' for commands`);
  console.log(DBAR);
}

// ── Commands ───────────────────────────────────────────────────────────────
async function cmdBalance() {
  console.log(`\n${BAR}`);
  process.stdout.write(" fetching...\r");
  const [mainStx, testStx, alexBal] = await Promise.all([
    fetchSTX(MAINNET_ADDRESS, "mainnet"),
    fetchSTX(TESTNET_ADDRESS, "testnet"),
    fetchALEX(MAINNET_ADDRESS),
  ]);
  console.log(row("mainnet STX", `${mainStx} STX`));
  console.log(row("testnet STX", `${testStx} STX`));
  console.log(row("ALEX",        `${alexBal} ALEX`));
  console.log(BAR);
}

async function cmdStatus() {
  console.log(`\n${BAR}`);
  process.stdout.write(" fetching...\r");
  const [health, probe] = await Promise.all([fetchHealth(), fetchProbe()]);
  console.log(row("x402-api",    health.label));
  console.log(row("quote gate",  probe.status));
  console.log(row("price",       probe.price));
  console.log(row("endpoint",    "/api/premium/market-btc/quote"));
  console.log(row("facilitator", `${API_BASE}/settle`));
  console.log(BAR);
}

async function cmdQuote(args) {
  const amountSTX = parseFloat(args[0] || "1");
  if (isNaN(amountSTX) || amountSTX <= 0) {
    console.log(" usage: quote [amount-in-STX]");
    return;
  }
  const amountIn = Math.round(amountSTX * STX_DECIMALS);
  console.log(`\n${BAR}`);
  process.stdout.write(` probing quote endpoint (${amountSTX} STX input)...\r`);

  const probe = await fetchProbe();
  if (probe.status !== "ACTIVE") {
    console.log(row("status", probe.status));
    console.log(` x402-api is not active — start it with: npm start`);
    console.log(BAR);
    return;
  }

  console.log(row("status",      probe.status));
  console.log(row("price",       probe.price));
  console.log(row("amount in",   `${amountSTX} STX (${amountIn} micro-STX)`));
  console.log(` note: quote requires payment via x402`);
  console.log(` run test-x402-flow.mjs to execute a paid call`);
  console.log(BAR);
}

// ── Convex helpers ─────────────────────────────────────────────────────────
function convexRun(fn, argsObj) {
  const argStr = JSON.stringify(argsObj).replace(/'/g, "'\\''");
  return execSync(
    `npx convex run ${fn} '${argStr}'`,
    { cwd: CONVEX_ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
}

function writeWorldFact(factKey, factType, valueObj) {
  try {
    convexRun("admin:patchWorldFact", {
      adminKey: CONVEX_ADMIN_KEY,
      factKey,
      factType,
      valueJson: JSON.stringify(valueObj),
      scope: "world",
      mapName: "Cozy Cabin",
    });
    return true;
  } catch (e) {
    console.log(` warn: could not write ${factKey} — ${String(e.message).slice(0, 60)}`);
    return false;
  }
}

// ── Rebalance command ──────────────────────────────────────────────────────
async function cmdRebalance(rl, args) {
  console.log(`\n${BAR}`);
  console.log(" BASKET REBALANCE  —  operator-approved mode");
  console.log(BAR);

  // 1. Fetch current balances
  process.stdout.write(" fetching balances...\r");
  const [stxStr, alexStr] = await Promise.all([
    fetchSTX(MAINNET_ADDRESS, "mainnet"),
    fetchALEX(MAINNET_ADDRESS),
  ]);
  const stx  = parseFloat(stxStr);
  const alex = parseFloat(alexStr);
  if (isNaN(stx) || isNaN(alex)) {
    console.log(" error: could not fetch live balances — check connectivity");
    console.log(BAR);
    return;
  }

  // 2. Resolve rate — arg, or prompt operator
  let rate = parseFloat(args[0]);
  if (isNaN(rate) || rate <= 0) {
    rate = await new Promise((res) =>
      rl.question(` enter current STX→ALEX rate (e.g. 3.58): `, (a) => res(parseFloat(a)))
    );
  }
  if (isNaN(rate) || rate <= 0) {
    console.log(" error: invalid rate");
    console.log(BAR);
    return;
  }

  // 3. Load target from worldFacts, fall back to default
  let target = { ...DEFAULT_TARGET };
  try {
    const raw   = convexRun("worldState:listFacts", { mapName: "Cozy Cabin" });
    const facts = JSON.parse(raw);
    const tf    = facts.find((f) => f.factKey === "market:basket-target");
    if (tf) {
      const parsed = JSON.parse(tf.valueJson);
      if (parsed.stx_pct && parsed.alex_pct) target = parsed;
    }
  } catch { /* use default silently */ }

  // 4. Compute allocation and drift
  const alexInStx   = alex / rate;
  const totalStx    = stx + alexInStx;
  const stxPct      = Math.round((stx / totalStx) * 100);
  const alexPct     = 100 - stxPct;
  const targetStxAmt = (target.stx_pct / 100) * totalStx;
  const driftStx    = stx - targetStxAmt;   // positive = excess STX
  const swapAbs     = Math.abs(driftStx);
  const swapFrom    = driftStx > 0 ? "STX" : "ALEX";
  const swapTo      = driftStx > 0 ? "ALEX" : "STX";
  const swapDisplay = driftStx > 0
    ? `${swapAbs.toFixed(4)} STX → ${(swapAbs * rate).toFixed(4)} ALEX`
    : `${(swapAbs * rate).toFixed(4)} ALEX → ${swapAbs.toFixed(4)} STX`;

  console.log(row("portfolio",   `${stx.toFixed(4)} STX + ${alex.toFixed(4)} ALEX`));
  console.log(row("total value", `${totalStx.toFixed(4)} STX equiv`));
  console.log(row("rate",        `${rate} ALEX / STX`));
  console.log(row("current",     `${stxPct}% STX / ${alexPct}% ALEX`));
  console.log(row("target",      `${target.stx_pct}% STX / ${target.alex_pct}% ALEX`));
  console.log(BAR);

  // 5. Within tolerance — just publish portfolio and return
  if (swapAbs < 0.001 || Math.abs(stxPct - target.stx_pct) < DRIFT_THRESHOLD) {
    console.log(" within tolerance — no swap needed.");
    writeWorldFact("market:portfolio", "economy", {
      stx: parseFloat(stx.toFixed(4)),
      alex: parseFloat(alex.toFixed(4)),
      total_stx_value: parseFloat(totalStx.toFixed(4)),
      rate,
      source: "market-btc-m1",
      updatedAt: Date.now(),
    });
    console.log(" market:portfolio published.");
    console.log(BAR);
    return;
  }

  // 6. Show proposed swap and AIBTC command
  console.log(row("action",   `swap ${swapDisplay}`));
  console.log(row("from→to",  `${swapFrom} → ${swapTo}`));
  const amountIn = Math.round(swapAbs * (swapFrom === "STX" ? STX_DECIMALS : ALEX_DECIMALS));
  console.log(BAR);
  console.log(` to execute, run AIBTC tool:`);
  console.log(`   mcp__aibtc__alex_swap`);
  console.log(`   tokenX: ${swapFrom}  tokenY: ${swapTo}  amountIn: ${amountIn}`);
  console.log(BAR);

  // 7. Operator confirmation
  const confirm = await new Promise((res) =>
    rl.question(` approve and record rebalance? (y/n): `, (a) => res(a.trim().toLowerCase()))
  );
  if (confirm !== "y" && confirm !== "yes") {
    console.log(" rebalance cancelled — no facts written.");
    console.log(BAR);
    return;
  }

  // 8. Write worldFacts
  const now = Date.now();
  writeWorldFact("market:portfolio", "economy", {
    stx: parseFloat(stx.toFixed(4)),
    alex: parseFloat(alex.toFixed(4)),
    total_stx_value: parseFloat(totalStx.toFixed(4)),
    rate,
    source: "market-btc-m1",
    updatedAt: now,
  });
  writeWorldFact("market:last-rebalance", "economy", {
    action: "swap",
    from: swapFrom,
    to: swapTo,
    amount: parseFloat(swapAbs.toFixed(4)),
    rate,
    approvedBy: "operator",
    timestamp: now,
  });
  console.log(" market:portfolio written.");
  console.log(" market:last-rebalance written.");
  console.log(` next step: execute swap via AIBTC then run 'balance' to confirm.`);
  console.log(BAR);
}

function cmdHelp() {
  console.log(`\n${BAR}`);
  console.log(" commands:");
  console.log("   balance              current STX + ALEX holdings");
  console.log("   status               x402-api + endpoint status");
  console.log("   quote [amount]       quote endpoint info");
  console.log("   rebalance [rate]     basket allocation check + operator approval");
  console.log("   refresh              reload the status panel");
  console.log("   help                 show this message");
  console.log("   exit                 quit");
  console.log(BAR);
}

// ── REPL ───────────────────────────────────────────────────────────────────
async function main() {
  await loadAndRender();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: " > ",
  });

  rl.prompt();

  rl.on("line", async (raw) => {
    const parts = raw.trim().split(/\s+/);
    const cmd   = parts[0]?.toLowerCase() ?? "";
    const args  = parts.slice(1);

    switch (cmd) {
      case "balance":              await cmdBalance();              break;
      case "status":               await cmdStatus();               break;
      case "quote":                await cmdQuote(args);            break;
      case "rebalance":            await cmdRebalance(rl, args);    break;
      case "refresh":              await loadAndRender();           break;
      case "help":                       cmdHelp();          break;
      case "exit": case "quit":
        console.log("\n goodbye.\n");
        rl.close();
        process.exit(0);
        break;
      case "":
        break;
      default:
        console.log(` unknown: '${cmd}'  (type 'help')`);
    }

    rl.prompt();
  });

  rl.on("close", () => process.exit(0));
}

main().catch((e) => {
  console.error("fatal:", e.message);
  process.exit(1);
});
