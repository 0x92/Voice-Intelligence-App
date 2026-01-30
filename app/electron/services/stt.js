const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

const resolveWhisperBinary = () => {
  const whisperPath = process.env.WHISPER_CPP_PATH;
  if (!whisperPath) {
    throw new Error("WHISPER_CPP_PATH is not set.");
  }
  if (!fs.existsSync(whisperPath)) {
    throw new Error(`Whisper binary not found at ${whisperPath}`);
  }
  return whisperPath;
};

const resolveWhisperModel = () => {
  const modelPath = process.env.WHISPER_MODEL_PATH;
  if (!modelPath) {
    throw new Error("WHISPER_MODEL_PATH is not set.");
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Whisper model not found at ${modelPath}`);
  }
  return modelPath;
};

const convertToWav = (inputPath, outputPath) =>
  new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec("pcm_s16le")
      .format("wav")
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });

const runWhisper = (whisperPath, modelPath, wavPath, outputBase) =>
  new Promise((resolve, reject) => {
    const extraArgs = process.env.WHISPER_CPP_ARGS
      ? process.env.WHISPER_CPP_ARGS.split(" ")
      : [];
    const args = [
      "-m",
      modelPath,
      "-f",
      wavPath,
      "-otxt",
      "-of",
      outputBase,
      ...extraArgs,
    ];

    const proc = spawn(whisperPath, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    const timeoutMs = Number(process.env.WHISPER_TIMEOUT_MS || 120000);
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Whisper timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Whisper exited with code ${code}`));
        return;
      }
      resolve({ stderr, stdout });
    });
  });

const findOutputFile = (outputBase, wavPath) => {
  const candidates = [
    `${outputBase}.txt`,
    path.join(process.cwd(), `${path.basename(outputBase)}.txt`),
    path.join(process.cwd(), `${path.basename(wavPath)}.txt`),
    `${wavPath}.txt`,
    path.join(os.tmpdir(), `${path.basename(wavPath, ".wav")}.txt`),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

const transcribeAudioBuffer = async ({ buffer, mimeType }) => {
  if (!buffer) {
    throw new Error("Missing audio payload");
  }

  const id = crypto.randomUUID();
  const extension = mimeType && mimeType.includes("ogg") ? "ogg" : "webm";
  const inputPath = path.join(os.tmpdir(), `voice-input-${id}.${extension}`);
  const wavPath = path.join(os.tmpdir(), `voice-input-${id}.wav`);
  const outputBase = path.join(os.tmpdir(), `voice-output-${id}`);
  const outputTxt = `${outputBase}.txt`;

  try {
    await fs.promises.writeFile(inputPath, Buffer.from(buffer));
    await convertToWav(inputPath, wavPath);
    const whisperPath = resolveWhisperBinary();
    const modelPath = resolveWhisperModel();
    const runInfo = await runWhisper(whisperPath, modelPath, wavPath, outputBase);

    const resolvedOutput = findOutputFile(outputBase, wavPath);
    if (!resolvedOutput) {
      const hint =
        "Whisper output not found. Ensure WHISPER_CPP_PATH points to whisper.cpp and supports -otxt/-of.";
      const details = runInfo?.stderr || runInfo?.stdout || "";
      throw new Error(details ? `${hint} ${details.trim()}` : hint);
    }

    const text = (await fs.promises.readFile(resolvedOutput, "utf8")).trim();
    return { text };
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(inputPath),
      fs.promises.unlink(wavPath),
      fs.promises.unlink(outputTxt),
      fs.promises.unlink(path.join(process.cwd(), `${path.basename(outputBase)}.txt`)),
      fs.promises.unlink(path.join(process.cwd(), `${path.basename(wavPath)}.txt`)),
      fs.promises.unlink(`${wavPath}.txt`),
      fs.promises.unlink(path.join(os.tmpdir(), `${path.basename(wavPath, ".wav")}.txt`)),
    ]);
  }
};

module.exports = { transcribeAudioBuffer };
