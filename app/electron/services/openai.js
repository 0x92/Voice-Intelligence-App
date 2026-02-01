const { buildMessages } = require("./prompts");

let clientPromise = null;

const getClient = async () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  if (!clientPromise) {
    clientPromise = import("openai").then((mod) => {
      const OpenAI = mod.default ?? mod;
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    });
  }
  return clientPromise;
};

const enrichText = async ({
  text,
  preset,
  language = "de",
  includeEmojis = false,
}) => {
  if (!text) {
    throw new Error("Missing text to enrich");
  }

  const client = await getClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: buildMessages({ text, preset, language, includeEmojis }),
  });

  const output = completion.choices?.[0]?.message?.content?.trim() ?? "";
  return { output };
};

module.exports = { enrichText };
