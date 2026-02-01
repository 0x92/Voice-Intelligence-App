#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$script_dir/.." && pwd)"
whisper_dir="$app_dir/whisper"
models_dir="$app_dir/models"

mkdir -p "$whisper_dir" "$models_dir"

model_url="${WHISPER_MODEL_URL:-https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found. Install curl and re-run."
  exit 1
fi

pick_asset_url() {
  local arch_tag="$1"
  local arch_alt="$2"
  local json
  json="$(curl -sL -H "User-Agent: voice-intelligence-installer" "https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest")"
  if ! command -v node >/dev/null 2>&1; then
    echo "node not found. Install Node.js or set WHISPER_CPP_URL."
    exit 1
  fi
  node -e '
    const fs = require("fs");
    const data = fs.readFileSync(0, "utf8");
    const release = JSON.parse(data);
    const assets = release.assets || [];
    const archTag = process.argv[1];
    const archAlt = process.argv[2];
    const matches = assets.filter((a) => {
      const name = (a.name || "").toLowerCase();
      const isLinux = name.includes("linux");
      const isArch = name.includes(archTag) || (archAlt && name.includes(archAlt));
      const isArchive = name.endsWith(".tar.gz") || name.endsWith(".zip");
      return isLinux && isArch && isArchive;
    });
    if (matches.length === 0) {
      const fallback = assets.find((a) => {
        const name = (a.name || "").toLowerCase();
        return name.includes("linux") && (name.endsWith(".tar.gz") || name.endsWith(".zip"));
      });
      if (!fallback) process.exit(1);
      process.stdout.write(fallback.browser_download_url || "");
      process.exit(0);
    }
    process.stdout.write(matches[0].browser_download_url || "");
  ' "$arch_tag" "$arch_alt" <<< "$json"
}

download_and_extract() {
  local url="$1"
  local tmp_dir="$2"
  local archive="$tmp_dir/whisper-archive"

  echo "Downloading whisper.cpp from $url"
  curl -L "$url" -o "$archive"

  if [[ "$url" == *.tar.gz ]]; then
    tar -xzf "$archive" -C "$tmp_dir"
  elif [[ "$url" == *.zip ]]; then
    if ! command -v unzip >/dev/null 2>&1; then
      echo "unzip not found. Install unzip or set WHISPER_CPP_URL to a .tar.gz asset."
      exit 1
    fi
    unzip -q "$archive" -d "$tmp_dir"
  else
    echo "Unsupported archive type: $url"
    exit 1
  fi
}

cli_path="$whisper_dir/whisper-cli"
if [[ ! -f "$cli_path" ]]; then
  whisper_url="${WHISPER_CPP_URL:-}"
  if [[ -z "$whisper_url" ]]; then
    arch="$(uname -m)"
    case "$arch" in
      x86_64|amd64) whisper_url="$(pick_asset_url "x64" "amd64")" ;;
      aarch64|arm64) whisper_url="$(pick_asset_url "arm64" "aarch64")" ;;
      *) whisper_url="$(pick_asset_url "$arch" "")" ;;
    esac
  fi

  if [[ -z "$whisper_url" ]]; then
    echo "Could not resolve a Linux release asset. Set WHISPER_CPP_URL and re-run."
    exit 1
  fi

  tmp_dir="$(mktemp -d)"
  download_and_extract "$whisper_url" "$tmp_dir"

  cli_file="$(find "$tmp_dir" -type f -name "whisper-cli" -perm -111 | head -n 1 || true)"
  if [[ -z "$cli_file" ]]; then
    cli_file="$(find "$tmp_dir" -type f -name "main" -perm -111 | head -n 1 || true)"
  fi

  if [[ -z "$cli_file" ]]; then
    echo "whisper-cli or main not found in archive."
    rm -rf "$tmp_dir"
    exit 1
  fi

  src_dir="$(dirname "$cli_file")"
  cp -a "$src_dir"/. "$whisper_dir"/

  if [[ -f "$whisper_dir/main" && ! -f "$whisper_dir/whisper-cli" ]]; then
    cp "$whisper_dir/main" "$whisper_dir/whisper-cli"
    chmod +x "$whisper_dir/whisper-cli"
  fi

  rm -rf "$tmp_dir"
else
  echo "whisper-cli already present in $whisper_dir"
fi

model_path="$models_dir/ggml-base.bin"
if [[ ! -f "$model_path" ]]; then
  echo "Downloading model to $model_path"
  curl -L "$model_url" -o "$model_path"
else
  echo "Model already present at $model_path"
fi

echo "Done."
