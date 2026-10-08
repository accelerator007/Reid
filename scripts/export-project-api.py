#!/usr/bin/env python3
"""Encrypted API recovery export. Not a transactional Postgres/Auth backup.

Only reads the configured source. Auth API exports omit password hashes and
provider secrets; a full database export is still required for exact migration.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    config = dict(line.split('=', 1) for line in args.env_file.read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    base = config['SUPABASE_URL'].rstrip('/')
    if base != 'https://pkogchbrknwmzefjklkr.supabase.co':
        raise SystemExit('Source differs from the explicitly selected Reid project')
    headers = {'apikey': config['SUPABASE_SERVICE_ROLE_KEY'],
               'Authorization': 'Bearer ' + config['SUPABASE_SERVICE_ROLE_KEY']}
    args.output_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
    key = AESGCM.generate_key(bit_length=256)
    (args.output_dir / 'recovery.key').write_bytes(key)
    cipher = AESGCM(key)
    manifest = {'source': base, 'started_at': datetime.now(timezone.utc).isoformat(),
                'transactionally_consistent': False,
                'excluded': ['Auth password hashes', 'Auth sessions and MFA secrets',
                             'OAuth provider credentials', 'Edge Function secrets',
                             'non-exposed schemas, roles and database configuration'],
                'objects': [], 'tables': {}}

    def request(path, payload=None, binary=False):
        body = None if payload is None else json.dumps(payload).encode()
        for attempt in range(4):
            try:
                req = Request(base + path, data=body, headers={**headers, 'Content-Type': 'application/json'})
                with urlopen(req, timeout=60) as response:
                    raw = response.read()
                    return raw if binary else json.loads(raw)
            except HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    # Response bodies can contain private record data.
                    raise RuntimeError(f'source_http_{error.code}') from None
                time.sleep(2 ** attempt)

    def save(label, value, binary=False):
        raw = value if binary else json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
        nonce = os.urandom(12)
        filename = hashlib.sha256(label.encode()).hexdigest() + '.aesgcm'
        encrypted = nonce + cipher.encrypt(nonce, raw, label.encode())
        (args.output_dir / filename).write_bytes(encrypted)
        # Verify saved bytes, not only the in-memory encryption result.
        saved = (args.output_dir / filename).read_bytes()
        if cipher.decrypt(saved[:12], saved[12:], label.encode()) != raw:
            raise RuntimeError('encrypted_export_verification_failed')
        record = {'label': label, 'file': filename, 'bytes': len(raw),
                  'sha256': hashlib.sha256(raw).hexdigest()}
        manifest['objects'].append(record)
        return record

    schema = request('/rest/v1/')
    save('postgrest-schema', schema)
    tables = sorted(path[1:] for path in schema['paths'] if re.fullmatch(r'/[a-z][a-z0-9_]*', path))
    for table in tables:
        properties = schema.get('definitions', {}).get(table, {}).get('properties', {})
        primary = [name for name, definition in properties.items()
                   if 'Primary Key' in definition.get('description', '')]
        if not primary and 'id' in properties:
            primary = ['id']
        total = 0
        while True:
            params = {'select': '*', 'limit': 500, 'offset': total}
            if primary:
                params['order'] = ','.join(name + '.asc' for name in primary)
            rows = request('/rest/v1/' + table + '?' + urlencode(params))
            if not isinstance(rows, list):
                raise RuntimeError('invalid_table_response')
            save(f'table/{table}/{total}', rows)
            total += len(rows)
            if len(rows) < 500:
                break
        manifest['tables'][table] = total
        print(json.dumps({'table': table, 'exported_rows': total}), flush=True)

    users = 0
    user_ids = []
    for page in range(1, 10001):
        response = request(f'/auth/v1/admin/users?page={page}&per_page=500')
        rows = response['users']
        save(f'auth-users-api/{page}', response)
        users += len(rows)
        user_ids.extend(row['id'] for row in rows)
        if len(rows) < 500:
            break
    else:
        raise RuntimeError('auth_pagination_limit')
    manifest['auth_users'] = users
    # List-users omits identities and can omit security state. Preserve the
    # per-user admin representation too; it still never exposes password hashes.
    with ThreadPoolExecutor(max_workers=4) as pool:
        details = pool.map(lambda user_id: request('/auth/v1/admin/users/' + quote(user_id, safe='')), user_ids)
        for user_id, detail in zip(user_ids, details):
            save('auth-user-detail/' + user_id, detail)
    save('public-auth-settings', request('/auth/v1/settings'))

    buckets = request('/storage/v1/bucket')
    save('storage-buckets', buckets)
    files = 0
    for bucket in buckets:
        bucket_id = bucket['id']
        prefixes = ['']
        seen = set()
        while prefixes:
            prefix = prefixes.pop()
            if prefix in seen:
                raise RuntimeError('storage_folder_cycle')
            seen.add(prefix)
            offset = 0
            while True:
                rows = request('/storage/v1/object/list/' + quote(bucket_id, safe=''),
                               {'prefix': prefix, 'limit': 100, 'offset': offset,
                                'sortBy': {'column': 'name', 'order': 'asc'}})
                save(f'storage-list/{bucket_id}/{prefix}/{offset}', rows)
                for entry in rows:
                    name = prefix + entry['name']
                    if entry.get('id') is None:
                        prefixes.append(name + '/')
                        continue
                    raw = request('/storage/v1/object/authenticated/' + quote(bucket_id, safe='')
                                  + '/' + quote(name, safe='/'), binary=True)
                    save(f'storage-object/{bucket_id}/{name}', raw, binary=True)
                    files += 1
                offset += len(rows)
                if len(rows) < 100:
                    break
        print(json.dumps({'bucket': bucket_id, 'storage_files_so_far': files}), flush=True)
    manifest['storage_files'] = files
    manifest['finished_at'] = datetime.now(timezone.utc).isoformat()
    # Keep record names, contents and metadata inside encrypted files.
    save('manifest', manifest)
    summary = {'source_project': 'pkogchbrknwmzefjklkr', 'tables': len(tables),
               'rows': sum(manifest['tables'].values()), 'auth_users': users,
               'buckets': len(buckets), 'storage_files': files,
               'transactionally_consistent': False, 'full_auth_backup': False,
               'finished_at': manifest['finished_at']}
    (args.output_dir / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({'export_complete': summary}), flush=True)


if __name__ == '__main__':
    main()
