const { buildMessages } = require("./prompts");

const normalizeBaseUrl = (value) => value.replace(/\/+$/, "");

const enrichText = async ({
  text,
  preset,
  language = "de",
  includeEmojis = false,
}) => {
  if (!text) {
    throw new Error("Missing text to enrich");
  }

  const baseUrl = normalizeBaseUrl(
    process.env.OLLAMA_BASE_URL || "http://localhost:11434"
  );
  const model = process.env.OLLAMA_MODEL || "llama3.1:8b";
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available in this runtime.");
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: buildMessages({ text, preset, language, includeEmojis }),
      stream: false,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      details
        ? `Ollama error (${response.status}): ${details}`
        : `Ollama error (${response.status})`
    );
  }

  const data = await response.json();
  const output = data?.message?.content?.trim() ?? "";
  return { output };
};

module.exports = { enrichText };
