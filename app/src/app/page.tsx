"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Status = "idle" | "recording" | "transcribing" | "enriching" | "error";
type Language = "de" | "en";

const PRESETS = [
  {
    id: "notes",
    labels: {
      de: "Strukturierte Notizen",
      en: "Structured Notes",
    },
  },
  {
    id: "summary",
    labels: {
      de: "Management-Zusammenfassung",
      en: "Executive Summary",
    },
  },
  {
    id: "todos",
    labels: {
      de: "Aktionspunkte",
      en: "Action Items",
    },
  },
  {
    id: "email",
    labels: {
      de: "Ueberarbeitete E-Mail",
      en: "Polished Email",
    },
  },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

const UI_TEXT = {
  de: {
    headers: {
      connection: "VERBINDUNG_LISTE",
      capture: "AUFNAHME_UND_TRANSKRIPT",
      enrichment: "KI_ANREICHERUNG",
      systemLog: "SYSTEM_PROTOKOLL",
      codeFragments: "CODE_FRAGMENTE",
      localMap: "LOKALE_KARTE",
    },
    console: {
      title: "OPERATOR KONSOLE",
      subtitle: "Voice Intelligence - Lokales STT - OpenAI",
    },
    language: {
      label: "SPRACHE",
    },
    errors: {
      label: "Fehler",
    },
    status: {
      idle: "Bereit",
      recording: "Aufnahme laeuft",
      transcribing: "Lokal transkribiert...",
      enriching: "KI-Anreicherung...",
      error: "Aktion erforderlich",
    },
    connection: {
      voiceEngine: "Sprach-Engine",
      recording: "AUFNAHME",
      ready: "BEREIT",
      device: "Geraet",
      model: "Modell",
      hotkeys: "Tastenkurzel",
      appToggle: "App Umschalten",
      record: "Aufnahme",
    },
    microphone: {
      label: "MIKROFON",
      noDevices: "Keine Geraete",
      systemDefault: "Systemstandard",
      selectedDevice: "Ausgewaehltes Geraet",
      fallbackDevice: "Mikrofon",
    },
    oscilloscope: {
      label: "AUDIO_EINGANG: CH_01",
    },
    controls: {
      record: "AUFNEHMEN",
      stop: "STOPP",
      copyTranscript: "Transkript kopieren",
      clear: "Zuruecksetzen",
      copyOutput: "Ausgabe kopieren",
      rerun: "Neu ausfuehren",
    },
    placeholders: {
      transcript: "Noch kein Transkript. Aufnahme starten, um zu erfassen.",
      enrichment: "Noch keine Ausgabe. Sprich, um eine Anreicherung zu erzeugen.",
    },
    transcriptStats: {
      words: "Woerter",
      readTime: "Lesedauer",
      speakTime: "Sprechdauer",
    },
    enrichmentOptions: {
      emojis: "Emojis verwenden",
    },
    toggles: {
      rendered: "Gerendert",
      markdown: "Markdown",
    },
    system: {
      status: "Status",
      stream: "DATENSTROM",
      logLines: [
        "[14:02] Initialisiere Sprach-Engine...",
        "[14:03] Lokales Modell bereit.",
        "[14:03] OpenAI-Kanal bereit.",
        "[14:04] Tastenkurzel registriert.",
      ],
    },
    localMap: {
      audio: "Audio",
      localDevice: "Lokales Geraet",
      stt: "STT",
      llm: "LLM",
      output: "Ausgabe",
      outputFormat: "Markdown",
    },
  },
  en: {
    headers: {
      connection: "CONNECTION_LIST",
      capture: "CAPTURE_AND_TRANSCRIPT",
      enrichment: "AI_ENRICHMENT",
      systemLog: "SYSTEM_LOG",
      codeFragments: "CODE_FRAGMENTS",
      localMap: "LOCAL_MAP",
    },
    console: {
      title: "OPERATOR CONSOLE",
      subtitle: "Voice Intelligence - Local STT - OpenAI",
    },
    language: {
      label: "LANGUAGE",
    },
    errors: {
      label: "Error",
    },
    status: {
      idle: "Ready",
      recording: "Recording",
      transcribing: "Transcribing locally...",
      enriching: "Enriching with AI...",
      error: "Action required",
    },
    connection: {
      voiceEngine: "Voice Engine",
      recording: "RECORDING",
      ready: "READY",
      device: "Device",
      model: "Model",
      hotkeys: "Hotkeys",
      appToggle: "App Toggle",
      record: "Record",
    },
    microphone: {
      label: "MICROPHONE",
      noDevices: "No devices",
      systemDefault: "System default",
      selectedDevice: "Selected device",
      fallbackDevice: "Microphone",
    },
    oscilloscope: {
      label: "AUDIO_IN: CH_01",
    },
    controls: {
      record: "RECORD",
      stop: "STOP",
      copyTranscript: "Copy transcript",
      clear: "Clear",
      copyOutput: "Copy output",
      rerun: "Re-run",
    },
    placeholders: {
      transcript: "No transcript yet. Start recording to capture.",
      enrichment: "No output yet. Speak to generate enrichment.",
    },
    transcriptStats: {
      words: "Words",
      readTime: "Read time",
      speakTime: "Speak time",
    },
    enrichmentOptions: {
      emojis: "Include emojis",
    },
    toggles: {
      rendered: "Rendered",
      markdown: "Markdown",
    },
    system: {
      status: "Status",
      stream: "STREAM",
      logLines: [
        "[14:02] Initializing voice engine...",
        "[14:03] Local model ready.",
        "[14:03] OpenAI channel ready.",
        "[14:04] Hotkeys registered.",
      ],
    },
    localMap: {
      audio: "Audio",
      localDevice: "Local device",
      stt: "STT",
      llm: "LLM",
      output: "Output",
      outputFormat: "Markdown",
    },
  },
} as const;

const pickMimeType = () => {
  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
};

const drawWaveform = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8Array,
  stroke = "#00ff7a"
) => {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  const sliceWidth = width / data.length;
  let x = 0;
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i] / 128.0;
    const y = (v * height) / 2;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    x += sliceWidth;
  }
  ctx.lineTo(width, height / 2);
  ctx.stroke();
};

