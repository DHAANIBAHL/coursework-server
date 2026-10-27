// Talks to Groq's chat API (OpenAI-compatible). The key lives only in .env and
// never reaches the browser.
//
// Future MCP support: tools (MCP or otherwise) would be passed to Groq as
// `tools` in chatJson(), with a loop that runs the requested tool calls and
// sends the results back. Nothing else needs to change for the quiz flow.

const BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const TIMEOUT_MS = 45_000;

export function aiConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
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
export async function chatJson(messages, { temperature = 0.4, maxTokens = 4000 } = {}) {
  if (!aiConfigured()) {
    throw new AiError("The AI assistant isn't set up yet. Add GROQ_API_KEY to coursework-server/.env and restart the server.", 503, "AI_NOT_CONFIGURED");
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AiError(
      err.name === "TimeoutError" ? "The AI took too long to answer. Try again, or ask for fewer questions." : "Couldn't reach the AI service. Check the internet connection."
    );
  }

  if (res.status === 401) throw new AiError("The Groq API key was rejected. Check GROQ_API_KEY in coursework-server/.env.", 502, "AI_BAD_KEY");
  if (res.status === 429) throw new AiError("The AI service is busy (rate limit). Wait a moment and try again.", 429, "AI_RATE_LIMITED");
  if (!res.ok) throw new AiError(`The AI service returned an error (${res.status}). Try again.`);

  const data = await res.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content);
  } catch {
    throw new AiError("The AI's answer wasn't in the expected format. Try again.");
  }
}
