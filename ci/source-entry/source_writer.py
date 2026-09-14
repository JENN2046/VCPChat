"""Linux-only private source placement; no networking, Git or source execution.

The caller owns an exclusive, private parent directory and supplies an admitted
policy. Success returns a fresh directory; existing destinations are never used.
Failed attempts retain their private staging directory without publishing a
success handle. This is not a transactional installation or crash recovery tool.
"""
import copy
from dataclasses import dataclass, field
import hashlib
import os
import secrets
import stat

from source_materializer import Projection, SourceFile, validate_policy
from source_projection_policy import AdmissionError


class PlacementError(AdmissionError):
    pass


@dataclass(frozen=True)
class PlacedProjection:
    repository: str
    commit: str
    tree: str
    file_count: int
    directory: str = field(repr=False)


def _native_format(data):
    if data.startswith(b"\x7fELF"):
        return "ELF"
    if data.startswith(b"MZ"):
        return "PE"
    if data[:4] in {b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xcf\xfa\xed\xfe"}:
        return "Mach-O"
    if data[:4] in {b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca", b"\xca\xfe\xba\xbf", b"\xbf\xba\xfe\xca", b"\0asm"}:
        return "other-executable-format"
    return None


def validate_native_assets(policy):
    admitted = {row["path"]: row for row in policy["approved"]}
    native_assets = {}
    native_rows = policy.get("static_native_assets", [])
    if not isinstance(native_rows, list) or any(not isinstance(row, dict) for row in native_rows):
        raise PlacementError("malformed native asset admission")
    for row in native_rows:
        path = row.get("path")
        if (path in native_assets or path not in admitted
                or any(row.get(key) != admitted[path].get(key) for key in ("mode", "blob", "size", "sha256"))
                or row.get("format") not in {"ELF", "PE", "Mach-O"}):
            raise PlacementError("invalid separately admitted native asset")
        native_assets[path] = row
    return native_assets


def _files(projection, policy, event_commit):
    policy = copy.deepcopy(policy)
    validate_policy(policy, event_commit)
    if (type(projection) is not Projection or type(projection.files) is not tuple
            or (projection.repository, projection.commit, projection.tree)
            != (policy["repository"], event_commit, policy["tree"])):
        raise PlacementError("projection binding mismatch")
    admitted = {row["path"]: row for row in policy["approved"]}
    native_assets = validate_native_assets(policy)
    found = set()
    for item in projection.files:
        if type(item) is not SourceFile or item.path not in admitted or item.path in found:
            raise PlacementError("projection file set mismatch")
        row = admitted[item.path]
        if any(part.casefold() == ".git" for part in item.path.split("/")):
            raise PlacementError("Git control paths are not source inputs")
        if type(item.data) is not bytes or type(item.size) is not int:
            raise PlacementError("mutable or malformed source bytes")
        native_format = _native_format(item.data)
        native = native_assets.get(item.path)
        if native is not None:
            if native_format != native["format"]:
                raise PlacementError("native format does not match exact admission")
        elif native_format or item.path.lower().endswith((".exe", ".dll", ".so", ".dylib", ".node")):
            raise PlacementError("native executable assets require separate exact admission")
        if any(getattr(item, key) != row[key] for key in ("mode", "blob", "size", "sha256")):
            raise PlacementError("projection metadata mismatch")
        oid = hashlib.sha1(b"blob " + str(len(item.data)).encode() + b"\0" + item.data).hexdigest()
        if (len(item.data) != item.size or oid != item.blob
                or hashlib.sha256(item.data).hexdigest() != item.sha256):
            raise PlacementError("projection content mismatch")
        found.add(item.path)
    if found != set(admitted):
        raise PlacementError("incomplete projection")
    return tuple(sorted(projection.files, key=lambda item: item.path))


def _open_directory(name, *, dir_fd=None):
    return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                   dir_fd=dir_fd)


def _private(info):
    return stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700


def _parent(path):
    if (type(path) is not str or not path.startswith("/")
            or any(part in {"", ".", ".."} for part in path.split("/")[1:])):
        raise PlacementError("an absolute canonical private parent is required")
    fd = _open_directory("/")
    try:
        for part in path.split("/")[1:]:
            child = _open_directory(part, dir_fd=fd)
            os.close(fd)
            fd = child
        if not _private(os.fstat(fd)):
            raise PlacementError("parent must be owned and private")
        return fd
    except BaseException:
        os.close(fd)
        raise


def _nested(root_fd, parts):
    fd = os.dup(root_fd)
    try:
        for part in parts:
            try:
                os.mkdir(part, 0o700, dir_fd=fd)
            except FileExistsError:
                pass
            child = _open_directory(part, dir_fd=fd)
            try:
                if not _private(os.fstat(child)):
                    raise PlacementError("non-private directory in stage")
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _write_file(directory_fd, name, item):
    fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                 0o600, dir_fd=directory_fd)
    try:
        view = memoryview(item.data)
        while view:
            count = os.write(fd, view)
            if count <= 0:
                raise PlacementError("incomplete file write")
            view = view[count:]
        os.fchmod(fd, 0o700 if item.mode == "100755" else 0o600)
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        digest, length = hashlib.sha256(), 0
        while True:
            data = os.read(fd, 65536)
            if not data:
                break
            digest.update(data)
            length += len(data)
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or length != item.size or digest.hexdigest() != item.sha256):
            raise PlacementError("written file verification failed")
        return info.st_dev, info.st_ino, stat.S_IMODE(info.st_mode), item.size
    finally:
        os.close(fd)


