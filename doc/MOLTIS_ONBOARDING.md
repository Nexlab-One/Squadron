# Moltis + Squadron onboarding

Operator steps to run a Moltis gateway and join Squadron (invite/join/approve/claim).

## Prerequisites

- Squadron (Paperclip) running (e.g. `pnpm dev` or `pnpm dev --tailscale-auth`).
- Moltis gateway binary or build from moltis-main (reference tree; not a Squadron build dependency).

## 1. Start Moltis gateway

From the Moltis repo or install:

```bash
# Example: if you have moltis on PATH
moltis serve
```

Or from moltis-main (see moltis-main docs for build and config). The gateway exposes WebSocket at `/ws/chat` (e.g. `ws://127.0.0.1:PORT/ws/chat`).

## 2. Start Squadron

```bash
cd <squadron-repo-root>
pnpm dev
# or with auth: pnpm dev --tailscale-auth
```

Verify:

```bash
curl -sS http://127.0.0.1:3100/api/health | jq
```

## 3. Create invite (Moltis)

In Squadron UI: Company → Invites → Generate OpenClaw Invite Prompt. To get a Moltis-oriented invite, call:

```bash
POST /api/companies/{companyId}/openclaw/invite-prompt
Content-Type: application/json
{ "gatewayVariant": "moltis" }
```

Or create a normal company invite and use the join payload below with `gatewayVariant: "moltis"`.

## 4. Submit join request (agent)

Use the onboarding URL from the invite (e.g. `GET /api/invites/{token}/onboarding.txt`) for the exact registration endpoint and claim path.

Example join body (Moltis): set `adapterType` to `openclaw_gateway` and include `gatewayVariant: "moltis"` in `agentDefaultsPayload`. Device key is not required for Moltis.

```bash
curl -sS -X POST "http://127.0.0.1:3100/api/invites/{token}/accept" \
  -H "Content-Type: application/json" \
  -d '{
    "requestType": "agent",
    "agentName": "Moltis Agent",
    "adapterType": "openclaw_gateway",
    "capabilities": "Moltis gateway adapter",
    "agentDefaultsPayload": {
      "url": "ws://127.0.0.1:YOUR_MOLTIS_WS_PORT/ws/chat",
      "gatewayVariant": "moltis",
      "squadronApiUrl": "http://127.0.0.1:3100",
      "headers": { "x-openclaw-token": "YOUR_MOLTIS_GATEWAY_TOKEN" },
      "waitTimeoutMs": 120000,
      "sessionKeyStrategy": "issue",
      "role": "operator",
      "scopes": ["operator.admin"]
    }
  }'
```

Replace `YOUR_MOLTIS_WS_PORT` and `YOUR_MOLTIS_GATEWAY_TOKEN` with your Moltis gateway URL and auth token.

## 5. Approve and claim

1. In Squadron UI, approve the join request.
2. Claim API key (one-time): `POST /api/join-requests/{requestId}/claim-api-key` with `{ "claimSecret": "<from join response>" }`.
3. Save the returned token to `~/.openclaw/workspace/paperclip-claimed-api-key.json` and set `SQUADRON_API_KEY` / `SQUADRON_API_URL` for the agent.

## 6. Run a task

Create an issue assigned to the Moltis agent and run a task. The adapter uses client-first connect and protocol 4; run logs should show "Moltis handshake (client-first, protocol 4)" and "connected protocol=4".

## One-liner (copy-paste)

After Squadron and Moltis are running and you have an invite token and Moltis gateway URL/token:

```bash
# Set these first:
INVITE_TOKEN="<invite-token>"
MOLTIS_WS_URL="ws://127.0.0.1:PORT/ws/chat"
MOLTIS_TOKEN="<gateway-auth-token>"
SQUADRON_URL="http://127.0.0.1:3100"

# Submit join
curl -sS -X POST "$SQUADRON_URL/api/invites/$INVITE_TOKEN/accept" \
  -H "Content-Type: application/json" \
  -d "{\"requestType\":\"agent\",\"agentName\":\"Moltis Agent\",\"adapterType\":\"openclaw_gateway\",\"capabilities\":\"Moltis\",\"agentDefaultsPayload\":{\"url\":\"$MOLTIS_WS_URL\",\"gatewayVariant\":\"moltis\",\"squadronApiUrl\":\"$SQUADRON_URL\",\"headers\":{\"x-openclaw-token\":\"$MOLTIS_TOKEN\"},\"waitTimeoutMs\":120000,\"sessionKeyStrategy\":\"issue\",\"role\":\"operator\",\"scopes\":[\"operator.admin\"]}}"
```

Then approve in UI and claim the API key.

## WSS (TLS) and self-signed certificates

If the Moltis gateway uses **wss://** (e.g. `wss://localhost:53083/ws`) with a self-signed certificate:

