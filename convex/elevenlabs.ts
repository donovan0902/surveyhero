import { action, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';

type SurveyAgentContext = {
  survey: Doc<'surveys'>;
  questions: Doc<'questions'>[];
};

const DEFAULT_LLM = 'gemini-2.0-flash';
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const MAX_DATA_COLLECTION_ITEMS = 25;

const extractedValueValidator = v.union(v.string(), v.number(), v.boolean(), v.null());

async function requireUser(ctx: MutationCtx | QueryCtx): Promise<Doc<'users'>> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Unauthenticated');

  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();
  if (!user) throw new Error('User not found');
  return user;
}

async function getOptionalUser(ctx: MutationCtx | QueryCtx): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();
  if (!user) throw new Error('User not found');
  return user;
}

async function listQuestions(ctx: QueryCtx, surveyId: Id<'surveys'>): Promise<Doc<'questions'>[]> {
  return ctx.db
    .query('questions')
    .withIndex('by_surveyId_and_order', (q) => q.eq('surveyId', surveyId))
    .order('asc')
    .collect();
}

export const getOwnedSurveyAgentContext = internalQuery({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args): Promise<SurveyAgentContext> => {
    const user = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      throw new Error('Survey not found or access denied');
    }

    return {
      survey,
      questions: await listQuestions(ctx, args.surveyId),
    };
  },
});

export const getPublishedSurveyAgentContext = internalQuery({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args): Promise<SurveyAgentContext> => {
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.status !== 'published') {
      throw new Error('Survey is not available for responses');
    }

    return {
      survey,
      questions: await listQuestions(ctx, args.surveyId),
    };
  },
});

export const saveAgentSync = internalMutation({
  args: {
    surveyId: v.id('surveys'),
    agentId: v.string(),
    configHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.surveyId, {
      elevenLabsAgentId: args.agentId,
      elevenLabsAgentConfigHash: args.configHash,
      elevenLabsAgentSyncedAtMs: Date.now(),
    });
  },
});
export const getOrCreateVoiceResponse = internalMutation({
  args: { surveyId: v.id('surveys') },
  handler: async (
    ctx,
    args,
  ): Promise<{
    responseId: Id<'surveyResponses'>;
    respondentId?: Id<'users'>;
  }> => {
    const user = await getOptionalUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.status !== 'published') {
      throw new Error('Survey is not available for responses');
    }

    if (user) {
      const existing = await ctx.db
        .query('surveyResponses')
        .withIndex('by_surveyId_and_respondentId', (q) => q.eq('surveyId', args.surveyId).eq('respondentId', user._id))
        .unique();

      if (existing) {
        if (existing.status === 'completed') {
          throw new Error('Survey response already completed');
        }
        if (existing.status === 'abandoned') {
          await ctx.db.patch(existing._id, {
            status: 'in-progress',
            startedAtMs: Date.now(),
          });
        }
        return { responseId: existing._id, respondentId: user._id };
      }
    }

    const responseId = await ctx.db.insert('surveyResponses', {
      surveyId: args.surveyId,
      ...(user ? { respondentId: user._id } : {}),
      status: 'in-progress',
      startedAtMs: Date.now(),
    });

    return user ? { responseId, respondentId: user._id } : { responseId };
  },
});

