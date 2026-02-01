# Voice Intelligence App (Electron + Next.js)

Eine Desktop‑App für schnelle Spracheingaben: lokal transkribieren, mit OpenAI strukturieren, sofort nutzbar.  
Optimiert für Fokus‑Workflows (Hotkeys, Tray‑Modus, Recording‑Indicator).

---
## Executive Summary (für CTO)
- **Ziel:** Spracheingaben in produktive, strukturierte Outputs verwandeln (Notizen, Summary, Tasks).
- **Kernvorteile:** Lokale Transkription (Whisper.cpp), minimale Latenz, keine Audio‑Cloud; nur Text geht an OpenAI.
- **Deployment:** Electron Desktop, keine Server‑Infrastruktur nötig.
- **Security:** API‑Key lokal; Audio bleibt auf dem Gerät; optional vollständig offline (ohne OpenAI).

---
## Features
- Globale Hotkeys:
  - App ein/ausblenden: `Ctrl/Cmd + Shift + Space`
  - Aufnahme starten/stoppen: `Ctrl/Cmd + Shift + R`
- Tray‑Modus: X schließt nicht, sondern minimiert in den Tray.
- On‑Screen Recording‑Indicator (Timer + Mic‑Name).
- Lokale STT via **whisper.cpp** (ggml‑Modelle).
- OpenAI‑Enrichment (Presets: Notes, Summary, Action Items, Email).
- LLM Provider Switch (OpenAI / Ollama).
- Geräte‑Auswahl für Mikrofon (persistiert).

---
## Architektur
**Renderer (Next.js):**
UI, Audio‑Capture, Status, Presets, Waveform‑Visualisierung.

**Main (Electron):**
Global Hotkeys, Tray, IPC, lokale Services.

**STT Service:**
`ffmpeg` → WAV 16kHz → Whisper.cpp CLI → Textdatei.

**LLM Service:**
OpenAI oder Ollama → strukturierte Ausgabe.

---
## Design-Entscheidungen
- Lokale STT mit whisper.cpp fuer geringe Latenz und Audio-Privacy.
- Audio bleibt lokal, nur Text geht an OpenAI.
- Electron + Next.js fuer schnelle UI-Iteration und Desktop-Hotkeys.
- Hotkey + Tray fuer fokusierte Workflows ohne Kontextwechsel.
- Markdown-Output fuer direkte Weiterverarbeitung.

---
## Setup (Developer)

Hinweis: In der UI kann der LLM-Provider per Schalter zwischen OpenAI und Ollama gewechselt werden (ueberschreibt LLM_PROVIDER fuer die Session).

### 1) Install
```bash
cd app
npm install
```

### 2) Whisper.cpp + Modell (Script)
Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-whisper.ps1
```

Linux (bash):
```bash
bash scripts/install-whisper.sh
```

Optionale Overrides:
```bash
WHISPER_CPP_URL=... WHISPER_MODEL_URL=... bash scripts/install-whisper.sh
```

Die Scripts legen Dateien in `app/whisper/` und `app/models/ggml-base.bin` ab.

### 3) Whisper.cpp Binary + Modell (manuell)
**Binary (Windows):**  
https://github.com/ggerganov/whisper.cpp/releases

**Modell (multilingual, z.B. `ggml-base.bin`):**  
https://huggingface.co/ggerganov/whisper.cpp
Direktlink: https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-base.bin

Empfohlene Ordnerstruktur:
```
app/
  whisper/   -> enthaelt main.exe oder whisper-cli.exe
  models/    -> enthaelt ggml-base.bin
```

### 4) `.env` konfigurieren
```env
WHISPER_CPP_PATH=D:/Entwicklung/Voice Intelligence App Challenge/app/whisper/whisper-cli.exe
WHISPER_MODEL_PATH=D:/Entwicklung/Voice Intelligence App Challenge/app/models/ggml-base.bin
OPENAI_API_KEY=sk-...
# OPENAI_API_KEY nur fuer OpenAI
OPENAI_MODEL=gpt-4o-mini
# LLM Provider (openai|ollama):
LLM_PROVIDER=openai
# Optional: UI default
NEXT_PUBLIC_LLM_PROVIDER=openai
# Ollama (lokal):
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
# Deutsch erzwingen:
WHISPER_CPP_ARGS=--language de
```

Linux Beispiel:
```env
WHISPER_CPP_PATH=/home/<user>/Voice Intelligence App Challenge/app/whisper/whisper-cli
```

Ollama Hinweis:
- Ollama muss laufen: `ollama serve`
- Modell laden: `ollama pull llama3.1:8b`

### 5) Dev starten
```bash
npm run dev
```

### 6) Build (Production)
```bash
npm run build
npm run start
```
---
## Troubleshooting

**Transcribing hängt (UI bleibt bei “Transcribing locally…”):**
- Prüfe, ob `WHISPER_CPP_PATH` wirklich whisper.cpp ist:
  ```powershell
  & "D:\path\to\whisper-cli.exe" -h
  ```
  Wenn dort Node‑Optionen stehen → falsche Binary.

**Deutsch wird als Englisch erkannt:**
- Multilingual‑Modell verwenden (`ggml-base.bin`, nicht `.en`)
- `WHISPER_CPP_ARGS=--language de`

**Hotkey funktioniert nicht:**
- Prüfen ob andere Tools den Shortcut blockieren.
- Tray‑Menü nutzen (Start/Stop Recording).

---
## Sicherheit & Datenschutz
- Audio bleibt lokal, Transkription erfolgt on‑device.
- Bei OpenAI wird nur der **Text** gesendet; bei Ollama bleibt alles lokal.
- API‑Key niemals committen; `.env` ist ignored.

---
## Projektstruktur (relevant)
```
app/
  electron/            # Main‑Process + Services
  src/app/             # UI (Next.js)
  models/              # Whisper Modelle (ignored)
  whisper/             # Whisper.cpp Binary (ignored)
```

---
## Nächste Schritte (optional)
- Auswahl der finalen UI‑Variante aus `ui-demos/`
- Packaging via `electron-builder`
- Persistente History + Export Formate










