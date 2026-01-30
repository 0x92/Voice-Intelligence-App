const PRESET_INSTRUCTIONS = {
  notes:
    "Return structured notes with headings, bullets, and key decisions. Keep it concise.",
  summary:
    "Return a concise executive summary (3-5 sentences) plus 3 bullet highlights.",
  todos:
    "Extract action items as a checklist. Include owners and deadlines if mentioned.",
  email:
    "Rewrite as a polished professional email with a subject line and short closing.",
};

const LANGUAGE_OUTPUT = {
  de: "German",
  en: "English",
};

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

const enrichText = async ({ text, preset, language = "de" }) => {
  if (!text) {
    throw new Error("Missing text to enrich");
  }

  const client = await getClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const instruction = PRESET_INSTRUCTIONS[preset] || PRESET_INSTRUCTIONS.notes;
  const outputLanguage = LANGUAGE_OUTPUT[language] || LANGUAGE_OUTPUT.de;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You format transcripts into clean, usable outputs. Respond in Markdown with no preamble. Output language: ${outputLanguage}.`,
      },
      {
        role: "user",
        content: `${instruction}\n\nOutput language: ${outputLanguage}.\n\nTranscript:\n${text}`,
      },
    ],
  });

  const output = completion.choices?.[0]?.message?.content?.trim() ?? "";
  return { output };
};

module.exports = { enrichText };
