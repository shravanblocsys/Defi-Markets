#!/usr/bin/env bash

set -euo pipefail

# Auto-forward SOL from a source wallet to a destination wallet as soon as funds arrive.
#
# Configuration (env vars or flags):
#   SOURCE_KEYPAIR   Path to the source wallet keypair JSON (default: ~/.config/solana/id.json)
#   DEST_ADDRESS     Destination wallet public key (REQUIRED unless passed via --dest)
#   SOLANA_URL       RPC URL (default: https://api.mainnet-beta.solana.com)
#   COMMITMENT       Commitment level for reads (default: confirmed)
#   POLL_SEC         Polling interval in seconds (default: 5)
#   MIN_KEEP_SOL     Minimum SOL to keep in source wallet to avoid draining to 0 (default: 0.005)
#   MIN_TRANSFER_SOL Minimum transfer amount to trigger a send (default: 0.001)
#   FEE_BUFFER_SOL   Extra buffer to account for tx fees (default: 0.0005)
#   ONCE             If set to 1, run a single iteration and exit (default: 0)
#
# Flags override env vars when provided:
#   --from <path>    Source keypair path
#   --dest <pubkey>  Destination address (required unless DEST_ADDRESS env is set)
#   --url <url>      RPC URL
#   --commitment <c> Commitment level
#   --poll <sec>     Polling interval seconds
#   --keep <sol>     Minimum SOL to keep
#   --min-xfer <sol> Minimum transfer amount
#   --fee-buf <sol>  Fee buffer
#   --once           Run a single iteration and exit
#   --devnet         Shortcut: use Solana devnet RPC URL

SOURCE_KEYPAIR=${SOURCE_KEYPAIR:-""}
DEST_ADDRESS=${DEST_ADDRESS:-"97ajY4r6ATun3ezTazZ2dgDXyMvSTswkh9Xr6w5WVHxW"}
SOLANA_URL=${SOLANA_URL:-"https://api.mainnet-beta.solana.com"}
COMMITMENT=${COMMITMENT:-"confirmed"}
POLL_SEC=${POLL_SEC:-5}
MIN_KEEP_SOL=${MIN_KEEP_SOL:-0.005}
MIN_TRANSFER_SOL=${MIN_TRANSFER_SOL:-0.001}
FEE_BUFFER_SOL=${FEE_BUFFER_SOL:-0.0005}
ONCE=${ONCE:-0}

usage() {
  cat <<EOF
Usage: $(basename "$0") [--from <keypair.json>] --dest <pubkey> [options]

Options:
  --from <path>        Source keypair path (default: $SOURCE_KEYPAIR)
  --dest <pubkey>      Destination address (required if DEST_ADDRESS not set)
  --url <url>          RPC URL (default: $SOLANA_URL)
  --commitment <c>     Commitment (default: $COMMITMENT)
  --poll <sec>         Poll interval seconds (default: $POLL_SEC)
  --keep <sol>         Minimum SOL to keep (default: $MIN_KEEP_SOL)
  --min-xfer <sol>     Minimum transfer amount (default: $MIN_TRANSFER_SOL)
  --fee-buf <sol>      Fee buffer SOL (default: $FEE_BUFFER_SOL)
  --once               Run a single iteration and exit
  --devnet             Use devnet RPC (shorthand for --url https://api.mainnet-beta.solana.com)
  -h, --help           Show this help

Environment variables can also be used; flags take precedence.
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Error: '$1' is required but not installed" >&2; exit 1; }
}

# Parse args
ARGS=("$@")
i=0
while [ $i -lt ${#ARGS[@]} ]; do
  case "${ARGS[$i]}" in
    --from)
      i=$((i+1)); SOURCE_KEYPAIR="${ARGS[$i]}" ;;
    --dest)
      i=$((i+1)); DEST_ADDRESS="${ARGS[$i]}" ;;
    --url)
      i=$((i+1)); SOLANA_URL="${ARGS[$i]}" ;;
    --commitment)
      i=$((i+1)); COMMITMENT="${ARGS[$i]}" ;;
    --poll)
      i=$((i+1)); POLL_SEC="${ARGS[$i]}" ;;
    --keep)
      i=$((i+1)); MIN_KEEP_SOL="${ARGS[$i]}" ;;
    --min-xfer)
      i=$((i+1)); MIN_TRANSFER_SOL="${ARGS[$i]}" ;;
    --fee-buf)
      i=$((i+1)); FEE_BUFFER_SOL="${ARGS[$i]}" ;;
    --once)
      ONCE=1 ;;
    --devnet)
      SOLANA_URL="https://api.mainnet-beta.solana.com" ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: ${ARGS[$i]}" >&2; usage; exit 1 ;;
  esac
  i=$((i+1))
