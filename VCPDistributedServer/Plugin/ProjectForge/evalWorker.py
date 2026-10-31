"""Trusted project function runner. Not a security sandbox."""
import asyncio
import hashlib
import importlib
import importlib.abc
import importlib.machinery
import importlib.util
import inspect
import json
import math
import os
import sys
import traceback
from pathlib import Path

stage = "input"


def encode(value, seen=None, depth=0):
    if seen is None:
        seen = set()
    if depth > 40:
        raise ValueError("Result nesting exceeds 40 levels")
    if value is None or type(value) in (str, bool):
        return value
    if type(value) is int:
        if abs(value) > 9007199254740991:
            return {"$type": "bigint", "value": str(value)}
        return value
    if type(value) is float:
        if not math.isfinite(value):
            return {"$type": "number", "value": str(value)}
        return value
    if id(value) in seen:
        raise ValueError("Cyclic result; return an explicit JSON projection")
    seen.add(id(value))
    try:
        if type(value) in (list, tuple):
            items = [encode(item, seen, depth + 1) for item in value]
            return items if type(value) is list else {"$type": "tuple", "items": items}
        if type(value) is dict:
            if any(type(key) is not str for key in value):
                raise ValueError("Result dictionary keys must be strings")
            return {"$type": "object", "entries": [
                [key, encode(item, seen, depth + 1)] for key, item in value.items()
            ]}
        raise ValueError(
            f"Unsupported return type: {type(value).__module__}.{type(value).__name__}; "
            "return an explicit JSON projection"
        )
    finally:
        seen.remove(id(value))


def load_module(file, source):
    # Preserve conventional package-relative imports; do not pretend to resolve
    # arbitrary namespace-package or build-system import mappings.
    parent = file.parent
    names = [] if file.name == "__init__.py" else [file.stem]
    while (parent / "__init__.py").is_file():
        names.insert(0, parent.name)
        parent = parent.parent
    class CertifiedSourceLoader(importlib.machinery.SourceFileLoader):
        def get_code(self, fullname):
            # -B only disables cache writes. Compile the bytes whose digest was
            # accepted, without consulting timestamp- or hash-based .pyc files.
            return compile(source, str(file), "exec", dont_inherit=True)

    conventional_name = names and all(name.isidentifier() for name in names)
    if conventional_name:
        module_name = ".".join(names)
        existing = sys.modules.get(module_name)
        if existing is not None:
            origin = getattr(existing, "__file__", None)
            if origin is None or Path(origin).resolve() != file:
                if len(names) != 1 or file.name == "__init__.py":
                    raise ImportError("Import resolved to another file; configure the project package layout")
                # A standalone file can share a worker/stdlib module's name.
                # Keep that module intact and give the selected file a private
                # identity; packages still need their real import hierarchy.
                conventional_name = False
            else:
                # Interpreter startup hooks may have loaded a stale target already.
                # Re-import only this exact file; do not reuse its old module object.
                del sys.modules[module_name]

    if conventional_name:
        sys.path.insert(0, str(parent))
        class CertifiedTargetFinder(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, package_path, target=None):
                if fullname != module_name:
                    return None
                spec = importlib.machinery.PathFinder.find_spec(fullname, package_path)
                if spec is None or spec.origin is None or Path(spec.origin).resolve() != file:
                    raise ImportError("Import resolved to another file; configure the project package layout")
                spec.loader = CertifiedSourceLoader(fullname, str(file))
                return spec

        # Install before importing parents, which may themselves import the
        # target from __init__.py. Their first view must see the certified code.
        finder = CertifiedTargetFinder()
        sys.meta_path.insert(0, finder)
        try:
            module = importlib.import_module(module_name)
        finally:
            if finder in sys.meta_path:
                sys.meta_path.remove(finder)
    else:
        sys.path.insert(0, str(file.parent))
        name = "_projectforge_eval_" + hashlib.sha256(str(file).encode("utf-8")).hexdigest()
        while name in sys.modules:
            name += "_"
        spec = importlib.util.spec_from_file_location(name, file, loader=CertifiedSourceLoader(name, str(file)))
        if spec is None or spec.loader is None:
            raise ImportError("Cannot construct a Python module loader")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    actual = getattr(module, "__file__", None)
    if actual is None or Path(actual).resolve() != file:
        raise ImportError("Import resolved to another file; configure the project package layout")
    return module


def complete_awaitable(value):
    if not inspect.isawaitable(value):
        return value

    async def wait():
        return await value

    return asyncio.run(wait())


def execute(request):
    global stage
    file = Path(request["file"]).resolve()

    def source_hash():
        return hashlib.sha256(file.read_bytes()).hexdigest()

    stage = "source"
    source = file.read_bytes()
    if hashlib.sha256(source).hexdigest() != request["sourceHash"]:
        raise RuntimeError("Target source changed before import; retry")
    stage = "load"
    module = load_module(file, source)
    stage = "resolve"
    target = module
    for name in request["symbol"].split("."):
        # Avoid executing descriptors/properties just to discover a callable.
        raw = inspect.getattr_static(target, name)
        if isinstance(raw, property):
            raise TypeError("Property symbols are not invoked automatically")
        target = getattr(target, name)
    if not callable(target) or inspect.isclass(target):
        raise TypeError("Symbol is not a function callable")
    if inspect.isfunction(target) and ".<locals>." in target.__qualname__:
        raise TypeError("Nested functions require a real runtime fixture")

    args = request["args"]
    kwargs = request.get("kwargs", {})
    if "setup" in request:
        stage = "setup"
        body = request["setup"]
        source = "async def __pf_setup__():\n" + "\n".join(
            "    " + line for line in body.splitlines()
        ) + "\n"
        scope = {"module": module}
        exec(compile(source, "<EvalSymbol.setup>", "exec"), scope)
        args = complete_awaitable(scope["__pf_setup__"]())
        if type(args) is not list:
            raise TypeError("setup must return an argument list")
    stage = "call"
    inspect.signature(target).bind(*args, **kwargs)
    value = complete_awaitable(target(*args, **kwargs))
    stage = "encode"
    encoded = encode(value)
    stage = "source"
    if source_hash() != request["sourceHash"]:
        raise RuntimeError("Target source changed during execution; result not certified")
    return {
        "status": "returned", "value": encoded,
        "checks": {"passed": 0, "failed": 0},
        "runtime": {"executable": sys.executable, "version": sys.version.split()[0]},
    }


request = None
try:
    request = json.load(sys.stdin)
    result = execute(request)
except BaseException as error:
    statuses = {
        "input": "invalid_arguments", "source": "source_changed",
        "load": "load_error", "resolve": "not_callable",
        "setup": "setup_error", "call": "execution_error",
        "encode": "encoding_error",
    }
    result = {
        "status": statuses.get(stage, "execution_error"), "stage": stage,
        "error": {
            "name": type(error).__name__, "message": str(error)[:4000],
            "stack": traceback.format_exc()[-12000:],
        },
    }

if request is None:
    sys.exit(2)
try:
    wire = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
    if len(wire) > 1024 * 1024:
        wire = json.dumps({
            "status": "encoding_error", "stage": "encode",
            "error": {"message": "Encoded result exceeds 1 MiB"},
        }).encode("utf-8")
    with open(request["resultFile"], "wb") as output:
        output.write(wire)
except BaseException:
    os._exit(2)
# Do not let user-created threads/atexit handlers keep a completed run alive.
sys.stdout.flush()
sys.stderr.flush()
os._exit(0 if result["status"] == "returned" else 1)
