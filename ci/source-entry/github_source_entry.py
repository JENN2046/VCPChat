"""Exact GitHub event source projection; never checkout, archive, Git or LFS.

The workflow pins this controller and its manifest before executing either.
Only required profile inputs are frozen. Unrelated tree entries are never read.
"""
import argparse
import base64
import copy
import hashlib
import json
import os
import re
import tempfile
import urllib.error
import urllib.request
import urllib.parse

from source_materializer import materialize_projection, oid, parent_paths, safe_path, size
from source_projection_policy import AdmissionError, _entry, protected_name
from source_writer import place_projection, validate_native_assets

REPOSITORY = "JENN2046/VCPChat"
API_ROOT = "https://api.github.com"
RAW_ROOT = "https://raw.githubusercontent.com"
METADATA_LIMIT = 8 * 1024 * 1024
MAX_SOURCE_BLOB = 64 * 1024 * 1024


def strict_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise AdmissionError("duplicate JSON key")
            result[key] = value
        return result
    try:
        value = json.loads(data.decode("utf-8"), object_pairs_hook=unique)
    except Exception:
        raise AdmissionError("invalid JSON response") from None
    if not isinstance(value, dict):
        raise AdmissionError("invalid JSON document")
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise AdmissionError("redirect refused")


class GitHubBlobAPI:
    """Public repository only: Git Data metadata, token-free exact raw bodies."""
    kind = "github-public-raw-with-git-data-metadata"

    def __init__(self, token="", opener=None):
        if not isinstance(token, str) or len(token) > 4096 or "\r" in token or "\n" in token:
            raise AdmissionError("invalid credential transport input")
        self._token = token
        self._open = opener or urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()).open
        self._blobs = {}
        self._metadata = {}
        self._body_cache = {}
        self._commit = None

    def _get(self, repository, suffix, limit):
        if repository != REPOSITORY:
            raise AdmissionError("repository mismatch")
        url = f"{API_ROOT}/repos/{REPOSITORY}/git/{suffix}"
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                   "User-Agent": "VCPChat-exact-source-entry"}
        if self._token:
            headers["Authorization"] = "Bearer " + self._token
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with self._open(request, timeout=30) as response:
                if response.status != 200 or response.geturl() != url:
                    raise AdmissionError("unexpected transport destination or status")
                content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                if content_type not in {"application/json", "application/vnd.github+json"}:
                    raise AdmissionError("unexpected response type")
                length = response.headers.get("Content-Length")
                if length is not None and (not re.fullmatch(r"[0-9]+", length) or int(length) > limit):
                    raise AdmissionError("response size bound exceeded")
                data = response.read(limit + 1)
                if len(data) > limit:
                    raise AdmissionError("response size bound exceeded")
        except Exception:
            # Do not expose URLs, headers, credentials, error bodies or server text.
            raise AdmissionError("GitHub object request failed; no fallback") from None
        return strict_json(data)

    def get_commit(self, repository, commit):
        if not oid(commit):
            raise AdmissionError("invalid commit")
        key = ("commit", repository, commit)
        if key not in self._metadata:
            self._metadata[key] = self._get(repository, f"commits/{commit}", METADATA_LIMIT)
        return copy.deepcopy(self._metadata[key])

    def get_tree(self, repository, tree):
        if not oid(tree):
            raise AdmissionError("invalid tree")
        key = ("tree", repository, tree)
        if key not in self._metadata:
            self._metadata[key] = self._get(repository, f"trees/{tree}?recursive=1", METADATA_LIMIT)
        return copy.deepcopy(self._metadata[key])

    def admit_blobs(self, entries, event_commit):
        if not oid(event_commit):
            raise AdmissionError("invalid body commit")
        requests = {}
        for entry in entries:
            safe_path(entry.get("path"))
            if not oid(entry.get("blob")) or not size(entry.get("size")) or entry["size"] > MAX_SOURCE_BLOB:
                raise AdmissionError("invalid admitted blob request")
            if entry["blob"] in requests and requests[entry["blob"]]["size"] != entry["size"]:
                raise AdmissionError("inconsistent object sizes")
            requests.setdefault(entry["blob"], copy.deepcopy(entry))
        self._blobs = requests
        self._commit = event_commit
        self._body_cache = {}

    def get_blob(self, repository, blob):
        if repository != REPOSITORY or blob not in self._blobs or not oid(self._commit):
            raise AdmissionError("blob request was not admitted")
        if blob in self._body_cache:
            return copy.deepcopy(self._body_cache[blob])
        entry = self._blobs[blob]
        url = f"{RAW_ROOT}/{REPOSITORY}/{self._commit}/{urllib.parse.quote(entry['path'], safe='/')}"
        # Never attach GITHUB_TOKEN to this public body transport. No redirects,
        # ambient proxy, Git, archive or LFS fallback is permitted.
        request = urllib.request.Request(url, headers={
            "User-Agent": "VCPChat-exact-source-entry", "Accept-Encoding": "identity"}, method="GET")
        try:
            with self._open(request, timeout=30) as response:
                if response.status != 200 or response.geturl() != url:
                    raise AdmissionError("unexpected body destination or status")
                length = response.headers.get("Content-Length")
                if length is not None and (not re.fullmatch(r"[0-9]+", length) or int(length) != entry["size"]):
                    raise AdmissionError("body size mismatch")
                if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                    raise AdmissionError("encoded body refused")
                data = response.read(entry["size"] + 1)
        except Exception:
            raise AdmissionError("public source request failed; no fallback") from None
        actual_oid = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
        if (len(data), actual_oid, hashlib.sha256(data).hexdigest()) != (entry["size"], blob, entry["sha256"]):
            raise AdmissionError("public source identity mismatch")
        result = {"sha": blob, "size": len(data), "encoding": "base64",
                  "content": base64.b64encode(data).decode("ascii")}
        self._body_cache[blob] = result
        return copy.deepcopy(result)


