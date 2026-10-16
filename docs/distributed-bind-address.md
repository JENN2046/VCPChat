# Optional distributed HTTP bind address

`VCPDistributedServer/config.env` may set `DIST_SERVER_BIND_ADDRESS=127.0.0.1`.
Omission retains `0.0.0.0`. Explicit values must be IPv4 or IPv6 literals; empty
values, hostnames, scoped IPv6 literals (such as `fe80::1%eth0`) and malformed
addresses fail startup with a configuration error. Scoped IPv6 cannot be encoded
in the callback URL accepted by Node’s HTTP client.
The initial `DIST_SERVER_PORT` and any busy-port fallback use the same address.
An unavailable local address fails rather than widening the listener.

This setting only controls the distributed HTTP listener. Outbound WSS, its
credentials, callback protocol and UI are unchanged. Remove the optional setting
to restore the previous default on the next start. No firewall changes are needed.

Installed Electron builds read the same dotenv format from
`<app.getPath('userData')>/VCPDistributedServer/config.env`, outside `app.asar`.
Create the `VCPDistributedServer` directory and file under the existing Electron
user-data directory, then restart the distributed server/app. The existing
`VCPCHAT_APP_DATA_DIR` override also sets Electron's `userData` directory, so an
isolated installation uses `<VCPCHAT_APP_DATA_DIR>/VCPDistributedServer/config.env`.
A missing file retains the default address and ephemeral port; unreadable files
and invalid explicit addresses fail startup. Source installations and standalone
module callers continue reading `VCPDistributedServer/config.env` beside the
module. Installed builds do not fall back to a file inside the application archive.

Async plugin callbacks use the actual listener address and selected port,
including a port chosen after a conflict. `0.0.0.0` uses `127.0.0.1`, `::` uses
`[::1]`, and specific IPv6 addresses use URL brackets. The callback HTTP path and
forwarding protocol remain unchanged.
