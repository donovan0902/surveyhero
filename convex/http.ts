import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authKit } from "./auth";

const http = httpRouter();
authKit.registerRoutes(http);

type PostCallWebhook = {
  agentId: string;
  conversationId: string;
  responseIdFromElevenLabsUserId?: string;
};

http.route({
  path: "/elevenlabs/post-call",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    if (!secret) {
      return jsonResponse({ error: "Webhook environment is not configured" }, 500);
    }

    const body = await req.text();
    const signature = req.headers.get("elevenlabs-signature");

    let event: unknown;
    try {
      event = await constructElevenLabsWebhookEvent(body, signature, secret);
    } catch {
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    const webhook = extractPostCallWebhook(event);
    if (!webhook) {
      return jsonResponse({ received: true, ignored: true }, 200);
    }

    await ctx.runMutation(internal.elevenlabs.handlePostCallWebhook, webhook);
    return jsonResponse({ received: true }, 200);
  }),
});

// Live server-tool endpoint called by the ElevenLabs agent each time it
// records an answer. Auth is a static shared secret embedded in the agent
// config as a request header. ElevenLabs sends tool arguments in `parameters`
// and includes its conversation id at the top level.
http.route({
  path: "/elevenlabs/tools/record-answer",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const expectedSecret = process.env.ELEVENLABS_TOOL_SECRET;
    if (!expectedSecret) {
      return jsonResponse({ ok: false, error: "Tool secret not configured" }, 500);
    }

    const providedSecret = req.headers.get("x-surveyhero-secret");
    if (
      !providedSecret ||
      providedSecret.length !== expectedSecret.length ||
      !safeEqual(providedSecret, expectedSecret)
    ) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const body = asRecord(payload);
    const parameters = asRecord(body?.parameters);
    const toolArgs = parameters ?? body;
    const dataCollectionId = asString(toolArgs?.data_collection_id);
    const value = typeof toolArgs?.value === "string" ? (toolArgs.value as string) : null;

    if (!dataCollectionId || value === null) {
      return jsonResponse(
        { ok: false, error: "data_collection_id and value are required" },
        400,
      );
    }

    const url = new URL(req.url);
    const responseId =
      asString(toolArgs?.response_id) ??
      asString(toolArgs?.survey_response_id) ??
      asString(body?.response_id) ??
      asString(body?.survey_response_id) ??
      asString(url.searchParams.get("response_id"));
    const conversationId =
      asString(body?.conversation_id) ??
      asString(toolArgs?.conversation_id) ??
      asString(url.searchParams.get("conversation_id"));

    const result = await ctx.runMutation(internal.elevenlabs.recordToolAnswer, {
      ...(responseId ? { responseId } : {}),
      ...(conversationId ? { conversationId } : {}),
      dataCollectionId,
      value,
    });

    return jsonResponse(result, result.ok ? 200 : 400);
  }),
});

export default http;

async function constructElevenLabsWebhookEvent(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
): Promise<unknown> {
  if (!sigHeader) throw new Error("Missing signature header");

  const headers = sigHeader.split(",");
  const timestamp = headers.find((header) => header.startsWith("t="))?.slice(2);
  const signature = headers.find((header) => header.startsWith("v0="));
  if (!timestamp || !signature) {
    throw new Error("Missing expected ElevenLabs signature fields");
  }

  const reqTimestampMs = Number(timestamp) * 1000;
  const oldestAllowedMs = Date.now() - 30 * 60 * 1000;
  if (!Number.isFinite(reqTimestampMs) || reqTimestampMs < oldestAllowedMs) {
    throw new Error("Webhook timestamp outside tolerance");
  }

  const expected = await hmacSha256(secret, `${timestamp}.${rawBody}`);
  if (!safeEqual(signature, expected)) {
    throw new Error("Webhook signature mismatch");
  }

  return JSON.parse(rawBody) as unknown;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return `v0=${Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function extractPostCallWebhook(event: unknown): PostCallWebhook | null {
  const root = asRecord(event);
  if (root?.type !== "post_call_transcription") return null;

  const data = asRecord(root.data);
  if (!data) return null;

  const agentId = asString(data.agent_id);
  const conversationId = asString(data.conversation_id);
  if (!agentId || !conversationId) return null;

  const initiationData = asRecord(data.conversation_initiation_client_data);
  const dynamicVariables = asRecord(initiationData?.dynamic_variables);
  const responseIdFromElevenLabsUserId =
    asString(data.user_id) ??
    asString(dynamicVariables?.survey_response_id) ??
    asString(dynamicVariables?.response_id);

  return {
    agentId,
    conversationId,
    responseIdFromElevenLabsUserId,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