def _identity(entry):
    path, _ = _entry(entry)
    safe_path(path)
    if not size(entry.get("size")):
        raise AdmissionError("invalid admitted size")
    if not re.fullmatch(r"[0-9a-f]{64}", entry.get("sha256", "")):
        raise AdmissionError("missing admitted digest")
    return path


def scanned_paths(actual, rules):
    """Mirror only the manifest's reviewed filesystem-enumeration boundaries."""
    if not isinstance(rules, list):
        raise AdmissionError("invalid enumeration rules")
    required = set()
    for rule in rules:
        if not isinstance(rule, dict) or set(rule) - {"name", "roots", "files", "suffixes", "ignore_components", "exclude_paths", "case_insensitive_suffixes", "exclude_suffixes", "exclude_name_prefixes", "exclude_roots"}:
            raise AdmissionError("invalid enumeration rule")
        for key in ("roots", "files", "suffixes", "ignore_components", "exclude_paths", "exclude_suffixes", "exclude_name_prefixes", "exclude_roots"):
            if not isinstance(rule.get(key, []), list) or any(not isinstance(x, str) or not x for x in rule.get(key, [])):
                raise AdmissionError("invalid enumeration rule list")
        roots = [safe_path(x) for x in rule.get("roots", [])]
        files = {safe_path(x) for x in rule.get("files", [])}
        excluded = {safe_path(x) for x in rule.get("exclude_paths", [])}
        excluded_roots = [safe_path(x) for x in rule.get("exclude_roots", [])]
        ignored = set(rule.get("ignore_components", []))
        suffixes = rule.get("suffixes", [])
        if any(not x.startswith(".") or "/" in x or "\\" in x for x in suffixes + rule.get("exclude_suffixes", [])):
            raise AdmissionError("invalid enumeration suffix")
        for path, row in actual.items():
            if row.get("type") == "tree" or path in excluded or ignored.intersection(path.split("/")):
                continue
            if (any(path == root or path.startswith(root + "/") for root in excluded_roots)
                    or any(path.endswith(suffix) for suffix in rule.get("exclude_suffixes", []))
                    or any(part.startswith(prefix) for part in path.split("/") for prefix in rule.get("exclude_name_prefixes", []))):
                continue
            if path not in files and not any(path.startswith(root + "/") for root in roots):
                continue
            compared = path.lower() if rule.get("case_insensitive_suffixes") is True else path
            if suffixes and not any(compared.endswith(suffix) for suffix in suffixes):
                continue
            required.add(path)
    return required


