#!/usr/bin/env bash
set -euo pipefail

version="${1:-0.1.0-rc.14}"
if [[ "$version" == -* ]] || [[ "$version" == *[[:space:]]* ]]; then
  printf 'Usage: install.sh [npm-version-or-tag]\n' >&2
  exit 2
fi
if ! command -v dsh >/dev/null 2>&1; then
  printf 'dsh is not on PATH; install @deepseek-ai/dsh before this plugin.\n' >&2
  exit 1
fi

dsh plugin --profile web add "@fadinglight/dsh-device-automation@${version}"
dsh plugin --profile web exec dsh-device-automation preset install
printf 'Device automation is installed. Restart dsh web to load the Bundle.\n'
