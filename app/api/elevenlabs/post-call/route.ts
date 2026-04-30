import { NextResponse, type NextRequest } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

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

export async function POST(req: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!secret || !apiKey || !convexUrl) {
    return NextResponse.json(
      { error: "Webhook environment is not configured" },
      { status: 500 },
    );
  }

  const body = await req.text();
  const signature = req.headers.get("elevenlabs-signature");

  let event: unknown;
  try {
    event = await new ElevenLabsClient({ apiKey }).webhooks.constructEvent(
      body,
      signature ?? "",
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const webhook = extractPostCallWebhook(event);
  if (!webhook) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const convex = new ConvexHttpClient(convexUrl);
  await convex.mutation(api.elevenlabs.ingestVerifiedPostCallWebhook, {
    webhookSecret: secret,
    ...webhook,
  });

  return NextResponse.json({ received: true });
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