def prepare_event_policy(manifest, event_commit, profile, transport):
    """All selected identities and every held alias are checked before blobs.

    The existing core receives a verified selected-tree view, not a fabricated
    historical commit. Its repo/commit/tree and each leaf come from this event.
    """
    manifest = copy.deepcopy(manifest)
    if (manifest.get("schema") != "vcpchat-ci-source-profiles/v1"
            or manifest.get("repository") != REPOSITORY or not oid(event_commit)):
        raise AdmissionError("manifest or event binding mismatch")
    selected = manifest.get("profiles", {}).get(profile)
    if not isinstance(selected, dict) or selected.get("ready") is not True:
        raise AdmissionError("profile has unresolved required inputs")
    approved = selected.get("entries")
    if not isinstance(approved, list) or not approved:
        raise AdmissionError("empty required profile")
    by_path = {}
    for entry in approved:
        path = _identity(entry)
        if entry.get("kind") not in {"source", "static-asset", "static-native"}:
            raise AdmissionError("missing source admission category")
        if path.lower().endswith((".exe", ".dll", ".so", ".dylib", ".node")) and entry["kind"] != "static-native":
            raise AdmissionError("native path lacks separate admission")
        if path in by_path or protected_name(path) or path in manifest.get("denied_paths", []):
            raise AdmissionError("duplicate or protected selected input")
        by_path[path] = entry
    commit = transport.get_commit(REPOSITORY, event_commit)
    if commit.get("sha") != event_commit or not isinstance(commit.get("tree"), dict) or not oid(commit["tree"].get("sha")):
        raise AdmissionError("event commit response mismatch")
    tree_id = commit["tree"]["sha"]
    tree = transport.get_tree(REPOSITORY, tree_id)
    if tree.get("sha") != tree_id or tree.get("truncated") is not False or not isinstance(tree.get("tree"), list):
        raise AdmissionError("incomplete event tree")
    actual, folded = {}, set()
    for entry in tree["tree"]:
        if not isinstance(entry, dict):
            raise AdmissionError("malformed event tree")
        path = safe_path(entry.get("path"))
        if path.casefold() in folded or not oid(entry.get("sha")):
            raise AdmissionError("duplicate or malformed event path")
        folded.add(path.casefold())
        actual[path] = entry
    denied_oids = set(manifest.get("denied_blobs", []))
    if any(not oid(value) for value in denied_oids):
        raise AdmissionError("invalid held object identity")
    for path, entry in actual.items():
        if protected_name(path) or path in manifest.get("denied_paths", []):
            denied_oids.add(entry["sha"])
    if not scanned_paths(actual, selected.get("required_scans", [])).issubset(by_path):
        raise AdmissionError("required enumerated input lacks admission")
    allowed_aliases = manifest.get("ordinary_aliases", {})
    selected_oids = {entry["blob"] for entry in approved}
    if selected_oids & denied_oids:
        raise AdmissionError("selected source aliases held content")
    for path, entry in actual.items():
        if path not in by_path and entry["sha"] in selected_oids:
            # Existing separately admitted ordinary aliases may remain unmaterialized.
            alias = allowed_aliases.get(path)
            if (not isinstance(alias, dict) or _identity(alias) != path
                    or alias["blob"] != entry["sha"] or alias["mode"] != entry.get("mode")
                    or entry.get("type") != "blob" or alias["size"] != entry.get("size")):
                raise AdmissionError("unadmitted alias of selected content")
    rows = []
    for path, admitted in by_path.items():
        row = actual.get(path, {})
        if (row.get("sha"), row.get("mode"), row.get("type"), row.get("size")) != (
                admitted["blob"], admitted["mode"], "blob", admitted["size"]):
            raise AdmissionError("required event source missing or changed")
        rows.append(copy.deepcopy(row))
    for path in sorted(parent_paths(by_path)):
        row = actual.get(path, {})
        if row.get("type") != "tree" or row.get("mode") != "040000":
            raise AdmissionError("required directory metadata missing")
        rows.append(copy.deepcopy(row))
    policy = {"schema": "source-only-materialization/v1", "repository": REPOSITORY,
              "commit": event_commit, "tree": tree_id, "approved": approved, "withheld": [],
              "required_paths": sorted(by_path), "static_native_assets": selected.get("static_native_assets", [])}
    from source_materializer import validate_policy
    validate_policy(policy, event_commit)
    native = validate_native_assets(policy)
    if set(native) != {entry["path"] for entry in approved if entry["kind"] == "static-native"}:
        raise AdmissionError("native source category and exact admission differ")
    transport.admit_blobs(approved, event_commit)
    return policy, commit, {"sha": tree_id, "truncated": False, "tree": rows}


class SelectedTreeTransport:
    kind = "github-public-raw-with-git-data-metadata"

    def __init__(self, upstream, commit, tree):
        self.upstream, self.commit, self.tree = upstream, commit, tree

    def get_commit(self, repository, commit):
        if repository != REPOSITORY or commit != self.commit["sha"]:
            raise AdmissionError("selected commit mismatch")
        return copy.deepcopy(self.commit)

    def get_tree(self, repository, tree):
        if repository != REPOSITORY or tree != self.tree["sha"]:
            raise AdmissionError("selected tree mismatch")
        return copy.deepcopy(self.tree)

    def get_blob(self, repository, blob):
        return self.upstream.get_blob(repository, blob)