- **Loopback** (`wss://localhost`, `wss://127.0.0.1`, `wss://::1`): the adapter automatically accepts the certificate when no custom CA is configured.
- **Non-loopback or strict verification**: set **`tlsCaPath`** in the agent config to the path to the server’s certificate (or the CA that signed it) in PEM form. Example: export the cert with `openssl s_client -connect host:port -showcerts` and save the first certificate to a `.pem` file, then set `tlsCaPath` to that path. Full verification is then performed using that trust store.

## Troubleshooting

### "Authentication Not Configured"

If you see "This instance requires authentication to be set up before it can be accessed remotely", Moltis is treating your connection as remote (e.g. from Windows to a WSL IP) and requires at least one credential (password or passkey) before allowing access.

**Option A — Temporarily disable auth (works from any browser):**

Moltis stores “auth disabled” in its database; the DB value overrides the config file. Editing `moltis.toml` alone is not enough. Use the CLI to reset auth and set the disabled flag in the DB:

1. **Stop Moltis** (kill the process listening on your gateway port).
2. In WSL, run:
   ```bash
   ./moltis auth reset-password
   ```
   (From the directory that contains the `moltis` binary, or with the same `--config-dir` / `--data-dir` if you use them.) This clears credentials and sets auth to disabled in the DB and config.
3. **Start Moltis again** (e.g. `./moltis --port 53083 --bind 0.0.0.0`).
4. Open the gateway from any browser: `https://127.0.0.1:53083` or `https://<WSL_IP>:53083`. Set a password in the UI, then create an API key (Settings → Security → API Keys). Copy the key (shown once).  
   **If “Setup authentication” or onboarding sends you to the chat page:** with auth disabled, the onboarding flow may skip the auth step and redirect to chat. Go **directly** to the Security page: `https://<WSL_IP>:53083/settings/security` (replace with your gateway URL). There you can set a password and create an API key without using onboarding.
5. To re-enable auth later: set a password or passkey in Settings; that clears the “auth disabled” state. Or set `[auth]` → `disabled = false` in `~/.config/moltis/moltis.toml` and restart (after the DB has been updated by the UI or by a prior reset).
6. In Squadron, set the agent’s gateway auth token to that API key.

**Option B — From WSL with a true local browser:**  
Only if you run a browser *inside* WSL (e.g. Firefox/Chrome under WSLg from a WSL terminal). Opening the URL from WSL in the “default” browser often launches the Windows browser; that connection is then seen as remote by Moltis, so you still get “Authentication Not Configured”. Use Option A or C instead.

**Option C — Use the setup code from Windows:**

1. Restart Moltis in the foreground in WSL so you can see stdout:  
   `cd /path/to/moltis-wsl && ./moltis --port 53083 --bind 0.0.0.0`
2. Note the 6-digit setup code printed in the terminal (single-use until first credential is set).
3. From Windows, open `https://<WSL_IP>:53083/onboarding` (e.g. `https://172.17.43.213:53083/onboarding`) and enter the code, then set a password.
4. Log in with that password, create an API key (Settings → Security → API Keys), and use it as the gateway token in Squadron.

To clear auth and start over: stop Moltis, then in WSL run `./moltis auth reset-password` (use the same `--config-dir` / `--data-dir` if you customised them). Restart Moltis to get a new setup code.

### Other gateway errors

Errors returned by the Moltis gateway appear in run failure details. Common ones:

- **"agent service not configured"** — The gateway rejected the request because its agent/runner service is not configured or not running. In moltis-main this is returned by `NoopAgentService` (crates/service-traits) when the gateway has no real agent implementation wired. The **Moltis binary** must be a **full** build with the agent/chat stack wired; some pre-built binaries (e.g. certain platform or minimal builds) may be gateway-only and will always return this error. Prefer the official install for your platform when it provides the full app. If the error persists with a pre-built binary (e.g. Windows exe), build Moltis from source with default features: `cargo build --release` in the [moltis-org/moltis](https://github.com/moltis-org/moltis) repo (do not use `--no-default-features`), then run the resulting binary with `--port <your-port>`. See Moltis docs or open an issue on the Moltis repo to confirm whether a given distribution includes the full agent service.
- **"gateway request timeout (connect)"** — If the probe or run fails with a connect timeout, check that the gateway is up, reachable, and responds to the first `connect` frame; for wss, ensure loopback TLS is in use or provide a trusted CA/cert. If Moltis logs show the connection closing immediately after "handshake complete" (e.g. duration_secs=0), ensure the Moltis gateway keeps the connection open and sends a connect response; increase connect timeout on the gateway or client if needed.
- **Auth or token errors** — Check gateway URL, `x-openclaw-token` (or Authorization header), and that the token is valid on the Moltis side.
- **Pairing required** — For OpenClaw-style gateways that use device auth, approve the device (e.g. `openclaw devices approve --latest`) and retry. Moltis often uses token-only auth and may not require pairing.

## See also

- `doc/MOLTIS_PROTOCOL.md` — handshake and protocol version (Squadron 3 vs Moltis 4).
- `doc/OPENCLAW_ONBOARDING.md` — full OpenClaw gateway onboarding (challenge handshake, pairing).
