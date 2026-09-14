"""Injected exact-object materializer. No network, Git or filesystem I/O.

Only a complete, verified Projection is returned. Transport credentials, HTTP
stream limits and filesystem placement are deliberately outside this candidate.
There is no archive/checkout fallback, including when Git is absent.
"""
import base64
import binascii
import copy
from dataclasses import dataclass, field
import hashlib
import re

from source_projection_policy import AdmissionError, _entry, plan_projection

MAX_BLOB_BYTES = 64 * 1024 * 1024
MAX_TOTAL_BYTES = 512 * 1024 * 1024


def oid(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value) is not None


def size(value):
    return type(value) is int and 0 <= value < 2 ** 53


def safe_path(path):
    _entry({"path": path, "mode": "100644", "type": "blob", "blob": "0" * 40})
    if ":" in path or "\x7f" in path:
        raise AdmissionError("unsafe path")
    try:
        path.encode("utf-8", errors="strict")
    except UnicodeError:
        raise AdmissionError("invalid path encoding") from None
    return path


def parent_paths(paths):
    return {"/".join(path.split("/")[:i]) for path in paths
            for i in range(1, len(path.split("/")))}


@dataclass(frozen=True)
class SourceFile:
    path: str
    mode: str
    blob: str
    size: int
    sha256: str
    data: bytes = field(repr=False)


@dataclass(frozen=True)
class Projection:
    repository: str
    commit: str
    tree: str
    files: tuple[SourceFile, ...]


def validate_policy(policy, event_commit):
    if not isinstance(policy, dict) or policy.get("schema") != "source-only-materialization/v1":
        raise AdmissionError("unsupported policy")
    if not oid(event_commit) or policy.get("commit") != event_commit or not oid(policy.get("tree")):
        raise AdmissionError("policy/event binding mismatch")
    repository = policy.get("repository")
    if (not isinstance(repository, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository)
            or any(part in {".", ".."} for part in repository.split("/"))):
        raise AdmissionError("invalid repository binding")
    for key in ["approved", "withheld", "required_paths"]:
        if not isinstance(policy.get(key), list):
            raise AdmissionError("malformed policy list")
    entries = policy["approved"] + policy["withheld"]
    for entry in entries:
        path, _ = _entry(entry)
        safe_path(path)
        if not size(entry.get("size")):
            raise AdmissionError("invalid policy size")
    paths = [entry["path"] for entry in entries]
    if len({path.casefold() for path in paths}) != len(paths) or set(paths) & parent_paths(paths):
        raise AdmissionError("colliding policy paths")
    total = 0
    for entry in policy["approved"]:
        if not isinstance(entry.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
            raise AdmissionError("missing admitted content digest")
        if entry["size"] > MAX_BLOB_BYTES:
            raise AdmissionError("blob memory limit exceeded")
        total += entry["size"]
    if total > MAX_TOTAL_BYTES:
        raise AdmissionError("projection memory limit exceeded")
    for path in policy["required_paths"]:
        safe_path(path)
    # Evaluate the frozen policy before even requesting commit/tree metadata.
    plan_projection(event_commit=event_commit, tree_commit=event_commit,
                    tree_entries=entries, truncated=False,
                    approved_entries=policy["approved"], withheld_entries=policy["withheld"],
                    required_paths=policy["required_paths"])


def call(transport, method, *args):
    try:
        result = getattr(transport, method)(*args)
    except Exception:
        # Transport messages may contain headers or response text. Never echo.
        raise AdmissionError("object transport failed; no fallback") from None
    if not isinstance(result, dict):
        raise AdmissionError("malformed object response")
    return result


def materialize_projection(policy, event_commit, transport):
    """Verify exact metadata, then retrieve only admitted blobs into memory.

    The caller supplies an already reviewed policy. A transport is not allowed
    to expand it. Withheld bytes are never requested; a partial Projection is
    never returned. Callers must not substitute an archive-capable transport.
    """
    # Callbacks must not be able to change the authority document mid-transfer.
    policy = copy.deepcopy(policy)
    validate_policy(policy, event_commit)
    if getattr(transport, "kind", None) not in {"git-data-blob-api", "github-public-raw-with-git-data-metadata"}:
        raise AdmissionError("only explicit exact-object transport is allowed")
    repo = policy["repository"]
    commit = call(transport, "get_commit", repo, event_commit)
    if (commit.get("sha") != event_commit or not isinstance(commit.get("tree"), dict)
            or commit["tree"].get("sha") != policy["tree"]):
        raise AdmissionError("commit/tree response mismatch")
    tree = call(transport, "get_tree", repo, policy["tree"])
    if tree.get("sha") != policy["tree"] or tree.get("truncated") is not False or not isinstance(tree.get("tree"), list):
        raise AdmissionError("tree response mismatch or truncation")
    actual, directories, seen = [], set(), set()
    expected = {entry["path"]: entry for entry in policy["approved"] + policy["withheld"]}
    for entry in tree["tree"]:
        if not isinstance(entry, dict):
            raise AdmissionError("malformed tree entry")
        path = safe_path(entry.get("path"))
        if path.casefold() in seen:
            raise AdmissionError("duplicate tree path")
        seen.add(path.casefold())
        if entry.get("type") == "tree":
            if entry.get("mode") != "040000" or not oid(entry.get("sha")):
                raise AdmissionError("invalid directory metadata")
            directories.add(path)
            continue
        normalized = {"path": path, "mode": entry.get("mode"), "type": entry.get("type"), "blob": entry.get("sha")}
        _entry(normalized)
        if path not in expected or not size(entry.get("size")) or entry["size"] != expected[path]["size"]:
            raise AdmissionError("unknown path or size drift")
        actual.append(normalized)
    if directories != parent_paths(expected):
        raise AdmissionError("unknown or missing directory metadata")
    requests = plan_projection(event_commit=event_commit, tree_commit=commit["sha"],
                               tree_entries=actual, truncated=tree["truncated"],
                               approved_entries=policy["approved"], withheld_entries=policy["withheld"],
                               required_paths=policy["required_paths"])
    files = []
    for request in requests:
        admitted = expected[request["path"]]
        response = call(transport, "get_blob", repo, request["blob"])
        if (response.get("sha") != request["blob"] or response.get("encoding") != "base64"
                or not size(response.get("size")) or response["size"] != admitted["size"]):
            raise AdmissionError("blob response identity or size mismatch")
        encoded = response.get("content")
        encoded_size = 4 * ((admitted["size"] + 2) // 3)
        if not isinstance(encoded, str) or len(encoded) > encoded_size * 2 + 2:
            raise AdmissionError("invalid or oversized blob encoding")
        try:
            data = base64.b64decode(encoded.replace("\r", "").replace("\n", ""), validate=True)
        except (ValueError, binascii.Error):
            raise AdmissionError("invalid blob encoding") from None
        digest = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
        digest256 = hashlib.sha256(data).hexdigest()
        if len(data) != admitted["size"] or digest != admitted["blob"] or digest256 != admitted["sha256"]:
            raise AdmissionError("blob content verification failed")
        files.append(SourceFile(admitted["path"], admitted["mode"], digest, len(data), digest256, data))
    return Projection(repo, event_commit, policy["tree"], tuple(files))