def _complete_metadata(transport, commit_id, expected_tree=None):
    if not oid(commit_id) or (expected_tree is not None and not oid(expected_tree)):
        raise AdmissionError("invalid context version")
    commit = transport.get_commit(REPOSITORY, commit_id)
    tree_id = commit.get("tree", {}).get("sha")
    if commit.get("sha") != commit_id or not oid(tree_id) or (expected_tree and tree_id != expected_tree):
        raise AdmissionError("context commit identity mismatch")
    tree = transport.get_tree(REPOSITORY, tree_id)
    if tree.get("sha") != tree_id or tree.get("truncated") is not False or not isinstance(tree.get("tree"), list):
        raise AdmissionError("incomplete context tree")
    entries, seen = [], set()
    for row in tree["tree"]:
        if not isinstance(row, dict):
            raise AdmissionError("invalid context metadata")
        path = safe_path(row.get("path"))
        if path.casefold() in seen or not oid(row.get("sha")):
            raise AdmissionError("duplicate or invalid context identity")
        seen.add(path.casefold())
        if row.get("type") == "tree":
            if row.get("mode") != "040000":
                raise AdmissionError("invalid context directory")
            continue
        if (row.get("type"), row.get("mode")) not in {("blob", "100644"), ("blob", "100755"), ("blob", "120000"), ("commit", "160000")}:
            raise AdmissionError("invalid context leaf type")
        entry = {key: row[key] for key in ("path", "mode", "type", "sha")}
        if "size" in row:
            if not size(row["size"]): raise AdmissionError("invalid context size")
            entry["size"] = row["size"]
        entries.append(entry)
    return {"commit": commit_id, "tree": tree_id, "entries": sorted(entries, key=lambda row: row["path"])}


def prepare_source_context(manifest, profile, event_commit, transport, approved):
    settings = manifest["profiles"][profile].get("source_context")
    if settings is None:
        return None
    if not isinstance(settings, dict) or set(settings) != {"source", "upstream"}:
        raise AdmissionError("invalid context baseline settings")
    context = {"schema": "vcpchat-ci-source-context/v1", "repository": REPOSITORY,
               "event": _complete_metadata(transport, event_commit), "projection": copy.deepcopy(approved)}
    event_rows = {row["path"]: row for row in context["event"]["entries"]}
    for row in approved:
        actual = event_rows.get(row["path"], {})
        if (actual.get("sha"), actual.get("mode"), actual.get("type"), actual.get("size")) != (row["blob"], row["mode"], "blob", row["size"]):
            raise AdmissionError("context and admitted event projection differ")
    for role in ("source", "upstream"):
        pin = settings[role]
        if not isinstance(pin, dict) or set(pin) != {"commit", "tree"}:
            raise AdmissionError("missing exact context pin")
        context[role] = _complete_metadata(transport, pin["commit"], pin["tree"])
    return context


def project_event(manifest, event_commit, profile, transport, private_parent, context_output=None):
    manifest = copy.deepcopy(manifest)
    policy, commit, tree = prepare_event_policy(manifest, event_commit, profile, transport)
    context = prepare_source_context(manifest, profile, event_commit, transport, policy["approved"])
    projection = materialize_projection(policy, event_commit, SelectedTreeTransport(transport, commit, tree))
    placed = place_projection(projection, policy, event_commit, private_parent)
    if context is not None:
        data = (json.dumps(context, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
        # Context is metadata only and stays outside the source directory.
        with tempfile.NamedTemporaryFile(prefix="verified-ci-context-", suffix=".json", dir=private_parent, delete=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            context_path = stream.name
        with open(context_path, "rb") as stream:
            if stream.read(len(data) + 1) != data:
                raise AdmissionError("context placement mismatch")
        if context_output is not None:
            context_output.update(path=context_path, sha256=hashlib.sha256(data).hexdigest())
    return placed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--profile", required=True)
    args = parser.parse_args()
    try:
        if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY:
            raise AdmissionError("unexpected event repository")
        with open(args.manifest, "rb") as stream:
            data = stream.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024:
            raise AdmissionError("manifest limit exceeded")
        manifest = strict_json(data)
        parent = tempfile.mkdtemp(prefix="vcp-source-", dir=os.environ["RUNNER_TEMP"])
        context_output = {}
        result = project_event(manifest, os.environ["GITHUB_SHA"], args.profile,
                               GitHubBlobAPI(os.environ.get("SOURCE_ENTRY_TOKEN", "")), parent, context_output)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"directory={result.directory}\n")
            if context_output:
                output.write(f"context_path={context_output['path']}\ncontext_sha256={context_output['sha256']}\n")
        print(f"Verified source projection: {result.file_count} files; event commit {result.commit}")
    except Exception:
        raise SystemExit("Source projection failed; no checkout or fallback; no completed source directory published") from None


if __name__ == "__main__":
    main()
