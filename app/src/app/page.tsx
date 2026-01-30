"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [enriched, setEnriched] = useState("");
  const [preset, setPreset] = useState(PRESETS[0].id);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const selectedDeviceRef = useRef<string>("default");
  const toggleRef = useRef<() => void>(() => {});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const freqArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastLevelSentRef = useRef<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  const statusLabel = useMemo(() => {
    switch (status) {
      case "recording":
        return "Listening...";
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

  const startVisualizer = (stream: MediaStream) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      const data = dataArrayRef.current;
      analyserRef.current.getByteTimeDomainData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ef4444";
      ctx.beginPath();
      const sliceWidth = canvas.width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = data[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
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
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (window.voice?.setRecordingLevel) {
      window.voice.setRecordingLevel({ level: 0 });
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

  return (
    <main>
      <div className="bg-orbs" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="app-shell">
        <div className="top-bar">
          <div className="brand">
            <div className="brand-mark">VI</div>
            <div>
              <h1>Voice Intelligence</h1>
              <div className="hint">
                Hotkeys: Toggle App (Ctrl/Cmd + Shift + Space) · Record (Ctrl/Cmd + Shift + R)
              </div>
            </div>
          </div>
          {status === "recording" ? (
            <div className="recording-pill">
              <span className="record-dot" />
              <span>Recording</span>
              <canvas ref={canvasRef} width={120} height={26} />
            </div>
          ) : (
            <div className="meta-pill">Whisper.cpp - OpenAI Enrichment</div>
          )}
        </div>

        <div className="grid">
          <section className="panel">
            <header>
              <h2>Capture & Transcript</h2>
              <div className="status">
                <span
                  className={`status-indicator ${
                    status === "recording" ? "recording" : ""
                  } ${status === "error" ? "error" : ""}`}
                />
                {statusLabel}
              </div>
            </header>

            <div className="device-row">
              <label htmlFor="micSelect">Microphone</label>
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

            <div className="record-zone">
              <button
                className={`record-button ${
                  status === "recording" ? "active" : ""
                }`}
                onClick={toggleRecording}
              >
                {status === "recording" ? "Stop" : "Record"}
              </button>
              <div className="hint">
                Speak naturally. We handle transcription on-device.
              </div>
            </div>

            <div className="transcript">
              {transcript || "No transcript yet. Start recording to capture."}
            </div>

            <div className="controls">
              <button className="btn" onClick={() => copyText(transcript)}>
                Copy transcript
              </button>
              <button
                className="btn"
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

          <section className="panel">
            <header>
              <h2>AI Enrichment</h2>
              <div className="status">
                <span
                  className={`status-indicator ${
                    status === "enriching" ? "active" : ""
                  }`}
                />
                Output presets
              </div>
            </header>

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

            <div className="enrichment">
              {enriched || "Your structured output will appear here."}
            </div>

            <div className="controls">
              <button className="btn" onClick={() => copyText(enriched)}>
                Copy output
              </button>
              <button className="btn" onClick={rerunEnrichment}>
                Re-run
              </button>
            </div>
          </section>
        </div>

        {error && (
          <div className="footer">
            <span>Error: {error}</span>
            <span>Check microphone permissions or API keys.</span>
          </div>
        )}
        {!error && (
          <div className="footer">
            <span>Local transcription powered by Whisper.cpp.</span>
            <span>Outputs are ready to paste into your workflow.</span>
          </div>
        )}
      </div>
    </main>
  );
}
