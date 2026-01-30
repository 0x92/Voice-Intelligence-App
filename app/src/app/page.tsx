"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Status = "idle" | "recording" | "transcribing" | "enriching" | "error";

const PRESETS = [
  { id: "notes", label: "Structured Notes" },
  { id: "summary", label: "Executive Summary" },
  { id: "todos", label: "Action Items" },
  { id: "email", label: "Polished Email" },
];

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

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [enriched, setEnriched] = useState("");
  const [preset, setPreset] = useState(PRESETS[0].id);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [showMarkdown, setShowMarkdown] = useState(false);

  const selectedDeviceRef = useRef<string>("default");
  const toggleRef = useRef<() => void>(() => {});

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

  const statusLabel = useMemo(() => {
    switch (status) {
      case "recording":
        return "Recording";
      case "transcribing":
        return "Transcribing locally...";
      case "enriching":
        return "Enriching with AI...";
      case "error":
        return "Action required";
      default:
        return "Ready";
    }
  }, [status]);

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
    loadDevices();
    const handler = () => loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, []);

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
      const enrichment = await window.voice.enrich({ text: transcript, preset });
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
        label: "Selected device",
        groupId: "",
        toJSON: () => ({}),
      } as MediaDeviceInfo,
    ];
  }, [devices, selectedDeviceId]);

  const selectedDeviceLabel = useMemo(() => {
    if (selectedDeviceId === "default") return "System default";
    const match = devices.find((device) => device.deviceId === selectedDeviceId);
    return match?.label || "Selected device";
  }, [devices, selectedDeviceId]);

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
          <div className="header">CONNECTION_LIST</div>
          <div className="data-stream">
            &gt; Voice Engine [{status === "recording" ? "RECORDING" : "READY"}]
            <br />
            &gt; Device: {selectedDeviceLabel}
            <br />
            &gt; Model: {process.env.NEXT_PUBLIC_MODEL_NAME || "ggml-base.bin"}
            <br />
            ------------------
            <br />
            Hotkeys:
            <br />
            App Toggle: Ctrl/Cmd + Shift + Space
            <br />
            Record: Ctrl/Cmd + Shift + R
          </div>
        </section>

        <section className="panel center-main">
          <div className="console-header">
            <div className="brand-line">
              <div className="brand-mark">VI</div>
              <div>
                <div className="title">OPERATOR CONSOLE</div>
                <div className="subtitle">Voice Intelligence · Local STT · OpenAI</div>
              </div>
            </div>
            <div className={`status-chip ${status === "recording" ? "live" : ""}`}>
              <span className="status-dot" />
              {statusLabel}
            </div>
          </div>

          <div className="console-grid">
            <section className="panel inner">
              <div className="header">CAPTURE_AND_TRANSCRIPT</div>
              <div className="row">
                <span>MICROPHONE</span>
                <select
                  id="micSelect"
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                >
                  {deviceOptions.length === 0 && (
                    <option value="default">No devices</option>
                  )}
                  {deviceOptions.length > 0 && (
                    <option value="default">System default</option>
                  )}
                  {deviceOptions.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="oscilloscope">
                <canvas ref={canvasMainRef} width={600} height={120} />
                <div className="oscillo-label">AUDIO_IN: CH_01</div>
              </div>

              <button
                className={`record-btn ${status === "recording" ? "active" : ""}`}
                onClick={toggleRecording}
              >
                {status === "recording" ? "STOP" : "RECORD"}
              </button>

              <div className="block">
                {transcript || "No transcript yet. Start recording to capture."}
              </div>

              <div className="actions">
                <button onClick={() => copyText(transcript)}>Copy transcript</button>
                <button
                  onClick={() => {
                    setTranscript("");
                    setEnriched("");
                    setError(null);
                    setStatus("idle");
                  }}
                >
                  Clear
                </button>
              </div>
            </section>

            <section className="panel inner">
              <div className="header">AI_ENRICHMENT</div>
              <div className="preset-grid">
                {PRESETS.map((item) => (
                  <button
                    key={item.id}
                    className={`preset ${preset === item.id ? "active" : ""}`}
                    onClick={() => setPreset(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="markdown-toggle">
                <button
                  className={!showMarkdown ? "active" : ""}
                  onClick={() => setShowMarkdown(false)}
                >
                  Rendered
                </button>
                <button
                  className={showMarkdown ? "active" : ""}
                  onClick={() => setShowMarkdown(true)}
                >
                  Markdown
                </button>
              </div>

              <div className="block markdown">
                {showMarkdown ? (
                  <pre className="markdown-raw">
                    {enriched || "No output yet. Speak to generate enrichment."}
                  </pre>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body">
                    {enriched || "No output yet. Speak to generate enrichment."}
                  </ReactMarkdown>
                )}
              </div>

              <div className="actions">
                <button onClick={() => copyText(enriched)}>Copy output</button>
                <button onClick={rerunEnrichment}>Re-run</button>
              </div>
            </section>
          </div>
        </section>

        <section className="panel">
          <div className="header">SYSTEM_LOG</div>
          <div className="log-line">
            <span className={`status-dot ${status === "recording" ? "live" : ""}`} />
            Status: {statusLabel}
          </div>
          <div className="mini-wave">
            <span>STREAM</span>
            <canvas ref={canvasMiniRef} width={160} height={32} />
          </div>
          <div className="data-stream">
            [14:02] Initializing voice engine...
            <br />
            [14:03] Local model ready.
            <br />
            [14:03] OpenAI channel ready.
            <br />
            [14:04] Hotkeys registered.
          </div>
        </section>

        <section className="panel">
          <div className="header">CODE_FRAGMENTS</div>
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
          <div className="header">LOCAL_MAP</div>
          <div className="data-stream">
            Audio: Local device
            <br />
            STT: whisper.cpp
            <br />
            LLM: {process.env.NEXT_PUBLIC_LLM_NAME || "OpenAI"}
            <br />
            Output: Markdown
          </div>
        </section>
      </div>

      {error && <div className="error-bar">Error: {error}</div>}
    </main>
  );
}
