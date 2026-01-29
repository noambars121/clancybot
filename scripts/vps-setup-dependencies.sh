#!/usr/bin/env bash
# VPS Dependencies Setup for Moltbot
# This script installs Homebrew and common dependencies needed for Moltbot skills

set -euo pipefail

echo "🚀 Setting up VPS dependencies for Moltbot..."

# Check if running on Linux
if [[ "$(uname)" != "Linux" ]]; then
  echo "❌ This script is designed for Linux VPS. Detected: $(uname)"
  exit 1
fi

# Install Homebrew if not already installed
if ! command -v brew &> /dev/null; then
  echo "📦 Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  
  # Add Homebrew to PATH
  echo "🔧 Adding Homebrew to PATH..."
  if [[ -d "/home/linuxbrew/.linuxbrew" ]]; then
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
    echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
  fi
else
  echo "✅ Homebrew already installed"
fi

# Verify brew is working
if ! command -v brew &> /dev/null; then
  echo "❌ Homebrew installation failed. Please install manually:"
  echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  exit 1
fi

echo "✅ Homebrew version: $(brew --version | head -n1)"

# Install common dependencies for Moltbot skills
echo "📦 Installing common skill dependencies..."

# uv (Python package manager)
if ! command -v uv &> /dev/null; then
  echo "  📦 Installing uv (Python package manager)..."
  brew install uv
else
  echo "  ✅ uv already installed"
fi

# ffmpeg (for video processing)
if ! command -v ffmpeg &> /dev/null; then
  echo "  📦 Installing ffmpeg (video/audio processing)..."
  brew install ffmpeg
else
  echo "  ✅ ffmpeg already installed"
fi

# curl & wget (HTTP clients)
if ! command -v curl &> /dev/null; then
  echo "  📦 Installing curl..."
  brew install curl
else
  echo "  ✅ curl already installed"
fi

if ! command -v wget &> /dev/null; then
  echo "  📦 Installing wget..."
  brew install wget
else
  echo "  ✅ wget already installed"
fi

# Optional: Install Python if not present
if ! command -v python3 &> /dev/null; then
  echo "  📦 Installing Python 3..."
  brew install python@3.11
else
  echo "  ✅ Python already installed: $(python3 --version)"
fi

echo ""
echo "✅ All dependencies installed successfully!"
echo ""
echo "📋 Installed tools:"
echo "  - Homebrew: $(brew --version | head -n1)"
echo "  - uv: $(uv --version 2>/dev/null || echo 'not installed')"
echo "  - ffmpeg: $(ffmpeg -version 2>/dev/null | head -n1 || echo 'not installed')"
echo "  - Python: $(python3 --version 2>/dev/null || echo 'not installed')"
echo ""
echo "🎯 Next steps:"
echo "  1. Reload your shell: source ~/.bashrc"
echo "  2. Clean previous config: rm -rf ~/.moltbot"
echo "  3. Run onboarding: clancybot onboard-full"
echo ""
