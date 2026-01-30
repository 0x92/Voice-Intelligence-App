const path = require("path");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  shell,
  Tray,
  Menu,
  nativeImage,
  screen,
} = require("electron");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const { transcribeAudioBuffer } = require("./services/stt");
const { enrichText } = require("./services/openai");

let mainWindow = null;
let tray = null;
let indicatorWindow = null;
let isRecording = false;
let isQuitting = false;

const devServerUrl = process.env.ELECTRON_RENDERER_URL || "";
const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";
const RECORD_HOTKEY = "CommandOrControl+Shift+R";

const trayIconPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACFElEQVR4nO2WsUtVURTHf+fZ2V0lUQyC4hEQrUQx0KBg1oK0oX8g0aI2QqY2lKkWk0kq1JQ2g1oVgI1Sg0mIf5Q+g4dG/4vC+o7x3j3O8z8e9n4z+M7gFfOZ+6z3nOe7d3Q7wV9mK4b4A1sWm0Jk0fYx7x2V1gF1Z0Jm+uQ+oI3HWSmD6dUQbD8t4H4I0u2o6o9g2QbQdU0Wk5m9gX4GeI8nT5EwQKXQKqL7aA+XG2wW8Y4mEo2bR9g3Q8p4p2+f2+2Cq+oKfV4O6Z2f3U8p4c3rKk1G5T8mG9J+M2d0k3lHqgsgbFj1o6gZfA4XlQ+JgIh2xkq0q2m+7C6hC1Nf1Q0o9pO5Y9M1HkY4hC8xkQ1tC0Gg0u+0XnA8V2Q5mX9+XgZ5gY2yM1bS3oOq1kV8c2x4bY5mB6qfG3P5/0R2i8Gg1m8YF0c9NqD8Gk4Vt5fCwOaA0W0NwH0m2r6r8B7V6H8gY6J5y2NQW0q6iB7W8n+QH8X4w1b0U3mX5m3lZxg7s+qgG8Qw5g3s0H9xZk6B0d8bY2g9r6l9tFz+7X4qB6EoB2HfG8F2c2R5qgH6lKkZ8L0dTn9fV8h8rG4g8g/6u3rVvZgM4Yqf2T8g2mO2yU0+eS6pX1a8q5+M6OQm9gP6Qe0wP7AfQmXf9v3bK9wR8fG6QW1QW8G8QnR3xC9m8i8o5c4c0C5QAAAABJRU5ErkJggg==";

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    show: false,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(app.getAppPath(), "out", "index.html");
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
};

