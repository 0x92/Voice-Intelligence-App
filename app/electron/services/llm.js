const { enrichText: enrichWithOpenAI } = require("./openai");
const { enrichText: enrichWithOllama } = require("./ollama");

const resolveProvider = (value) => {
  if (!value) return "openai";
  const normalized = String(value).toLowerCase();
  if (normalized === "ollama") return "ollama";
  return "openai";
};

const enrichText = async (payload) => {
  const provider = resolveProvider(payload?.provider || process.env.LLM_PROVIDER);
  if (provider === "ollama") {
    return enrichWithOllama(payload);
  }
  return enrichWithOpenAI(payload);
};

module.exports = { enrichText };
