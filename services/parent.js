
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const WORKER_PATH       = path.resolve(__dirname, "meetingWorker.js");
const WORKER_EXEC_ARGV  = ["--experimental-vm-modules"];
const MEMORY_LIMIT_MB   = 500;
const STATS_INTERVAL_MS = 10_000;
const MAX_RESTARTS      = 3;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const activeMeetings = new Map();  // meetingId → entry


// ─────────────────────────────────────────────
// LOGGING HELPERS
// ─────────────────────────────────────────────
function log(meetingId, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${meetingId}] ${msg}`);
}

function logStats() {
  if (activeMeetings.size === 0) {
    console.log("\n📊 No active meetings.\n");
    return;
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    ACTIVE MEETINGS STATS                    ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");

  for (const [meetingId, entry] of activeMeetings) {
    const uptime = Math.floor((Date.now() - entry.startTime) / 1000);
    const stats  = entry.lastStats;
    const ram    = stats ? `${stats.rss} MB`                         : "waiting...";
    const heap   = stats ? `${stats.heapUsed}/${stats.heapTotal} MB` : "waiting...";

    console.log(`║ 🆔  ${meetingId.padEnd(20)} PID: ${String(entry.child.pid).padEnd(8)}        ║`);
    console.log(`║    RAM (RSS): ${ram.padEnd(12)} Heap: ${heap.padEnd(22)}║`);
    console.log(`║    Uptime: ${String(uptime + "s").padEnd(10)} Restarts: ${String(entry.restarts).padEnd(18)}    ║`);
    console.log("╠══════════════════════════════════════════════════════════════╣");
  }

  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}


// ─────────────────────────────────────────────
// SPAWN A CHILD FOR ONE MEETING
// ─────────────────────────────────────────────
function spawnMeetingWorker(meetingUrl, meetingId, restartCount = 0) {
  log(meetingId, `🚀 Spawning worker (attempt ${restartCount + 1}) → ${meetingUrl}`);

  const child = fork(WORKER_PATH, [], {
    env: {
      ...process.env,
      // Only static config goes through env.
      // meetingUrl + meetingId are sent via IPC after the child signals "ready".
      STATS_INTERVAL_MS: String(STATS_INTERVAL_MS),
    },
    execArgv: WORKER_EXEC_ARGV,
    silent: false,
  });

  const entry = {
    child,
    meetingUrl,
    meetingId,
    startTime : new Date(),
    restarts  : restartCount,
    lastStats : null,
  };

  activeMeetings.set(meetingId, entry);
  log(meetingId, `✅ Worker forked. PID: ${child.pid}. Waiting for ready signal...`);

  // ── IPC: messages coming FROM child ──────────
  child.on("message", (msg) => {
    switch (msg.type) {

      // Child has booted and is waiting for meeting config
      case "ready":
        log(meetingId, `🟢 Worker ready. Sending meetingUrl + meetingId via IPC.`);
        child.send({
          type      : "init",
          meetingUrl: meetingUrl,   // ← comes from API payload, not env
          meetingId : meetingId,    // ← comes from API payload, not env
        });
        break;

      case "stats":
        entry.lastStats = msg.data;
        if (msg.data.rss > MEMORY_LIMIT_MB) {
          log(meetingId,
            `⚠️  Memory limit exceeded! RSS: ${msg.data.rss} MB > ${MEMORY_LIMIT_MB} MB. Killing child.`
          );
          killMeeting(meetingId, "memory_limit");
        }
        break;

      case "status":
        log(meetingId, `📢 Status: ${msg.data}`);
        break;

      case "error":
        log(meetingId, `❌ Worker error: ${msg.data}`);
        break;

      default:
        log(meetingId, `📨 Unknown message from worker: ${JSON.stringify(msg)}`);
    }
  });

  // ── Child process crashed / exited ───────────
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    log(meetingId, `⚠️  Worker exited (${reason})`);
    activeMeetings.delete(meetingId);

    const isClean = code === 0;
    if (!isClean && restartCount < MAX_RESTARTS) {
      log(meetingId, `🔄 Auto-restarting... (${restartCount + 1}/${MAX_RESTARTS})`);
      setTimeout(() => {
        spawnMeetingWorker(meetingUrl, meetingId, restartCount + 1);
      }, 3000);
    } else if (!isClean) {
      log(meetingId, `🛑 Max restarts reached. Giving up on this meeting.`);
    } else {
      log(meetingId, `✅ Worker finished cleanly.`);
    }
  });

  child.on("error", (err) => {
    log(meetingId, `❌ Failed to spawn worker: ${err.message}`);
    activeMeetings.delete(meetingId);
  });

  return child;
}


// ─────────────────────────────────────────────
// PUBLIC API  — import these in your route file
// ─────────────────────────────────────────────

/**
 * Join a new meeting. Called from your Express route.
 *
 * @example
 * // routes/meetRoutes.js
 * const { joinMeeting } = require('../parent');
 *
 * router.post('/join', (req, res) => {
 *   const { meetingUrl, meetingId } = req.body;  // ← straight from payload
 *   joinMeeting(meetingUrl, meetingId);
 *   res.json({ success: true, meetingId });
 * });
 *
 * @param {string} meetingUrl  - Google Meet URL (from req.body)
 * @param {string} meetingId   - Meeting ID      (from req.body)
 */
export function joinMeeting(meetingUrl, meetingId) {
  if (!meetingUrl || !meetingId) {
    console.error("[parent] ❌ joinMeeting requires both meetingUrl and meetingId.");
    return;
  }

  if (activeMeetings.has(meetingId)) {
    console.warn(`[parent] ⚠️  Meeting ${meetingId} is already running.`);
    return;
  }

  spawnMeetingWorker(meetingUrl, meetingId);
}

/**
 * Send a command to a running worker.
 * @example sendCommand('my-id', { action: 'stopRecording' })
 */
export function sendCommand(meetingId, command) {
  const entry = activeMeetings.get(meetingId);
  if (!entry) {
    console.warn(`[parent] ⚠️  No active meeting with ID: ${meetingId}`);
    return;
  }
  entry.child.send(command);
  log(meetingId, `📤 Command sent: ${JSON.stringify(command)}`);
}

/** Kill one specific meeting worker. */
export function killMeeting(meetingId, reason = "manual") {
  const entry = activeMeetings.get(meetingId);
  if (!entry) {
    console.warn(`[parent] ⚠️  No active meeting with ID: ${meetingId}`);
    return;
  }
  log(meetingId, `🛑 Killing worker. Reason: ${reason}`);
  entry.child.kill("SIGTERM");
  activeMeetings.delete(meetingId);
}

/** Kill ALL running meeting workers. */
export function killAllMeetings() {
  console.log("[parent] 🛑 Shutting down all meetings...");
  for (const [meetingId] of activeMeetings) {
    killMeeting(meetingId, "shutdown");
  }
}


// ─────────────────────────────────────────────
// PERIODIC STATS LOG
// ─────────────────────────────────────────────
setInterval(logStats, STATS_INTERVAL_MS);


// ─────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────
export function shutdown() {
  console.log("\n[parent] 🔴 Received shutdown signal.");
  killAllMeetings();
  process.exit(0);
}

process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (err) => {
  console.error("[parent] ❌ Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[parent] ❌ Unhandled rejection:", reason);
});