const WORDS_PER_MINUTE_READ = 200;
const WORDS_PER_MINUTE_SPEAK = 130;

const countWords = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [enriched, setEnriched] = useState("");
  const [preset, setPreset] = useState<PresetId>(PRESETS[0].id);
  const [language, setLanguage] = useState<Language>("de");
  const [includeEmojis, setIncludeEmojis] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [showMarkdown, setShowMarkdown] = useState(false);

  const text = UI_TEXT[language];

  const selectedDeviceRef = useRef<string>("default");
  const toggleRef = useRef<() => void>(() => {});
  const languageRef = useRef<Language>("de");
  const includeEmojisRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  const canvasMainRef = useRef<HTMLCanvasElement | null>(null);
  const canvasMiniRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const freqArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastLevelSentRef = useRef<number>(0);

  const statusLabel = useMemo(() => text.status[status], [status, text]);

  const transcriptWordCount = useMemo(() => countWords(transcript), [transcript]);
  const readTime = useMemo(
    () => formatDuration((transcriptWordCount / WORDS_PER_MINUTE_READ) * 60),
    [transcriptWordCount]
  );
  const speakTime = useMemo(
    () => formatDuration((transcriptWordCount / WORDS_PER_MINUTE_SPEAK) * 60),
    [transcriptWordCount]
  );

  const loadDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = list.filter((device) => device.kind === "audioinput");
      setDevices(audioInputs);
      if (!selectedDeviceRef.current) {
        const nextDefault = audioInputs[0]?.deviceId ?? "default";
        selectedDeviceRef.current = nextDefault;
        setSelectedDeviceId(nextDefault);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("voice:selectedDeviceId");
    if (saved) {
      selectedDeviceRef.current = saved;
      setSelectedDeviceId(saved);
    }
    const savedLanguage = window.localStorage.getItem("voice:language");
    if (savedLanguage === "de" || savedLanguage === "en") {
      setLanguage(savedLanguage);
    }
    const savedEmojis = window.localStorage.getItem("voice:includeEmojis");
    if (savedEmojis === "true" || savedEmojis === "false") {
      setIncludeEmojis(savedEmojis === "true");
    }
    loadDevices();
    const handler = () => loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("voice:language", language);
    document.documentElement.lang = language;
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem("voice:includeEmojis", String(includeEmojis));
    includeEmojisRef.current = includeEmojis;
  }, [includeEmojis]);

  useEffect(() => {
    selectedDeviceRef.current = selectedDeviceId;
    window.localStorage.setItem("voice:selectedDeviceId", selectedDeviceId);
  }, [selectedDeviceId]);

  const startVisualizer = (stream: MediaStream) => {
    const canvasMain = canvasMainRef.current;
    const canvasMini = canvasMiniRef.current;
    if (!canvasMain) return;

    stopVisualizer();

    const AudioContextCtor =
      window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.fftSize);
    freqArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    const ctxMain = canvasMain.getContext("2d");
    const ctxMini = canvasMini?.getContext("2d");
    if (!ctxMain) return;

    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      const data = dataArrayRef.current;
      analyserRef.current.getByteTimeDomainData(data);

      drawWaveform(ctxMain, canvasMain.width, canvasMain.height, data, "#00ff7a");
      if (ctxMini && canvasMini) {
        drawWaveform(ctxMini, canvasMini.width, canvasMini.height, data, "#00ff7a");
      }

      const now = Date.now();
      if (now - lastLevelSentRef.current > 80 && window.voice?.setRecordingLevel) {
        const freq = freqArrayRef.current;
        if (freq) {
          analyserRef.current.getByteFrequencyData(freq);
          let sum = 0;
          const samples = Math.min(64, freq.length);
          for (let i = 0; i < samples; i += 1) {
            sum += freq[i];
          }
          const avg = sum / samples;
          const level = Math.min(1, avg / 160);
          window.voice.setRecordingLevel({ level });
        }
        lastLevelSentRef.current = now;
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    draw();
  };

  const stopVisualizer = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
    freqArrayRef.current = null;

    [canvasMainRef.current, canvasMiniRef.current].forEach((canvas) => {
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    if (window.voice?.setRecordingLevel) {
      window.voice.setRecordingLevel({ level: 0 });
    }
  };

  const startRecording = async () => {
    setError(null);
    setEnriched("");
    try {
      const constraints =
        selectedDeviceId && selectedDeviceId !== "default"
          ? { audio: { deviceId: { exact: selectedDeviceId } } }
          : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setStatus("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          const arrayBuffer = await blob.arrayBuffer();

          if (!window.voice) {
            throw new Error("Electron bridge unavailable.");
          }

          const response = await window.voice.transcribe({
            buffer: new Uint8Array(arrayBuffer),
            mimeType: mimeTypeRef.current,
          });

          const nextTranscript = response?.text?.trim() ?? "";
          setTranscript(nextTranscript);

          if (nextTranscript) {
            setStatus("enriching");
            const enrichment = await window.voice.enrich({
              text: nextTranscript,
              preset,
              language: languageRef.current,
              includeEmojis: includeEmojisRef.current,
            });
            setEnriched(enrichment?.output ?? "");
          } else {
            setEnriched("");
          }

          setStatus("idle");
        } catch (err) {
          console.error(err);
          setStatus("error");
          setError((err as Error).message);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      startVisualizer(stream);
      setStatus("recording");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError((err as Error).message);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    stopVisualizer();
    recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());
  };

  const toggleRecording = () => {
    if (status === "recording") {
      stopRecording();
    } else if (status === "idle" || status === "error") {
      startRecording();
    }
  };

  useEffect(() => {
    toggleRef.current = toggleRecording;
  });

  useEffect(() => {
    if (!window.voice?.onToggleRecord) return;
    const handler = () => toggleRef.current();
    window.voice.onToggleRecord(handler);
  }, []);

  const copyText = async (value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  };

  const rerunEnrichment = async () => {
    if (!transcript || !window.voice) return;
    setStatus("enriching");
    try {
      const enrichment = await window.voice.enrich({
        text: transcript,
        preset,
        language,
        includeEmojis,
      });
      setEnriched(enrichment?.output ?? "");
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError((err as Error).message);
    }
  };

  const deviceOptions = useMemo(() => {
    if (selectedDeviceId === "default") {
      return devices;
    }
    const exists = devices.some((device) => device.deviceId === selectedDeviceId);
    if (exists) {
      return devices;
    }
    return [
      ...devices,
      {
        deviceId: selectedDeviceId,
        kind: "audioinput",
        label: text.microphone.selectedDevice,
        groupId: "",
        toJSON: () => ({}),
      } as MediaDeviceInfo,
    ];
  }, [devices, selectedDeviceId, text.microphone.selectedDevice]);

  const selectedDeviceLabel = useMemo(() => {
    if (selectedDeviceId === "default") return text.microphone.systemDefault;
    const match = devices.find((device) => device.deviceId === selectedDeviceId);
    return match?.label || text.microphone.selectedDevice;
  }, [devices, selectedDeviceId, text.microphone.selectedDevice, text.microphone.systemDefault]);

  useEffect(() => {
    if (!window.voice?.setRecordingState) return;
    if (status === "recording") {
      window.voice.setRecordingState({
        active: true,
        deviceLabel: selectedDeviceLabel,
      });
    } else {
      window.voice.setRecordingState({ active: false });
    }
  }, [status, selectedDeviceLabel]);

  return (
    <main className="matrix">
      <div className="screen-grid">
        <section className="panel">
          <div className="header">{text.headers.connection}</div>
          <div className="data-stream">
            &gt; {text.connection.voiceEngine} [
            {status === "recording" ? text.connection.recording : text.connection.ready}]
            <br />
            &gt; {text.connection.device}: {selectedDeviceLabel}
            <br />
            &gt; {text.connection.model}:{" "}
            {process.env.NEXT_PUBLIC_MODEL_NAME || "ggml-base.bin"}
            <br />
            ------------------
            <br />
            {text.connection.hotkeys}:
            <br />
            {text.connection.appToggle}: Ctrl/Cmd + Shift + Space
            <br />
            {text.connection.record}: Ctrl/Cmd + Shift + R
          </div>
        </section>

        <section className="panel center-main">
          <div className="console-header">
            <div className="brand-line">
              <div className="brand-mark">VI</div>
              <div>
                <div className="title">{text.console.title}</div>
                <div className="subtitle">{text.console.subtitle}</div>
              </div>
            </div>
            <div className="console-actions">
              <div className="language-toggle">
                <span>{text.language.label}</span>
                <button
                  className={language === "de" ? "active" : ""}
                  onClick={() => setLanguage("de")}
                >
                  DE
                </button>
                <button
                  className={language === "en" ? "active" : ""}
                  onClick={() => setLanguage("en")}
                >
                  EN
                </button>
              </div>
              <div className={`status-chip ${status === "recording" ? "live" : ""}`}>
                <span className="status-dot" />
                {statusLabel}
              </div>
            </div>
          </div>

          <div className="console-grid">
            <section className="panel inner">
              <div className="header">{text.headers.capture}</div>
              <div className="row">
                <span>{text.microphone.label}</span>
                <select
                  id="micSelect"
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                >
                  {deviceOptions.length === 0 && (
                    <option value="default">{text.microphone.noDevices}</option>
                  )}
                  {deviceOptions.length > 0 && (
                    <option value="default">{text.microphone.systemDefault}</option>
                  )}
                  {deviceOptions.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `${text.microphone.fallbackDevice} ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="oscilloscope">
                <canvas ref={canvasMainRef} width={600} height={120} />
                <div className="oscillo-label">{text.oscilloscope.label}</div>
              </div>

              <button
                className={`record-btn ${status === "recording" ? "active" : ""}`}
                onClick={toggleRecording}
              >
                {status === "recording" ? text.controls.stop : text.controls.record}
              </button>

              <div className="block transcript">
                {transcript || text.placeholders.transcript}
              </div>
              <div className="transcript-meta">
                <span>
                  {text.transcriptStats.words}: {transcriptWordCount}
                </span>
                <span>
                  {text.transcriptStats.readTime}: {readTime}
                </span>
                <span>
                  {text.transcriptStats.speakTime}: {speakTime}
                </span>
              </div>

              <div className="actions">
                <button onClick={() => copyText(transcript)}>
                  {text.controls.copyTranscript}
                </button>
                <button
                  onClick={() => {
                    setTranscript("");
                    setEnriched("");
                    setError(null);
                    setStatus("idle");
                  }}
                >
                  {text.controls.clear}
                </button>
              </div>
            </section>

            <section className="panel inner">
              <div className="header">{text.headers.enrichment}</div>
              <div className="preset-grid">
                {PRESETS.map((item) => (
                  <button
                    key={item.id}
                    className={`preset ${preset === item.id ? "active" : ""}`}
                    onClick={() => setPreset(item.id)}
                  >
                    {item.labels[language]}
                  </button>
                ))}
              </div>

              <div className="option-row">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={includeEmojis}
                    onChange={(event) => setIncludeEmojis(event.target.checked)}
                  />
                  <span>{text.enrichmentOptions.emojis}</span>
                </label>
              </div>

              <div className="markdown-toggle">
                <button
                  className={!showMarkdown ? "active" : ""}
                  onClick={() => setShowMarkdown(false)}
                >
                  {text.toggles.rendered}
                </button>
                <button
                  className={showMarkdown ? "active" : ""}
                  onClick={() => setShowMarkdown(true)}
                >
                  {text.toggles.markdown}
                </button>
              </div>

              <div className="block markdown">
                {showMarkdown ? (
                  <pre className="markdown-raw">
                    {enriched || text.placeholders.enrichment}
                  </pre>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body">
                    {enriched || text.placeholders.enrichment}
                  </ReactMarkdown>
                )}
              </div>

              <div className="actions">
                <button onClick={() => copyText(enriched)}>
                  {text.controls.copyOutput}
                </button>
                <button onClick={rerunEnrichment}>{text.controls.rerun}</button>
              </div>
            </section>
          </div>
        </section>

        <section className="panel">
          <div className="header">{text.headers.systemLog}</div>
          <div className="log-line">
            <span className={`status-dot ${status === "recording" ? "live" : ""}`} />
            {text.system.status}: {statusLabel}
          </div>
          <div className="mini-wave">
            <span>{text.system.stream}</span>
            <canvas ref={canvasMiniRef} width={160} height={32} />
          </div>
          <div className="data-stream">
            {text.system.logLines.map((line, index) => (
              <span key={`${line}-${index}`}>
                {line}
                {index < text.system.logLines.length - 1 && <br />}
              </span>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="header">{text.headers.codeFragments}</div>
          <div className="data-stream small">
            0x4F 0x9A 0x12 0xBB
            <br />
            0xCC 0xDD 0xEE 0xFF
            <br />
            function enrich() &#123;
            <br />
            &nbsp;&nbsp;return output;
            <br />
            &#125;
          </div>
        </section>

        <section className="panel">
          <div className="header">{text.headers.localMap}</div>
          <div className="data-stream">
            {text.localMap.audio}: {text.localMap.localDevice}
            <br />
            {text.localMap.stt}: whisper.cpp
            <br />
            {text.localMap.llm}: {process.env.NEXT_PUBLIC_LLM_NAME || "OpenAI"}
            <br />
            {text.localMap.output}: {text.localMap.outputFormat}
          </div>
        </section>
      </div>

      {error && (
        <div className="error-bar">
          {text.errors.label}: {error}
        </div>
      )}
    </main>
  );
}
