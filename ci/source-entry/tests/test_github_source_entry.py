"""Synthetic HTTP and private temporary placement; no network or project code."""
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import github_source_entry as entry
from source_projection_policy import AdmissionError

COMMIT, TREE = "a" * 40, "b" * 40


def source(path="src/main.py", data=b"print('synthetic')\n", kind="source"):
    return {"path": path, "mode": "100644", "type": "blob", "size": len(data),
            "blob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(),
            "sha256": hashlib.sha256(data).hexdigest(), "kind": kind}


def setup(entries=None):
    rows = entries or [source()]
    manifest = {"schema": "vcpchat-ci-source-profiles/v1", "repository": entry.REPOSITORY,
                "profiles": {"test": {"ready": True, "entries": rows, "static_native_assets": []}},
                "denied_paths": ["reports/private-diagnostic.json"], "denied_blobs": [], "ordinary_aliases": {}}
    tree_rows = [{"path": row["path"], "mode": row["mode"], "type": "blob",
                  "sha": row["blob"], "size": row["size"]} for row in rows]
    for path in sorted(entry.parent_paths([r["path"] for r in rows])):
        tree_rows.append({"path": path, "mode": "040000", "type": "tree", "sha": "d" * 40})
    return manifest, {"sha": COMMIT, "tree": {"sha": TREE}}, {"sha": TREE, "truncated": False, "tree": tree_rows}


class Response:
    def __init__(self, url, body, content_type="application/json", status=200, **headers):
        self.url, self.body, self.status = url, io.BytesIO(body), status
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body)), **headers}
    def geturl(self): return self.url
    def read(self, n): return self.body.read(n)
    def __enter__(self): return self
    def __exit__(self, *_): return None


class Server:
    def __init__(self, commit, tree, data=b"print('synthetic')\n"):
        self.commit, self.tree, self.data, self.calls = commit, tree, data, []
        self.change = None
    def __call__(self, request, timeout):
        self.calls.append(request)
        if self.change:
            changed = self.change(request)
            if changed is not None: return changed
        url = request.full_url
        if "/git/commits/" in url: return Response(url, json.dumps(self.commit).encode())
        if "/git/trees/" in url: return Response(url, json.dumps(self.tree).encode())
        if url.startswith(entry.RAW_ROOT + "/"): return Response(url, self.data, "text/plain")
        raise AssertionError("unexpected endpoint")
    @property
    def bodies(self): return [r for r in self.calls if r.full_url.startswith(entry.RAW_ROOT)]


