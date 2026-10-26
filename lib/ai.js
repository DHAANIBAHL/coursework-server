// Talks to whichever AI provider has a key in .env: Gemini, OpenAI, Anthropic
// (Claude), or Groq. Keys live only in .env and never reach the browser.
//
// The provider is AI_PROVIDER if set, otherwise the first one in PROVIDERS
// whose key is present. AI_MODEL overrides the provider's default model.
//
// Future MCP support: tools (MCP or otherwise) would be passed to the provider
// in chatJson(), with a loop that runs the requested tool calls and sends the
// results back. Nothing else needs to change for the quiz flow.
import Anthropic from "@anthropic-ai/sdk";

const TIMEOUT_MS = 90_000;

// The JSON every provider must answer with (see SYSTEM_PROMPT in routes/ai.js).
const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    quiz: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            title: { type: "string" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                  correctIndex: { type: "integer" },
                  explanation: { type: "string" },
                },
                required: ["prompt", "options", "correctIndex", "explanation"],
                additionalProperties: false,
              },
            },
          },
          required: ["title", "questions"],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ["reply", "quiz"],
  additionalProperties: false,
};

// In order of preference when several keys are set. Groq is last because its
// free tier runs out quickly for quiz-sized answers.
const PROVIDERS = {
  gemini: { name: "Gemini", keyVar: "GEMINI_API_KEY", model: "gemini-flash-latest", call: callGemini },
  openai: { name: "OpenAI", keyVar: "OPENAI_API_KEY", model: "gpt-5-mini", call: callOpenAiStyle },
  anthropic: { name: "Claude", keyVar: "ANTHROPIC_API_KEY", model: "claude-opus-5-5", call: callAnthropic },
  groq: { name: "Groq", keyVar: "GROQ_API_KEY", model: "openai/gpt-oss-120b", call: callOpenAiStyle },
};

function provider() {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  const id = forced && PROVIDERS[forced] ? forced : Object.keys(PROVIDERS).find((p) => process.env[PROVIDERS[p].keyVar]);
  if (!id || !process.env[PROVIDERS[id].keyVar]) return null;
  const p = PROVIDERS[id];
  // GROQ_MODEL still works for setups made before AI_MODEL existed.
  const model = process.env.AI_MODEL || (id === "groq" && process.env.GROQ_MODEL) || p.model;
  return { id, ...p, key: process.env[p.keyVar], model };
}

export function aiConfigured() {
  return provider() !== null;
}

// Which provider and model are in use, for the status endpoint (never the key).
export function aiInfo() {
  const p = provider();
  return p ? { provider: p.name, model: p.model } : null;
}

export class AiError extends Error {
  constructor(message, status = 502, code = "AI_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Sends a conversation and returns the model's reply parsed as JSON.
// `messages`: [{ role: "system" | "user" | "assistant", content }]
export async function chatJson(messages, { temperature = 0.4 } = {}) {
  const p = provider();
  if (!p) {
    throw new AiError(
      "The AI assistant isn't set up yet. Add an AI key (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY) to coursework-server/.env and restart the server.",
      503,
      "AI_NOT_CONFIGURED"
    );
  }
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");

  const text = await p.call(p, system, turns, temperature);
  try {
    // Some models wrap JSON in a code fence even when asked not to.
    return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new AiError("The AI's answer wasn't in the expected format. Try again.");
  }
}

// Turns an HTTP status from any provider into a message a teacher can act on.
function statusError(p, status, detail = "") {
  if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(detail))) {
    return new AiError(`The ${p.name} API key was rejected. Check ${p.keyVar} in coursework-server/.env.`, 502, "AI_BAD_KEY");
  }
  if (status === 404) {
    return new AiError(
      `${p.name} doesn't offer the model "${p.model}" (or your key can't use it). Set AI_MODEL in coursework-server/.env to one your account has and restart the server.`,
      502,
      "AI_BAD_MODEL"
    );
  }
  if (status === 429) {
    return new AiError(`${p.name} says you've hit its usage limit. Wait a minute and try again, or check your plan's limits.`, 429, "AI_RATE_LIMITED");
  }
  if (status === 402) return new AiError(`Your ${p.name} account is out of credit. Add billing, then try again.`, 502, "AI_NO_CREDIT");
  return new AiError(`The AI service returned an error (${status}). Try again.`);
}

function networkError(err) {
  return new AiError(
    err?.name === "TimeoutError" || err instanceof Anthropic.APIConnectionTimeoutError
      ? "The AI took too long to answer. Try again, or ask for fewer questions."
      : "Couldn't reach the AI service. Check the server's internet connection."
  );
}

async function post(p, url, headers, body) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok) throw statusError(p, res.status, await res.text().catch(() => ""));
  return res.json().catch(() => null);
}

// Gemini's own API, with JSON output turned on.
async function callGemini(p, system, turns, temperature) {
  const data = await post(
    p,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`,
    { "x-goog-api-key": p.key },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature, maxOutputTokens: 16000, responseMimeType: "application/json" },
    }
  );
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
}

// OpenAI's chat API; Groq speaks the same format at a different address.
async function callOpenAiStyle(p, system, turns, temperature) {
  const isGroq = p.id === "groq";
  const base = isGroq ? process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1" : "https://api.openai.com/v1";
  const data = await post(
    p,
    `${base}/chat/completions`,
    { authorization: `Bearer ${p.key}` },
    {
      model: p.model,
      messages: [{ role: "system", content: system }, ...turns],
      response_format: { type: "json_object" },
      // OpenAI's reasoning models only accept the default temperature and
      // count their thinking against max_completion_tokens.
      ...(isGroq ? { temperature, max_tokens: 4000 } : { max_completion_tokens: 16000 }),
    }
  );
  return data?.choices?.[0]?.message?.content;
}

// Models that accept Anthropic's server-side refusal fallback.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

// Claude, through the official SDK. The JSON schema guarantees the shape.
async function callAnthropic(p, system, turns) {
  const client = new Anthropic({ apiKey: p.key, timeout: TIMEOUT_MS, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.create({
      model: p.model,
      max_tokens: 16000,
      system,
      messages: turns,
      output_config: { effort: "medium", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      // If the model declines, Anthropic retries on a suitable model in the same call.
      ...(FALLBACK_MODELS.has(p.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionError) throw networkError(err);
    if (err instanceof Anthropic.APIError) throw statusError(p, err.status, err.message);
    throw err;
  }
  if (response.stop_reason === "refusal") {
    throw new AiError("The AI declined to write that. Try rephrasing the topic.", 502, "AI_REFUSED");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError("The AI's answer was too long and got cut off. Ask for fewer questions.");
  }
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}
