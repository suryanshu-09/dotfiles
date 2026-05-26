#!/usr/bin/env bash
set -euo pipefail

readonly appname="${1:-}"
readonly summary="${2:-}"
readonly body="${3:-}"

known_browsers=(
    "Zen" "firefox" "Firefox" "Waterfox"
    "chromium" "Chromium" "google-chrome" "Google Chrome"
    "brave" "Brave" "brave-browser"
    "zen" "zen-browser" "zen-alpha" "zen-beta"
)

is_browser=0
for browser in "${known_browsers[@]}"; do
    if [[ "$appname" == "$browser" ]]; then
        is_browser=1
        break
    fi
done
[[ "$is_browser" -eq 0 ]] && exit 0

# Try DUNST_URLS env var first
url=""
if [[ -n "${DUNST_URLS:-}" ]]; then
    IFS=',' read -ra urls <<< "$DUNST_URLS"
    url="${urls[0]}"
fi

# Fallback: extract URL from body or summary
if [[ -z "$url" ]]; then
    for text in "$body" "$summary"; do
        for word in $text; do
            if [[ "$word" =~ ^https?://[^[:space:]]+ ]]; then
                url="$word"
                break 2
            fi
        done
    done
fi

# Write URL so keybinds or other tools can access it
if [[ -n "$url" ]]; then
    printf "%s" "$url" > /tmp/dunst_browser_url
fi
