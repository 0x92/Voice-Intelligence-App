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

const buildMessages = ({ text, preset, language = "de", includeEmojis = false }) => {
  const instruction = PRESET_INSTRUCTIONS[preset] || PRESET_INSTRUCTIONS.notes;
  const outputLanguage = LANGUAGE_OUTPUT[language] || LANGUAGE_OUTPUT.de;
  const emojiInstruction = includeEmojis
    ? "Include tasteful emojis where helpful."
    : "Do not use emojis.";

  return [
    {
      role: "system",
      content: `You format transcripts into clean, usable outputs. Respond in Markdown with no preamble. Output language: ${outputLanguage}. ${emojiInstruction}`,
    },
    {
      role: "user",
      content: `${instruction}\n\nOutput language: ${outputLanguage}.\n\nTranscript:\n${text}`,
    },
  ];
};

module.exports = {
  PRESET_INSTRUCTIONS,
  LANGUAGE_OUTPUT,
  buildMessages,
};
