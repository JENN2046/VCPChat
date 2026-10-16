# Optional distributed HTTP bind address

`VCPDistributedServer/config.env` may set `DIST_SERVER_BIND_ADDRESS=127.0.0.1`.
Omission retains `0.0.0.0`. Explicit values must be IPv4 or IPv6 literals; empty
values, hostnames and malformed addresses fail startup with a configuration error.
The initial `DIST_SERVER_PORT` and any busy-port fallback use the same address.
An unavailable local address fails rather than widening the listener.

This setting only controls the distributed HTTP listener. Outbound WSS, its
credentials, callback protocol and UI are unchanged. Remove the optional setting
to restore the previous default on the next start. No firewall changes are needed.
