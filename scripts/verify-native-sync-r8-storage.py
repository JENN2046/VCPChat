"""Post-shutdown, read-only evidence for synthetic R8 data. No Node access to CDS DB."""
import hashlib
import json
import pathlib
import socket
import sqlite3
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()
assert root.parent == pathlib.Path('P:/VCPKF/vcp/artifacts/native-sync-r8').resolve()
receipt = json.loads((root / 'R8_APP_RECEIPT.json').read_text(encoding='utf-8'))
assert receipt['result'] == 'R8_SYNC_COEXISTENCE_PASS'
acceptance = json.loads((root / 'COEXISTENCE_ACCEPTANCE.json').read_text(encoding='utf-8'))

def read_db(file):
    connection = sqlite3.connect(file.as_uri() + '?mode=ro', uri=True)
    assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    return connection

central = read_db(root / 'central.sqlite')
center = {(t, o, p, m): h for t, o, p, m, h in central.execute(
    'SELECT owner_type,owner_id,topic_id,msg_id,hash FROM messages WHERE deleted=0')}
proof = {'result': 'PASS', 'readMode': 'Python SQLite mode=ro, all owned applications/CDS already stopped',
         'central': {'integrityCheck': 'ok', 'journalRows': central.execute('SELECT count(*) FROM journal').fetchone()[0],
                     'appliedOps': central.execute('SELECT count(*) FROM applied_ops').fetchone()[0],
                     'liveMessages': len(center)}, 'clients': [], 'cdsExits': []}
central.close()
all_pids = set()
ports = set()
for launch in receipt['launches']:
    assert launch['exitCode'] == 0
    metadata = launch['coexistence']
    all_pids.update([launch['pid'], metadata['cdsPid']])
    ports.update([metadata['httpPort'], metadata['wsPort']])
    exit_file = pathlib.Path(launch['appData']) / f"R8_CDS_EXIT_{metadata['cdsPid']}.json"
    exit_record = json.loads(exit_file.read_text())
    assert exit_record['code'] == 0 and exit_record['signal'] is None
    proof['cdsExits'].append(exit_record)
for item in acceptance['statuses']:
    ports.add(item['port'])
for name in ['Windows-A', 'Windows-B', 'Sync-Off']:
    folder = root / name
    db = read_db(folder / 'databases/chat_data.sqlite3')
    rows = list(db.execute('SELECT owner_type,owner_id,topic_id,msg_id,message_hash,content_raw FROM messages WHERE deleted_at IS NULL'))
    sql = {tuple(row[:4]): row for row in rows}
    histories = {}
    for owner_type, owner, topic in [('agent', 'R3Agent', 'r3-topic'), ('agent', 'R3Agent', 'r3-other'), ('group', 'R3Group', 'r3-group-topic')]:
        data = json.loads((folder / 'UserData' / owner / 'topics' / topic / 'history.json').read_text(encoding='utf-8'))
        for message in data:
            key = (owner_type, owner, topic, message['id'])
            assert key not in histories
            histories[key] = message
    assert set(sql) == set(histories)
    for key, message in histories.items():
        assert sql[key][5] == message['content']
    revisions = [dict(zip(['ownerType', 'ownerId', 'topicId', 'contentRevision', 'indexedRevision'], row)) for row in db.execute(
        'SELECT owner_type,owner_id,topic_id,content_revision,indexed_revision FROM topics WHERE deleted_at IS NULL')]
    assert all(row['contentRevision'] == row['indexedRevision'] for row in revisions)
    entry = {'client': name, 'integrityCheck': 'ok', 'messages': len(histories), 'physicalHistoryAndCdsIdsAndTextEqual': True,
             'topics': revisions, 'cdsSha256': hashlib.sha256((folder / 'databases/chat_data.sqlite3').read_bytes()).hexdigest()}
    if name != 'Sync-Off':
        assert set(sql) == set(center)
        assert all(sql[key][4] == center[key] for key in center)
        state = json.loads((folder / '.native-sync/state.json').read_text(encoding='utf-8'))
        assert state['cursor'] == proof['central']['journalRows'] and not state['outbox'] and not state['pending']
        entry.update({'centralAndCdsCanonicalHashesEqual': True, 'cursor': state['cursor'], 'outbox': 0, 'pending': False})
    else:
        assert not (folder / '.native-sync/state.json').exists()
    proof['clients'].append(entry)
    db.close()
process_check = subprocess.run(['powershell', '-NoProfile', '-Command',
    'Get-Process -Id ' + ','.join(map(str, sorted(all_pids))) + ' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id'], capture_output=True, text=True)
assert process_check.returncode in (0, 1) and not process_check.stderr.strip()
remaining = process_check.stdout.strip()
assert not remaining
proof['remainingOwnedPids'] = []
proof['closedPorts'] = []
for port in sorted(ports):
    with socket.socket() as connection:
        connection.settimeout(.2)
        assert connection.connect_ex(('127.0.0.1', port)) != 0
    proof['closedPorts'].append(port)
(root / 'INDEPENDENT_STORAGE_INDEX_SHUTDOWN_PROOF.json').write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'result': proof['result'], 'central': proof['central'], 'clients': [x['messages'] for x in proof['clients']],
                  'cdsExitZero': len(proof['cdsExits']), 'closedPorts': len(ports)}))
