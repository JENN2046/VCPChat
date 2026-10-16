"""Same-run CI transfer of an already admitted Linux source projection.

Not a repository/archive transport, Windows source writer, or fallback for the
Linux source-entry controller. The receiving job checks the producer's digest
before loading this independently pinned helper. Only fresh CI scratch paths
are used. No network, Git, provider, or project code is executed here.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile

LIMIT = 300 * 1024 * 1024
REPOSITORY = 'JENN2046/VCPChat'
SCHEMA = 'vcpchat-ci-projection-transfer/v1'

def require(condition, message):
    if not condition:
        raise ValueError(message)

def strict_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def binding(env):
    require(env.get('GITHUB_ACTIONS') == 'true', 'CI only')
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY, 'repository binding')
    require(re.fullmatch('[0-9a-f]{40}', env.get('GITHUB_SHA', '')), 'commit binding')
    for key in ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']:
        require(re.fullmatch('[0-9]+', env.get(key, '')), 'run binding')
    return {key: env[key] for key in ['GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']}

def safe_path(value):
    require(isinstance(value,str) and 0 < len(value) <= 512, 'path length')
    parts = value.split('/')
    for part in parts:
        require(part not in ('', '.', '..') and not re.search(r'[\\<>:"|?*\x00-\x1f]', part), 'unsafe path')
        require(not part.endswith((' ', '.')), 'Windows path alias')
        require(not re.fullmatch(r'(?i)(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?', part), 'Windows device name')
        require(part.casefold() not in {'.git','state-private','secrets','credentials','tokens','cookies','localstate'}, 'held directory')
    name = parts[-1].casefold()
    template = name in {'.env.example','config.env.example'} or name.endswith(('.template','.example'))
    require(template or not (name == '.env' or name.startswith('.env.') or name == 'config.env'
        or name in {'id_rsa','id_ed25519','credentials.json','token.json','secrets.json'}
        or name.endswith(('.pem','.key','.p12','.pfx','.log','.sqlite','.sqlite3','.db'))), 'held file')
    return value

def regular(path, directory=False):
    info = path.lstat()
    require(not stat.S_ISLNK(info.st_mode) and not (getattr(info,'st_file_attributes',0) & 0x400), 'link/reparse point')
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), 'file type')

def read_bounded(path, limit=LIMIT):
    regular(path)
    require(path.stat().st_size <= limit, 'size limit')
    with path.open('rb') as stream:
        data = stream.read(limit+1)
    require(len(data) <= limit, 'size limit')
    return data

def verify_file(row, data):
    require(row.get('type') == 'blob' and row.get('mode') in ('100644','100755'), 'file mode')
    require(type(row.get('size')) is int and row['size'] == len(data), 'file size')
    require(sha(data) == row.get('sha256'), 'file SHA-256')
    oid = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    require(oid == row.get('blob'), 'file Git identity')

def validate(envelope, expected):
    require(envelope.get('schema') == SCHEMA and envelope.get('binding') == expected, 'transfer binding')
    context = envelope['context']
    require(context.get('schema') == 'vcpchat-ci-source-context/v1' and context.get('repository') == REPOSITORY, 'context schema')
    require(context['event']['commit'] == expected['GITHUB_SHA'], 'context commit')
    rows, payload = context['projection'], envelope['files']
    require(isinstance(rows,list) and 0 < len(rows) <= 5000 and isinstance(payload,dict), 'file count')
    names, aliases, verified = set(), set(), []
    total = 0
    for row in rows:
        name = safe_path(row['path'])
        require(name.casefold() not in aliases, 'case alias')
        names.add(name); aliases.add(name.casefold())
        require(isinstance(payload.get(name),str), 'missing file')
        data = base64.b64decode(payload[name],validate=True)
        total += len(data)
        require(total <= LIMIT, 'total size')
        verify_file(row,data)
        verified.append((row,data))
    require(names == set(payload), 'extra file')
    for name in names:
        parts = name.split('/')
        require(not any('/'.join(parts[:i]).casefold() in aliases for i in range(1,len(parts))), 'file/directory collision')
    return verified

def pack(source, context_path, context_sha, expected, output):
    context_data = read_bounded(context_path,8*1024*1024)
    require(sha(context_data) == context_sha, 'context digest')
    context = strict_json(context_data)
    files = {}
    regular(source,directory=True)
    for row in context['projection']:
        name = safe_path(row['path'])
        current = source
        for part in name.split('/')[:-1]:
            current /= part
            regular(current,directory=True)
        data = read_bounded(source/name)
        verify_file(row,data)
        files[name] = base64.b64encode(data).decode('ascii')
    envelope = {'schema':SCHEMA,'binding':expected,'context':context,'files':files}
    validate(envelope,expected)
    data = (json.dumps(envelope,ensure_ascii=True,separators=(',',':'))+'\n').encode()
    require(len(data) <= LIMIT, 'envelope size')
    with output.open('xb') as stream:
        stream.write(data)
    require(sha(read_bounded(output)) == sha(data), 'transfer write')
    return sha(data)

def unpack(bundle, digest, expected, runner_temp):
    data = read_bounded(bundle)
    require(sha(data) == digest, 'transfer digest')
    envelope = strict_json(data)
    verified = validate(envelope,expected)  # all bytes checked before placement
    regular(runner_temp,directory=True)
    stage = Path(tempfile.mkdtemp(prefix='verified-ci-transfer-',dir=runner_temp))
    source = stage/'source'; source.mkdir()
    for row, data in verified:
        file = source/row['path']
        file.parent.mkdir(parents=True,exist_ok=True)
        current = file.parent
        while current != stage:
            regular(current,directory=True); current = current.parent
        with file.open('xb') as stream:
            stream.write(data)
        verify_file(row,read_bounded(file))
        if os.name != 'nt': file.chmod(0o700 if row['mode']=='100755' else 0o600)
    context = stage/'context.json'
    context_data = (json.dumps(envelope['context'],ensure_ascii=True,separators=(',',':'))+'\n').encode()
    with context.open('xb') as stream: stream.write(context_data)
    return source, context, sha(context_data)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode',choices=['pack','unpack'])
    args = parser.parse_args()
    expected = binding(os.environ)
    if args.mode == 'pack':
        output = Path(os.environ['RUNNER_TEMP'])/'source-transfer.json'
        digest = pack(Path(os.environ['SOURCE_DIRECTORY']),Path(os.environ['SOURCE_CONTEXT']),os.environ['SOURCE_CONTEXT_SHA256'],expected,output)
        values = {'bundle':str(output),'sha256':digest}
    else:
        source,context,digest = unpack(Path(os.environ['SOURCE_BUNDLE']),os.environ['SOURCE_BUNDLE_SHA256'],expected,Path(os.environ['RUNNER_TEMP']))
        values = {'directory':str(source),'context_path':str(context),'context_sha256':digest}
    with open(os.environ['GITHUB_OUTPUT'],'a',encoding='utf-8') as stream:
        for key,value in values.items():
            require('\n' not in value and '\r' not in value,'output injection')
            stream.write(f'{key}={value}\n')
    print('Verified same-run source transfer; no repository checkout or fallback')

if __name__ == '__main__':
    try: main()
    except Exception: raise SystemExit('CI source transfer failed closed; no completed source output') from None
