import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authKit } from "./auth";

const http = httpRouter();
authKit.registerRoutes(http);

type ExtractedValue = string | number | boolean | null;

type PostCallWebhook = {
  agentId: string;
  conversationId: string;
  responseIdFromElevenLabsUserId?: string;
  dataCollectionResults: {
    dataCollectionId: string;
    value: ExtractedValue;
  }[];
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

  const analysis = asRecord(data.analysis);

  return {
    agentId,
    conversationId,
    responseIdFromElevenLabsUserId,
    dataCollectionResults: normalizeDataCollectionResults(
      analysis?.data_collection_results,
    ),
  };
}

function normalizeDataCollectionResults(
  resultsRaw: unknown,
): PostCallWebhook["dataCollectionResults"] {
  if (Array.isArray(resultsRaw)) {
    return resultsRaw.flatMap((item) => {
      const record = asRecord(item);
      const dataCollectionId =
        asString(record?.data_collection_id) ??
        asString(record?.dataCollectionId) ??
        asString(record?.id) ??
        asString(record?.name);
      if (!dataCollectionId) return [];

      return [
        {
          dataCollectionId,
          value: normalizeExtractedValue(record?.value),
        },
      ];
    });
  }

  const record = asRecord(resultsRaw);
  if (!record) return [];

  return Object.entries(record).map(([dataCollectionId, item]) => {
    const itemRecord = asRecord(item);
    return {
      dataCollectionId,
      value: normalizeExtractedValue(itemRecord?.value ?? item),
    };
  });
}

function normalizeExtractedValue(value: unknown): ExtractedValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return null;
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