class EntryTests(unittest.TestCase):
    def fixture(self, rows=None, data=b"print('synthetic')\n"):
        manifest, commit, tree = setup(rows)
        server = Server(commit, tree, data)
        return manifest, server, entry.GitHubBlobAPI("synthetic-token", server)

    def reject_before_body(self, mutate):
        manifest, server, api = self.fixture()
        mutate(manifest, server)
        with tempfile.TemporaryDirectory() as parent, self.assertRaises(AdmissionError):
            entry.project_event(manifest, COMMIT, "test", api, parent)
        self.assertEqual(server.bodies, [])

    def test_complete_private_placement_and_event_binding(self):
        manifest, server, api = self.fixture()
        with tempfile.TemporaryDirectory() as parent:
            result = entry.project_event(manifest, COMMIT, "test", api, parent)
            self.assertEqual(result.commit, COMMIT)
            self.assertEqual(result.tree, TREE)
            self.assertEqual(Path(result.directory, "src/main.py").read_bytes(), server.data)
            self.assertEqual(os.stat(result.directory).st_mode & 0o777, 0o700)
        self.assertEqual(len(server.calls), 3)
        self.assertTrue(all(r.has_header("Authorization") for r in server.calls[:2]))
        self.assertFalse(server.bodies[0].has_header("Authorization"))

    def test_future_event_commit_with_same_required_sources_is_valid(self):
        manifest, server, api = self.fixture(); future = "e" * 40; server.commit["sha"] = future
        with tempfile.TemporaryDirectory() as parent:
            result = entry.project_event(manifest, future, "test", api, parent)
            self.assertEqual(result.commit, future)
        self.assertIn("/" + future + "/", server.bodies[0].full_url)

    def test_unrelated_new_source_is_not_requested(self):
        manifest, server, api = self.fixture()
        server.tree["tree"].append({"path": "unrelated.js", "mode": "100644", "type": "blob", "sha": "f"*40, "size": 7})
        with tempfile.TemporaryDirectory() as parent:
            self.assertEqual(entry.project_event(manifest, COMMIT, "test", api, parent).file_count, 1)
        self.assertEqual(len(server.bodies), 1)

    def test_repository_mismatch(self): self.reject_before_body(lambda m,s: m.update(repository="other/repo"))
    def test_event_commit_mismatch(self): self.reject_before_body(lambda m,s: s.commit.update(sha="e"*40))
    def test_tree_identity_mismatch(self): self.reject_before_body(lambda m,s: s.tree.update(sha="e"*40))
    def test_truncated_tree(self): self.reject_before_body(lambda m,s: s.tree.update(truncated=True))
    def test_missing_required_source(self): self.reject_before_body(lambda m,s: s.tree["tree"].pop(0))
    def test_changed_required_oid(self): self.reject_before_body(lambda m,s: s.tree["tree"][0].update(sha="e"*40))
    def test_size_drift(self): self.reject_before_body(lambda m,s: s.tree["tree"][0].update(size=999))
    def test_symlink(self): self.reject_before_body(lambda m,s: s.tree["tree"][0].update(mode="120000"))
    def test_submodule(self): self.reject_before_body(lambda m,s: s.tree["tree"][0].update(type="commit", mode="160000"))
    def test_parent_directory_missing(self): self.reject_before_body(lambda m,s: s.tree["tree"].pop())
    def test_duplicate_case_path(self): self.reject_before_body(lambda m,s: s.tree["tree"].append({**s.tree["tree"][0], "path":"SRC/MAIN.PY"}))
    def test_path_traversal(self): self.reject_before_body(lambda m,s: s.tree["tree"][0].update(path="../main.py"))
    def test_profile_unready(self): self.reject_before_body(lambda m,s: m["profiles"]["test"].update(ready=False))
    def test_historical_held_oid(self): self.reject_before_body(lambda m,s: m["denied_blobs"].append(s.tree["tree"][0]["sha"]))
    def test_protected_alias(self): self.reject_before_body(lambda m,s: s.tree["tree"].append({**s.tree["tree"][0], "path":".env"}))
    def test_known_held_diagnostic_alias(self): self.reject_before_body(lambda m,s: s.tree["tree"].append({**s.tree["tree"][0], "path":"reports/private-diagnostic.json"}))
    def test_unknown_ordinary_alias_rejected(self): self.reject_before_body(lambda m,s: s.tree["tree"].append({**s.tree["tree"][0], "path":"copy.py"}))

    def test_exact_ordinary_alias_not_downloaded(self):
        manifest, server, api = self.fixture(); alias = {**manifest["profiles"]["test"]["entries"][0], "path":"copy.py"}
        manifest["ordinary_aliases"]["copy.py"] = alias
        server.tree["tree"].append({**server.tree["tree"][0], "path":"copy.py"})
        with tempfile.TemporaryDirectory() as parent:
            self.assertEqual(entry.project_event(manifest, COMMIT, "test", api, parent).file_count, 1)
        self.assertEqual(len(server.bodies), 1)

    def test_policy_is_copied_before_transport_callback(self):
        manifest, server, api = self.fixture()
        def change(_):
            manifest["profiles"]["test"]["entries"][0]["sha256"] = "0"*64
        server.change = change
        with tempfile.TemporaryDirectory() as parent:
            self.assertEqual(entry.project_event(manifest, COMMIT, "test", api, parent).file_count, 1)

    def test_raw_request_before_admission_refused(self):
        _, server, api = self.fixture()
        with self.assertRaises(AdmissionError): api.get_blob(entry.REPOSITORY, source()["blob"])
        self.assertEqual(server.calls, [])

    def test_duplicate_source_blob_is_downloaded_once(self):
        rows = [source(), source("src/copy.py")]; manifest, server, api = self.fixture(rows)
        with tempfile.TemporaryDirectory() as parent:
            self.assertEqual(entry.project_event(manifest, COMMIT, "test", api, parent).file_count, 2)
        self.assertEqual(len(server.bodies), 1)

    def test_unicode_path_is_encoded_and_sha_bound(self):
        manifest, server, api = self.fixture([source("src/普通.py")])
        with tempfile.TemporaryDirectory() as parent: entry.project_event(manifest, COMMIT, "test", api, parent)
        self.assertIn("%E6%99%AE%E9%80%9A.py", server.bodies[0].full_url)

    def reject_body(self, change):
        manifest, server, api = self.fixture(); server.change = lambda r: change(r) if r.full_url.startswith(entry.RAW_ROOT) else None
        with tempfile.TemporaryDirectory() as parent:
            with self.assertRaises(AdmissionError): entry.project_event(manifest, COMMIT, "test", api, parent)
            self.assertEqual(os.listdir(parent), [])
        self.assertEqual(len(server.bodies), 1)

    def test_redirect_destination(self): self.reject_body(lambda r: Response("https://example.invalid/", b"x"))
    def test_redirect_status(self): self.reject_body(lambda r: Response(r.full_url, b"x", status=302))
    def test_oversize_body(self): self.reject_body(lambda r: Response(r.full_url, b"x"*999))
    def test_truncated_body(self): self.reject_body(lambda r: Response(r.full_url, b"x"))
    def test_same_length_forged_body(self): self.reject_body(lambda r: Response(r.full_url, b"x"*len(b"print('synthetic')\n")))
    def test_compressed_body_refused(self): self.reject_body(lambda r: Response(r.full_url, b"print('synthetic')\n", **{"Content-Encoding":"gzip"}))
    def test_transport_exception_does_not_echo(self):
        def fail(_): raise RuntimeError("synthetic-private-error")
        manifest, server, api = self.fixture(); server.change = fail
        with tempfile.TemporaryDirectory() as parent:
            with self.assertRaises(AdmissionError) as error: entry.project_event(manifest, COMMIT, "test", api, parent)
        self.assertNotIn("synthetic-private-error", str(error.exception))

    def test_native_requires_explicit_metadata_admission(self):
        data = b"\x7fELFsynthetic-not-executed"; row = source("bin/helper", data, "static-native")
        manifest, server, api = self.fixture([row], data)
        with tempfile.TemporaryDirectory() as parent, self.assertRaises(AdmissionError): entry.project_event(manifest, COMMIT, "test", api, parent)
        self.assertEqual(server.bodies, [])

    def test_exact_static_native_is_placed_but_never_executed(self):
        data = b"\x7fELFsynthetic-not-executed"; row = source("bin/helper", data, "static-native")
        manifest, server, api = self.fixture([row], data)
        manifest["profiles"]["test"]["static_native_assets"] = [{**row,"format":"ELF"}]
        with tempfile.TemporaryDirectory() as parent:
            result = entry.project_event(manifest, COMMIT, "test", api, parent)
            self.assertEqual(Path(result.directory,"bin/helper").read_bytes(), data)
            self.assertEqual(os.stat(Path(result.directory,"bin/helper")).st_mode & 0o777, 0o600)

    def test_native_magic_in_unapproved_source_is_rejected(self):
        data = b"\x7fELFsynthetic"; manifest, server, api = self.fixture([source("src/main.py",data)], data)
        with tempfile.TemporaryDirectory() as parent:
            with self.assertRaises(AdmissionError): entry.project_event(manifest, COMMIT, "test", api, parent)
            self.assertEqual(os.listdir(parent), [])

    def test_duplicate_json_key(self):
        with self.assertRaises(AdmissionError): entry.strict_json(b'{"sha":"a","sha":"b"}')

    def test_new_file_in_required_scan_fails_before_body(self):
        def mutate(m,s):
            m["profiles"]["test"]["required_scans"] = [{"roots":["src"],"suffixes":[".py"]}]
            s.tree["tree"].append({"path":"src/new.py","type":"blob","mode":"100644","sha":"f"*40,"size":1})
        self.reject_before_body(mutate)

    def test_scan_ignores_only_exact_reviewed_exclusions(self):
        rule={"roots":["src"],"suffixes":[".py"],"ignore_components":["vendor"],"exclude_paths":["src/private.py"]}
        rows={p:{"type":"blob"} for p in ["src/main.py","src/vendor/extra.py","src/private.py","src/private2.py","unrelated.py"]}
        self.assertEqual(entry.scanned_paths(rows,[rule]),{"src/main.py","src/private2.py"})

    def test_scan_covers_unicode_and_does_not_follow_symlinks(self):
        rows={"src/中文.py":{"type":"blob","mode":"120000"}}
        self.assertEqual(entry.scanned_paths(rows,[{"roots":["src"],"suffixes":[".py"]}]),set(rows))

    def test_scan_suffix_case_matches_the_original_rule(self):
        rows={"src/UI.JS":{"type":"blob"},"src/ui.js":{"type":"blob"}}
        self.assertEqual(entry.scanned_paths(rows,[{"roots":["src"],"suffixes":[".js"]}]),{"src/ui.js"})
        self.assertEqual(entry.scanned_paths(rows,[{"roots":["src"],"suffixes":[".js"],"case_insensitive_suffixes":True}]),set(rows))

    def test_package_default_exclusions_do_not_hide_other_sources(self):
        rows={p:{"type":"blob"} for p in ["src/code.js","src/lib.csproj","src/.gitignore","src/._resource","src/pkg/package-lock.json","src/nested/lib.dll"]}
        rule={"roots":["src"],"exclude_suffixes":[".csproj"],"ignore_components":[".gitignore","package-lock.json"],"exclude_name_prefixes":["._"]}
        self.assertEqual(entry.scanned_paths(rows,[rule]),{"src/code.js","src/nested/lib.dll"})

    def context_fixture(self):
        manifest,server,api=self.fixture()
        source_commit,upstream_commit="1"*40,"2"*40;source_tree,upstream_tree="3"*40,"4"*40
        manifest["profiles"]["test"]["source_context"]={"source":{"commit":source_commit,"tree":source_tree},"upstream":{"commit":upstream_commit,"tree":upstream_tree}}
        metadata={"commits/"+source_commit:{"sha":source_commit,"tree":{"sha":source_tree}},"commits/"+upstream_commit:{"sha":upstream_commit,"tree":{"sha":upstream_tree}},
                  "trees/"+source_tree+"?recursive=1":{"sha":source_tree,"truncated":False,"tree":[{"path":".env","mode":"100644","type":"blob","sha":"5"*40,"size":10}]},
                  "trees/"+upstream_tree+"?recursive=1":{"sha":upstream_tree,"truncated":False,"tree":copy.deepcopy(server.tree["tree"])}}
        def change(request):
            suffix=request.full_url.split("/git/")[-1]
            if suffix in metadata:return Response(request.full_url,json.dumps(metadata[suffix]).encode())
        server.change=change
        return manifest,server,api,metadata

    def test_complete_metadata_context_is_outside_projection_and_hash_bound(self):
        manifest,server,api,_=self.context_fixture();output={}
        with tempfile.TemporaryDirectory() as parent:
            result=entry.project_event(manifest,COMMIT,"test",api,parent,output)
            path=Path(output["path"])
            self.assertEqual(path.parent,Path(parent));self.assertNotEqual(path.parent,Path(result.directory))
            raw=path.read_bytes();context=json.loads(raw)
            self.assertEqual(hashlib.sha256(raw).hexdigest(),output["sha256"])
            self.assertEqual(context["event"]["commit"],COMMIT)
            self.assertEqual(context["source"]["entries"][0]["path"],".env")
            self.assertEqual(os.stat(path).st_mode&0o777,0o600)
            self.assertEqual(context["projection"],manifest["profiles"]["test"]["entries"])
        self.assertEqual(len(server.calls),7)
        self.assertEqual(len(server.bodies),1)
        self.assertTrue(server.calls[-1].full_url.startswith(entry.RAW_ROOT))

    def test_truncated_historical_metadata_fails_before_project_body(self):
        manifest,server,api,metadata=self.context_fixture();metadata["trees/"+"3"*40+"?recursive=1"]["truncated"]=True;output={}
        with tempfile.TemporaryDirectory() as parent:
            with self.assertRaises(AdmissionError):entry.project_event(manifest,COMMIT,"test",api,parent,output)
            self.assertEqual(os.listdir(parent),[]);self.assertEqual(output,{})
        self.assertEqual(server.bodies,[])

    def test_context_baseline_tree_pin_mismatch_fails_before_body(self):
        manifest,server,api,metadata=self.context_fixture();metadata["commits/"+"1"*40]["tree"]["sha"]="9"*40
        with tempfile.TemporaryDirectory() as parent,self.assertRaises(AdmissionError):entry.project_event(manifest,COMMIT,"test",api,parent)
        self.assertEqual(server.bodies,[])

    def test_context_metadata_cannot_change_event_projection(self):
        manifest,server,api,_=self.context_fixture();server.tree["tree"][0]["size"]+=1
        with tempfile.TemporaryDirectory() as parent,self.assertRaises(AdmissionError):entry.project_event(manifest,COMMIT,"test",api,parent)
        self.assertEqual(server.bodies,[])


if __name__ == "__main__": unittest.main()