export const handlePostCallWebhook = internalMutation({
  args: {
    agentId: v.string(),
    conversationId: v.string(),
    responseIdFromElevenLabsUserId: v.optional(v.string()),
    dataCollectionResults: v.array(
      v.object({
        dataCollectionId: v.string(),
        value: extractedValueValidator,
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    await ingestPostCallWebhook(ctx, args);
  },
});

async function ingestPostCallWebhook(
  ctx: MutationCtx,
  args: {
    agentId: string;
    conversationId: string;
    responseIdFromElevenLabsUserId?: string;
    dataCollectionResults: {
      dataCollectionId: string;
      value: string | number | boolean | null;
    }[];
  },
): Promise<void> {
  const byConversationId = await ctx.db
    .query('surveyResponses')
    .withIndex('by_elevenLabsConversationId', (q) => q.eq('elevenLabsConversationId', args.conversationId))
    .unique();

  const responseIdFromElevenLabsUserId = args.responseIdFromElevenLabsUserId
    ? ctx.db.normalizeId('surveyResponses', args.responseIdFromElevenLabsUserId)
    : null;
  const byElevenLabsUserId = responseIdFromElevenLabsUserId ? await ctx.db.get(responseIdFromElevenLabsUserId) : null;
  const surveyResponse = byConversationId ?? byElevenLabsUserId;

  if (!surveyResponse) {
    throw new Error('Survey response not found for ElevenLabs webhook');
  }

  const survey = await ctx.db.get(surveyResponse.surveyId);
  if (!survey || survey.elevenLabsAgentId !== args.agentId) {
    throw new Error('Webhook agent does not match survey agent');
  }

  const questions = await ctx.db
    .query('questions')
    .withIndex('by_surveyId_and_order', (q) => q.eq('surveyId', surveyResponse.surveyId))
    .order('asc')
    .collect();

  const questionsByDataCollectionId = new Map(
    questions.map((question) => [getDataCollectionId(question), question._id]),
  );

  for (const result of args.dataCollectionResults) {
    const questionId = questionsByDataCollectionId.get(result.dataCollectionId);
    if (!questionId || result.value === null) continue;

    await ctx.db
      .query('questionResponses')
      .withIndex('by_surveyResponseId_and_questionId', (q) =>
        q.eq('surveyResponseId', surveyResponse._id).eq('questionId', questionId),
      )
      .unique()
      .then(async (existing) => {
        const fields = {
          surveyResponseId: surveyResponse._id,
          questionId,
          surveyId: surveyResponse.surveyId,
          ...(surveyResponse.respondentId ? { respondentId: surveyResponse.respondentId } : {}),
          response: String(result.value),
          dataCollectionId: result.dataCollectionId,
        };

        if (existing) {
          await ctx.db.patch(existing._id, fields);
        } else {
          await ctx.db.insert('questionResponses', fields);
        }
      });
  }

  await ctx.db.patch(surveyResponse._id, {
    status: 'completed',
    completedAtMs: Date.now(),
    analysisReceivedAtMs: Date.now(),
    elevenLabsConversationId: args.conversationId,
  });
}

export const syncAgentForSurvey = action({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args): Promise<{ agentId: string; configHash: string; synced: boolean }> => {
    const context = await ctx.runQuery(internal.elevenlabs.getOwnedSurveyAgentContext, { surveyId: args.surveyId });

    return syncSurveyAgent(ctx, context);
  },
});

export const startVoiceResponse = action({
  args: { surveyId: v.id('surveys') },
  handler: async (
    ctx,
    args,
  ): Promise<{
    responseId: Id<'surveyResponses'>;
    signedUrl: string;
    agentId: string;
    surveyTitle: string;
    totalQuestions: number;
  }> => {
    const context = await ctx.runQuery(internal.elevenlabs.getPublishedSurveyAgentContext, { surveyId: args.surveyId });
    const { agentId } = await syncSurveyAgent(ctx, context);
    const response = await ctx.runMutation(internal.elevenlabs.getOrCreateVoiceResponse, { surveyId: args.surveyId });
    const signedUrl = await getSignedUrl(agentId);

    return {
      responseId: response.responseId,
      signedUrl,
      agentId,
      surveyTitle: context.survey.title,
      totalQuestions: context.questions.length,
    };
  },
});

async function syncSurveyAgent(
  ctx: ActionCtx,
  context: SurveyAgentContext,
): Promise<{ agentId: string; configHash: string; synced: boolean }> {
  const body = buildAgentCreateRequest(context);
  const configHash = stableHash(body);

  if (context.survey.elevenLabsAgentId && context.survey.elevenLabsAgentConfigHash === configHash) {
    return {
      agentId: context.survey.elevenLabsAgentId,
      configHash,
      synced: false,
    };
  }

  const agentId = await upsertElevenLabsAgent(context.survey.elevenLabsAgentId, body);

  await ctx.runMutation(internal.elevenlabs.saveAgentSync, {
    surveyId: context.survey._id,
    agentId,
    configHash,
  });

  return { agentId, configHash, synced: true };
}

function buildAgentCreateRequest(context: SurveyAgentContext): Record<string, unknown> {
  const { survey, questions } = context;
  if (questions.length === 0) {
    throw new Error('Cannot create a voice agent for a survey with no questions');
  }
  if (questions.length > MAX_DATA_COLLECTION_ITEMS) {
    throw new Error(
      `ElevenLabs data collection supports up to ${MAX_DATA_COLLECTION_ITEMS} questions in this v1 integration`,
    );
  }

  return {
    name: `SurveyHero - ${survey.title}`,
    tags: ['surveyhero', `survey_${survey._id}`],
    conversation_config: {
      agent: {
        first_message: `Thanks for taking this survey: ${survey.title}. I'll ask ${questions.length} questions. Please answer naturally, and I'll guide us through.`,
        language: 'en',
        prompt: {
          prompt: buildSurveyPrompt(survey, questions),
          llm: process.env.ELEVENLABS_AGENT_LLM ?? DEFAULT_LLM,
          temperature: 0.2,
        },
      },
      tts: {
        voice_id: process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID,
      },
    },
    platform_settings: {
      auth: {
        enable_auth: true,
      },
      data_collection: Object.fromEntries(
        questions.map((question) => [
          getDataCollectionId(question),
          {
            type: getDataCollectionType(question),
            description: getDataCollectionDescription(question),
          },
        ]),
      ),
    },
  };
}

function buildSurveyPrompt(survey: Doc<'surveys'>, questions: Doc<'questions'>[]): string {
  const questionLines = questions
    .map((question) => {
      const options =
        question.options && question.options.length > 0 ? ` Options: ${question.options.join(', ')}.` : '';
      const required = question.required ? ' Required.' : ' Optional.';
      const followUp = getFollowUpInstruction(question.followUpBehavior);
      return `${question.order}. [${getDataCollectionId(question)}] ${question.prompt}${options}${required} ${followUp}`;
    })
    .join('\n');

  return [
    'You are a voice survey interviewer for SurveyHero.',
    'Ask the respondent each survey question in order. Keep the conversation natural, concise, and neutral.',
    'Do not answer questions on behalf of the respondent, and do not invent survey answers.',
    "If the respondent is unclear, ask a short clarification according to the question's follow-up instruction.",
    'After the final question, thank the respondent and end the conversation.',
    survey.description ? `Survey description: ${survey.description}` : null,
    'Survey questions:',
    questionLines,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function getFollowUpInstruction(behavior: Doc<'questions'>['followUpBehavior']): string {
  if (behavior === 'probe-once') {
    return 'Ask at most one clarifying follow-up if the answer is incomplete.';
  }
  if (behavior === 'probe-until-answered') {
    return 'Continue with brief clarifying follow-ups until the respondent gives an answer or explicitly declines.';
  }
  return 'Do not ask a follow-up unless the respondent asks for clarification.';
}

function getDataCollectionType(question: Doc<'questions'>): 'string' | 'boolean' | 'integer' {
  if (question.type === 'rating') return 'integer';
  if (question.type === 'yes-no') return 'boolean';
  return 'string';
}

function getDataCollectionDescription(question: Doc<'questions'>): string {
  const base = `Extract the respondent's answer to this survey question: "${question.prompt}".`;

  if (question.type === 'rating') {
    return `${base} Return only the integer rating the respondent gave. Return null if no rating was provided.`;
  }
  if (question.type === 'yes-no') {
    return `${base} Return true for yes/affirmative and false for no/negative. Return null if unclear.`;
  }
  if (question.type === 'closed' && question.options?.length) {
    return `${base} Return the closest matching option from: ${question.options.join(', ')}. Return null if none was provided.`;
  }

  return `${base} Return the answer as concise text. Return null if the respondent did not answer.`;
}

function getDataCollectionId(question: Doc<'questions'>): string {
  const idSuffix = question._id.replace(/[^a-zA-Z0-9_]/g, '_').slice(-12);
  return `q${question.order}_${idSuffix}`;
}

async function upsertElevenLabsAgent(
  existingAgentId: string | undefined,
  body: Record<string, unknown>,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const url = existingAgentId
    ? `https://api.elevenlabs.io/v1/convai/agents/${existingAgentId}?enable_versioning_if_not_enabled=true`
    : 'https://api.elevenlabs.io/v1/convai/agents/create?enable_versioning=true';

  const response = await fetch(url, {
    method: existingAgentId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs agent sync failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as { agent_id?: string };
  if (!json.agent_id) throw new Error('ElevenLabs did not return an agent_id');
  return json.agent_id;
}

async function getSignedUrl(agentId: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
  url.searchParams.set('agent_id', agentId);

  const response = await fetch(url, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs signed URL request failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as { signed_url?: string };
  if (!json.signed_url) {
    throw new Error('ElevenLabs did not return a signed_url');
  }
  return json.signed_url;
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}
