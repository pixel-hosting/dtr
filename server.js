import { serve } from "https://deno.land/std/http/server.ts";

// In Deno Deploy, secrets are set in "Environment Variables" under project settings
const API_KEY = Deno.env.get("API_KEY"); 
const UNIVERSE_IDS = Deno.env.get("UNIVERSE_IDS")?.split(",") || [];

const GLOBAL_BANS = new Map(); // userId -> { reason, expiresAt }
const WARNINGS = new Map();    // userId -> { count, globalCount }
const SESSION_BANS = new Set(); // userIds banned for current session only

async function sendToRoblox(universeId, data) {
  return await fetch(
    `https://apis.roblox.com/messaging-service/v1/universes/${universeId}/topics/moderation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(data),
    },
  );
}

async function broadcast(data) {
  for (const id of UNIVERSE_IDS) {
    await sendToRoblox(id, data);
  }
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Only POST allowed" });
  }

  const { action, userId, reason, duration } = await req.json();

  if (!action || !userId) {
    return jsonResponse(400, { error: "Missing required fields" });
  }

  switch (action) {
    case "warn": {
      const current = WARNINGS.get(userId) || { count: 0, globalCount: 0 };
      current.count++;
      current.globalCount++;
      WARNINGS.set(userId, current);

      // Check thresholds
      if (current.count === 2) {
        await broadcast({ type: "kick", userId, reason: "2 warnings this session" });
      }
      if (current.count === 3) {
        SESSION_BANS.add(userId);
        await broadcast({ type: "ban-session", userId, reason: "3 warnings this session" });
      }
      if (current.globalCount >= 5) {
        GLOBAL_BANS.set(userId, { reason: "5 warnings globally", expiresAt: null });
        await broadcast({ type: "ban-global", userId, reason: "5 warnings globally" });
      }

      await broadcast({ type: "warn", userId, reason });
      return jsonResponse(200, { message: "Warned successfully" });
    }

    case "kick":
      await broadcast({ type: "kick", userId, reason });
      return jsonResponse(200, { message: "Kicked successfully" });

    case "ban-server":
      SESSION_BANS.add(userId);
      await broadcast({ type: "ban-session", userId, reason });
      return jsonResponse(200, { message: "Banned from this server session" });

    case "ban-global":
      GLOBAL_BANS.set(userId, { reason, expiresAt: null });
      await broadcast({ type: "ban-global", userId, reason });
      return jsonResponse(200, { message: "Globally banned" });

    case "ban-temp": {
      const expiresAt = Date.now() + duration * 1000;
      GLOBAL_BANS.set(userId, { reason, expiresAt });
      await broadcast({ type: "ban-temp", userId, reason, expiresAt });
      return jsonResponse(200, { message: `Globally banned for ${duration} seconds` });
    }

    case "unban":
      GLOBAL_BANS.delete(userId);
      SESSION_BANS.delete(userId);
      await broadcast({ type: "unban", userId });
      return jsonResponse(200, { message: "Unbanned successfully" });

    default:
      return jsonResponse(400, { error: "Unknown action" });
  }
});
