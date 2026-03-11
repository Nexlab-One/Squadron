# Moltis gateway protocol (Squadron integration)

Reference for integrating Squadron with Moltis. The Moltis gateway is the Rust implementation of the OpenClaw gateway; it uses the same frame types and methods but differs in handshake and protocol version.

## WebSocket path

- **Path**: `/ws/chat`
- **Route**: Moltis gateway exposes this in `moltis-main/crates/gateway/src/server.rs`.

## Handshake

| Side | OpenClaw (Squadron default) | Moltis |
|------|-----------------------------|--------|
| **Server** | Sends `connect.challenge` event with nonce first | Does **not** send challenge; expects client to send first |
| **Client** | Waits for `connect.challenge`, then sends `connect` with device signature (optional) | Sends `connect` **immediately** after WebSocket open |

Squadron’s openclaw_gateway adapter: `GatewayWsClient.connect()` waits for `connect.challenge` in `handleMessage` (see `packages/adapters/openclaw-gateway/src/server/execute.ts`). Moltis: client sends `connect` first (see `moltis-main/crates/gateway/src/ws.rs` `wait_for_connect`).

## Protocol version

| Component | Version |
|----------|---------|
| Squadron openclaw_gateway (default) | `PROTOCOL_VERSION = 3` |
| Moltis | `moltis_protocol::PROTOCOL_VERSION = 4` |

Moltis server checks version and rejects when client `max_protocol < 4` (see `moltis-main/crates/gateway/src/ws.rs`). Squadron must send `minProtocol: 4`, `maxProtocol: 4` when connecting to Moltis.

## Frame types

Both use JSON frames:

- **Request**: `{ type: "req", id, method, params? }`
- **Response**: `{ type: "res", id, ok, payload?, error? }`
- **Event**: `{ type: "event", event, payload?, seq? }`

## Methods

- **connect** — authentication and session setup. Moltis expects client to send first; no server-sent challenge.
- **agent** — start agent run (params: message, sessionKey, idempotencyKey, etc.).
- **agent.wait** — wait for run completion (params: runId, timeoutMs).
- **device.pair.list** — list pending pairing requests.
- **device.pair.approve** — approve a pairing request.

Moltis registers these in `moltis-main/crates/gateway/src/methods/mod.rs` and `services.rs` (e.g. `agent`, `agent.wait`), and `methods/pairing.rs` for `device.pair.*`.

## Events

- **agent** — run events (runId, stream, data). Moltis has `agent` in KNOWN_EVENTS.

## Auth

- **OpenClaw**: `x-openclaw-token` or `Authorization: Bearer <token>`; optional device Ed25519 for pairing.
- **Moltis**: `ConnectAuth`: token, password, api_key, device_token; HTTP Bearer on WebSocket upgrade.

For Squadron→Moltis, use token (or password) in `connect` params and same headers as OpenClaw (`x-openclaw-token` or `Authorization`). Device key is optional for Moltis; token auth is sufficient for join validation when `gatewayVariant === "moltis"`.

## Compatibility matrix (summary)

| Aspect | Squadron openclaw_gateway | Moltis gateway |
|--------|---------------------------|----------------|
| Handshake | Waits for `connect.challenge`, then sends `connect` | Client sends `connect` first |
| Protocol version | 3 | 4 |
| Frame types | req/res/event | Same |
| Methods | connect, agent, agent.wait, device.pair.* | Same |
| Auth | token/Bearer, optional device | token/password/api_key/device_token, Bearer on upgrade |

To use Squadron with Moltis: set `gatewayVariant: "moltis"` in agent defaults (Option A) so the adapter uses client-first connect and protocol 4.