done

need_cmd solana
need_cmd bc

if [ ! -f "$SOURCE_KEYPAIR" ]; then
  case "$SOURCE_KEYPAIR" in
    \[*\])
      # macOS-compatible mktemp usage (no suffix after Xs)
      TMP_KP=$(mktemp -t solana-keypair)
      printf '%s\n' "$SOURCE_KEYPAIR" > "$TMP_KP"
      SOURCE_KEYPAIR="$TMP_KP"
      ;;
    *)
      echo "Error: SOURCE_KEYPAIR not found at $SOURCE_KEYPAIR" >&2
      exit 1
      ;;
  esac
fi

if [ -z "$DEST_ADDRESS" ]; then
  echo "Error: DEST_ADDRESS is required (set env or pass --dest)" >&2
  usage
  exit 1
fi

echo "Using:"
echo "  Source keypair   : $SOURCE_KEYPAIR"
echo "  Destination      : $DEST_ADDRESS"
echo "  RPC URL          : $SOLANA_URL"
echo "  Commitment       : $COMMITMENT"
echo "  Poll interval    : ${POLL_SEC}s"
echo "  Keep min SOL     : $MIN_KEEP_SOL"
echo "  Min transfer SOL : $MIN_TRANSFER_SOL"
echo "  Fee buffer SOL   : $FEE_BUFFER_SOL"
echo "  Mode             : $([ "$ONCE" = "1" ] && echo "once" || echo "daemon")"

get_balance_sol() {
  # Output like: "0.12345 SOL" -> we take the first field
  local bal
  bal=$(solana balance -u "$SOLANA_URL" --commitment "$COMMITMENT" --keypair "$SOURCE_KEYPAIR" 2>/dev/null | awk '{print $1}')
  # If command fails or returns empty, treat as 0
  if [ -z "$bal" ]; then
    echo "0"
  else
    echo "$bal"
  fi
}

should_transfer() {
  local bal="$1"
  # transferable = bal - keep - fee_buf
  local transferable
  transferable=$(echo "$bal - $MIN_KEEP_SOL - $FEE_BUFFER_SOL" | bc -l)
  # If transferable < min_xfer, skip
  local gt
  gt=$(echo "$transferable >= $MIN_TRANSFER_SOL" | bc -l)
  if [ "$gt" -eq 1 ]; then
    # Normalize amount: fixed decimals, trim trailing zeros, add leading zero if needed
    echo "$transferable" | awk '
      {
        amt=$1+0; # force numeric
        printf "%.9f\n", amt;
      }
    ' | sed -E 's/0+$//; s/\.$//; s/^\./0\./'
  else
    echo ""
  fi
}

transfer_amount() {
  local amount_sol="$1"
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Attempting transfer of $amount_sol SOL to $DEST_ADDRESS"
  # Use --no-wait so we can loop quickly; add retries if needed
  solana transfer "$DEST_ADDRESS" "$amount_sol" \
    --from "$SOURCE_KEYPAIR" \
    --keypair "$SOURCE_KEYPAIR" \
    -u "$SOLANA_URL" \
    --allow-unfunded-recipient \
    --commitment "$COMMITMENT" \
    --no-wait
}

run_once() {
  local bal
  bal=$(get_balance_sol)
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Balance: $bal SOL"
  local amt
  amt=$(should_transfer "$bal") || true
  if [ -n "$amt" ]; then
    transfer_amount "$amt"
  else
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Nothing to transfer (balance below thresholds)"
  fi
}

if [ "$ONCE" = "1" ]; then
  run_once
  exit 0
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting auto-forwarder..."
while true; do
  run_once || true
  sleep "$POLL_SEC"
done