const createIndicatorWindow = () => {
  if (indicatorWindow) {
    return indicatorWindow;
  }
  indicatorWindow = new BrowserWindow({
    width: 360,
    height: 120,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          margin: 0;
          font-family: "Segoe UI", sans-serif;
          background: transparent;
        }
        .card {
          margin: 10px;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.92);
          color: #f8fafc;
          border: 1px solid rgba(148, 163, 184, 0.2);
          box-shadow: 0 14px 40px rgba(2, 6, 23, 0.45);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .wave {
          width: 140px;
          height: 24px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.7);
        }
        .title {
          font-size: 14px;
          font-weight: 600;
        }
        .meta {
          font-size: 11px;
          color: #cbd5f5;
        }
        .time {
          font-size: 12px;
          color: #93c5fd;
          font-family: "Consolas", monospace;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="row">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="dot"></span>
            <span class="title">Recording</span>
          </div>
          <span class="time" id="time">00:00</span>
        </div>
        <div class="row">
          <div class="meta" id="device">Microphone: System default</div>
          <canvas class="wave" id="wave" width="140" height="24"></canvas>
        </div>
      </div>
      <script>
        const { ipcRenderer } = require("electron");
        let startedAt = Date.now();
        const levels = Array.from({ length: 18 }, () => 0);
        const timeEl = document.getElementById("time");
        const deviceEl = document.getElementById("device");
        const wave = document.getElementById("wave");
        const wctx = wave.getContext("2d");
        const tick = () => {
          const diff = Math.floor((Date.now() - startedAt) / 1000);
          const min = String(Math.floor(diff / 60)).padStart(2, "0");
          const sec = String(diff % 60).padStart(2, "0");
          timeEl.textContent = min + ":" + sec;
        };
        setInterval(tick, 1000);
        const drawWave = () => {
          wctx.clearRect(0, 0, wave.width, wave.height);
          const barWidth = 6;
          const gap = 2;
          levels.forEach((level, i) => {
            const height = 4 + level * 18;
            const x = i * (barWidth + gap);
            const y = (wave.height - height) / 2;
            wctx.fillStyle = "rgba(239, 68, 68, 0.8)";
            wctx.fillRect(x, y, barWidth, height);
          });
        };
        drawWave();
        ipcRenderer.on("indicator:update", (_event, payload) => {
          if (payload?.startedAt) {
            startedAt = payload.startedAt;
          }
          if (payload?.deviceLabel) {
            deviceEl.textContent = "Microphone: " + payload.deviceLabel;
          }
        });
        ipcRenderer.on("indicator:level", (_event, payload) => {
          const next = Math.max(0, Math.min(1, payload?.level ?? 0));
          levels.push(next);
          while (levels.length > 18) levels.shift();
          drawWave();
        });
      </script>
    </body>
  </html>`;

  indicatorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  indicatorWindow.on("closed", () => {
    indicatorWindow = null;
  });

  return indicatorWindow;
};

const showIndicator = (deviceLabel) => {
  const win = createIndicatorWindow();
  const { workArea } = screen.getPrimaryDisplay();
  win.setPosition(workArea.x + workArea.width - 380, workArea.y + 20, false);
  win.show();
  win.webContents.send("indicator:update", {
    startedAt: Date.now(),
    deviceLabel: deviceLabel || "System default",
  });
  win.webContents.send("indicator:level", { level: 0 });
};

const hideIndicator = () => {
  if (indicatorWindow) {
    indicatorWindow.hide();
  }
};

const toggleWindow = () => {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
};

const toggleRecordHotkey = () => {
  if (!mainWindow) {
    createWindow();
  }
  if (isRecording && mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
  if (mainWindow?.webContents) {
    mainWindow.webContents.send("voice:toggle-record");
  }
};

const buildTrayMenu = () =>
  Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? "Hide" : "Show",
      click: () => toggleWindow(),
    },
    {
      label: isRecording ? "Stop Recording" : "Start Recording",
      click: () => toggleRecordHotkey(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

const createTray = () => {
  if (tray) return;
  const image = nativeImage.createFromDataURL(trayIconPng);
  tray = new Tray(image);
  tray.setToolTip("Voice Intelligence");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", toggleWindow);
};

const registerHotkey = () => {
  globalShortcut.unregisterAll();
  const success = globalShortcut.register(DEFAULT_HOTKEY, toggleWindow);
  if (!success) {
    console.warn(`Failed to register hotkey: ${DEFAULT_HOTKEY}`);
  }
  const recordSuccess = globalShortcut.register(RECORD_HOTKEY, toggleRecordHotkey);
  if (!recordSuccess) {
    console.warn(`Failed to register hotkey: ${RECORD_HOTKEY}`);
  }
};

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerHotkey();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (isQuitting) {
      app.quit();
    }
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle("voice:transcribe", async (_event, payload) => {
  return transcribeAudioBuffer(payload);
});

ipcMain.handle("voice:enrich", async (_event, payload) => {
  return enrichText(payload);
});

ipcMain.on("voice:recording-state", (_event, payload) => {
  isRecording = Boolean(payload?.active);
  if (isRecording) {
    showIndicator(payload?.deviceLabel);
  } else {
    hideIndicator();
  }
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
});

ipcMain.on("voice:recording-level", (_event, payload) => {
  if (indicatorWindow && isRecording) {
    indicatorWindow.webContents.send("indicator:level", payload);
  }
});
