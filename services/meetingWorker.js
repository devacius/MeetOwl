// meetingWorker.js
// Forked by parent.js for each meeting.
// Does NOT read meetingUrl/meetingId from env — receives them via IPC.
import { joinMeeting } from "./meetBot.js";


const STATS_INTERVAL_MS = Number(process.env.STATS_INTERVAL_MS) || 10_000;

// ─────────────────────────────────────────────
// STEP 1 — Signal parent that worker is booted
// Parent will respond with { type: "init", meetingUrl, meetingId }
// ─────────────────────────────────────────────
process.send({ type: "ready" });


// ─────────────────────────────────────────────
// STEP 2 — Wait for init message from parent
// This is where meetingUrl and meetingId arrive (from the API payload)
// ─────────────────────────────────────────────
process.once("message", async (msg) => {
  if (msg.type !== "init") {
    process.send({ type: "error", data: `Expected init message, got: ${msg.type}` });
    process.exit(1);
  }

  const { meetingUrl, meetingId } = msg;

  if (!meetingUrl || !meetingId) {
    process.send({ type: "error", data: "meetingUrl or meetingId missing in init message." });
    process.exit(1);
  }

  console.log(`[worker:${meetingId}] 📨 Received config → ${meetingUrl}`);

  // Start periodic stats reporting now that we have an identity
  startStatsReporter(meetingId);

  // Listen for further commands from parent (e.g. stopRecording)
  process.on("message", (cmd) => handleCommand(cmd, meetingId));

  // Start the bot
  await startBot(meetingUrl, meetingId);
});


// ─────────────────────────────────────────────
// START THE BOT
// ─────────────────────────────────────────────
async function startBot(meetingUrl, meetingId) {
  try {
    process.send({ type: "status", data: "starting" });
    console.log(`[worker:${meetingId}] 🚀 Joining → ${meetingUrl}`);

    await joinMeeting(meetingUrl);

    process.send({ type: "status", data: "joined" });
    console.log(`[worker:${meetingId}] ✅ Joined meeting.`);
  } catch (err) {
    process.send({ type: "error", data: `Failed to join: ${err.message}` });
    console.error(`[worker:${meetingId}] ❌`, err);
    process.exit(1);
  }
}


// ─────────────────────────────────────────────
// HANDLE COMMANDS FROM PARENT
// e.g: parent.sendCommand(id, { action: 'stopRecording' })
// ─────────────────────────────────────────────
function handleCommand(msg, meetingId) {
  console.log(`[worker:${meetingId}] 📨 Command received:`, msg);
  // Add cases here as you expand functionality
  // Example:
  // if (msg.action === 'stopRecording') stopAudioRecording();
}


// ─────────────────────────────────────────────
// MEMORY STATS REPORTER
// ─────────────────────────────────────────────
function startStatsReporter(meetingId) {
  setInterval(() => {
    const mem = process.memoryUsage();
    process.send({
      type: "stats",
      data: {
        rss       : Math.round(mem.rss       / 1024 / 1024),
        heapUsed  : Math.round(mem.heapUsed  / 1024 / 1024),
        heapTotal : Math.round(mem.heapTotal / 1024 / 1024),
      },
    });
  }, STATS_INTERVAL_MS);
}


// ─────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log(`[worker] 🛑 SIGTERM received. Shutting down.`);
  process.send({ type: "status", data: "shutting_down" });
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  process.send({ type: "error", data: `Uncaught exception: ${err.message}` });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  process.send({ type: "error", data: `Unhandled rejection: ${reason}` });
  process.exit(1);
});