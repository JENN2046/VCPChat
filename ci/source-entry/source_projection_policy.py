"""Exact projection policy. Metadata only; no Git, HTTP or file I/O.

The caller must obtain the event commit's complete tree, never an archive.
The event adapter verifies the complete tree before supplying a selected view.
"""

import re
from pathlib import PurePosixPath


class AdmissionError(ValueError):
    pass


def protected_name(path):
    parts = PurePosixPath(path).parts
    lowered = [part.lower() for part in parts]
    name = lowered[-1]
    if any(part in {"state-private", "localstate", "secrets", "credentials", "tokens", "cookies"} for part in lowered[:-1]):
        return True
    template = name in {".env.example", "config.env.example"} or name.endswith((".template", ".example"))
    return not template and (
        name == ".env" or name.startswith(".env.") or name == "config.env"
        or name in {"id_rsa", "id_ed25519", "credentials.json", "token.json", "secrets.json"}
        or name.endswith((".pem", ".key", ".p12", ".pfx", ".log", ".sqlite", ".sqlite3", ".db"))
    )


def _entry(row):
    if not isinstance(row, dict):
        raise AdmissionError("malformed tree entry")
    path = row.get("path")
    if (not isinstance(path, str) or not path or path.startswith("/") or "\\" in path
            or any(ord(char) < 32 for char in path)
            or any(part in {"", ".", ".."} for part in path.split("/"))):
        raise AdmissionError("unsafe path")
    if row.get("type") != "blob" or row.get("mode") not in {"100644", "100755"}:
        raise AdmissionError("unapproved file type or mode")
    if not isinstance(row.get("blob"), str) or not re.fullmatch(r"[0-9a-f]{40}", row["blob"]):
        raise AdmissionError("invalid blob identity")
    return path, (row["mode"], row["type"], row["blob"])


def plan_projection(*, event_commit, tree_commit, tree_entries, truncated,
                    approved_entries, withheld_entries, required_paths):
    """Return exact approved object requests only after all metadata checks pass.

    Approved and withheld identities must be independently reviewed for the
    current event tree. Unknown files, changed blobs/modes, or incomplete input
    sets fail before returning even the first request. Withheld bodies have no
    hydration path. This preserves the requested test set rather than silently
    executing a smaller projection.
    """
    if not re.fullmatch(r"[0-9a-f]{40}", event_commit or "") or tree_commit != event_commit:
        raise AdmissionError("event/tree commit mismatch")
    if truncated is not False:
        raise AdmissionError("incomplete tree metadata")
    approved = {}
    withheld = {}
    for rows, dest in [(approved_entries, approved), (withheld_entries, withheld)]:
        for row in rows:
            path, identity = _entry(row)
            if path in approved or path in withheld:
                raise AdmissionError("duplicate or overlapping policy entry")
            if dest is approved and protected_name(path):
                raise AdmissionError("protected path cannot be approved")
            dest[path] = identity
    if {item[2] for item in approved.values()} & {item[2] for item in withheld.values()}:
        raise AdmissionError("approved object aliases withheld bytes")
    expected = {**approved, **withheld}
    actual = {}
    for row in tree_entries:
        path, identity = _entry(row)
        if path in actual:
            raise AdmissionError("duplicate tree path")
        actual[path] = identity
        if path not in expected:
            raise AdmissionError("unknown path requires prior admission")
        if identity != expected[path]:
            raise AdmissionError("path mode or blob drift")
    if actual != expected:
        raise AdmissionError("missing or changed expected tree entry")
    required = set(required_paths)
    if not required.issubset(approved):
        raise AdmissionError("required validation inputs are not all approved")
    return [{"path": name, "mode": identity[0], "type": identity[1], "blob": identity[2]}
            for name, identity in sorted(approved.items())]