def _verify_stage(fd, expected, prefix=""):
    direct = {path[len(prefix):].split("/", 1)[0] for path in expected if path.startswith(prefix)}
    if set(os.listdir(fd)) != direct:
        raise PlacementError("unexpected stage entry")
    for name in direct:
        path = prefix + name
        info = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if path in expected:
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                    or (info.st_dev, info.st_ino, stat.S_IMODE(info.st_mode), info.st_size) != expected[path]):
                raise PlacementError("stage file replaced")
        else:
            child = _open_directory(name, dir_fd=fd)
            try:
                if not _private(os.fstat(child)):
                    raise PlacementError("stage directory replaced")
                _verify_stage(child, expected, path + "/")
                os.fsync(child)
            finally:
                os.close(child)


def place_projection(projection, policy, event_commit, private_parent):
    """Return a handle only after byte-verified placement in a new private stage.

    All admitted bytes are checked before filesystem mutation. Directory-relative
    O_NOFOLLOW/O_EXCL operations reject input links and preexisting names. Parent
    ownership is required; malicious concurrent same-UID/root mutation and crash
    durability are outside the exclusive-parent contract. No cleanup follows an
    uncertain write failure, so this cannot erase another task's work.
    """
    files = _files(projection, policy, event_commit)
    parent_fd = stage_fd = None
    try:
        parent_fd = _parent(private_parent)
        parent_info = os.fstat(parent_fd)
        stage_name = "source-" + secrets.token_hex(16)
        os.mkdir(stage_name, 0o700, dir_fd=parent_fd)
        stage_fd = _open_directory(stage_name, dir_fd=parent_fd)
        if not _private(os.fstat(stage_fd)):
            raise PlacementError("stage ownership mismatch")
        expected = {}
        for item in files:
            parts = item.path.split("/")
            directory_fd = _nested(stage_fd, parts[:-1])
            try:
                expected[item.path] = _write_file(directory_fd, parts[-1], item)
            finally:
                os.close(directory_fd)
        _verify_stage(stage_fd, expected)
        os.fsync(stage_fd)
        os.fsync(parent_fd)
        check_fd = _parent(private_parent)
        try:
            current = os.fstat(check_fd)
            entry = os.stat(stage_name, dir_fd=check_fd, follow_symlinks=False)
            stage = os.fstat(stage_fd)
            if ((current.st_dev, current.st_ino) != (parent_info.st_dev, parent_info.st_ino)
                    or (entry.st_dev, entry.st_ino) != (stage.st_dev, stage.st_ino)):
                raise PlacementError("parent or stage path changed")
        finally:
            os.close(check_fd)
        return PlacedProjection(projection.repository, projection.commit, projection.tree,
                                len(files), private_parent + "/" + stage_name)
    except Exception:
        # Never echo OS messages which can include private paths or input text.
        raise PlacementError("source placement failed; no completed handle; retain private stage if created") from None
    finally:
        if stage_fd is not None:
            os.close(stage_fd)
        if parent_fd is not None:
            os.close(parent_fd)
