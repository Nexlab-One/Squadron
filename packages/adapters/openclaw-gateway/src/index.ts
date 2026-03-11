export const type = "openclaw_gateway";
export const label = "OpenClaw Gateway";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# openclaw_gateway agent configuration

Adapter: openclaw_gateway

Use when:
- You want Squadron to invoke OpenClaw over the Gateway WebSocket protocol.
- You want native gateway auth/connect semantics instead of HTTP /v1/responses or /hooks/*.

Don't use when:
- You only expose OpenClaw HTTP endpoints.
- Your deployment does not permit outbound WebSocket access from the Squadron server.

Core fields:
- url (string, required): OpenClaw gateway WebSocket URL (ws:// or wss://)
- headers (object, optional): handshake headers; supports x-openclaw-token / x-openclaw-auth
- authToken (string, optional): shared gateway token override
- password (string, optional): gateway shared password, if configured

Gateway connect identity fields:
- clientId (string, optional): gateway client id (default gateway-client)
- clientMode (string, optional): gateway client mode (default backend)
- clientVersion (string, optional): client version string
- role (string, optional): gateway role (default operator)
- scopes (string[] | comma string, optional): gateway scopes (default ["operator.admin"])
- disableDeviceAuth (boolean, optional): disable signed device payload in connect params (default false)

Request behavior fields:
- payloadTemplate (object, optional): additional fields merged into gateway agent params
- workspaceRuntime (object, optional): desired runtime service intents; Paperclip forwards these in a standardized paperclip.workspaceRuntime block for remote execution environments
- timeoutSec (number, optional): adapter timeout in seconds (default 120)
- waitTimeoutMs (number, optional): agent.wait timeout override (default timeoutSec * 1000)
- autoPairOnFirstConnect (boolean, optional): on first "pairing required", attempt device.pair.list/device.pair.approve via shared auth, then retry once (default true)
- squadronApiUrl (string, optional): absolute Squadron base URL advertised in wake text

Session routing fields:
- sessionKeyStrategy (string, optional): issue (default), fixed, or run
- sessionKey (string, optional): fixed session key when strategy=fixed (default squadron)

TLS for wss://:
- tlsCaPath (string, optional): path to a PEM file or directory of .pem/.crt files containing the CA or server certificate to trust. Use for self-signed or custom CA gateways (e.g. Moltis). Full verification is performed using that trust store.
- tlsCaPem (string, optional): PEM-encoded CA or server certificate(s) inline. Prefer tlsCaPath when the cert is in a file.
- allowInsecureTls (boolean, optional): when true, skip certificate verification for wss:// (dev/debug only; not for production). Default false.
- For local dev only: connections to wss://localhost, wss://127.0.0.1, or wss://::1 automatically accept any certificate when neither tlsCaPath nor tlsCaPem is set.
`;
