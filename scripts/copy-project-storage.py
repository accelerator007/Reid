#!/usr/bin/env python3
"""Copy and hash-verify encrypted recovery objects into the selected new project.

Never overwrites an existing object with different bytes. This copies file bytes
and bucket access settings; original storage ownership still needs DB migration.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-dir', required=True, type=Path)
    parser.add_argument('--credentials', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(args.credentials.read_text())
    base = config['url']
    if base != 'https://cfxntjnewkmlvkogfxyu.supabase.co':
        raise SystemExit('Target differs from the explicitly selected new project')
    headers = {'apikey': config['service_key'], 'Authorization': 'Bearer ' + config['service_key']}
    cipher = AESGCM((args.export_dir / 'recovery.key').read_bytes())

    def decrypt(label):
        filename = hashlib.sha256(label.encode()).hexdigest() + '.aesgcm'
        encrypted = (args.export_dir / filename).read_bytes()
        return cipher.decrypt(encrypted[:12], encrypted[12:], label.encode())

    manifest = json.loads(decrypt('manifest'))
    if manifest['source'] != 'https://pkogchbrknwmzefjklkr.supabase.co':
        raise SystemExit('Unexpected export source')
    for record in manifest['objects']:
        if hashlib.sha256(decrypt(record['label'])).hexdigest() != record['sha256']:
            raise SystemExit('Encrypted export integrity failed')

    def request(path, method='GET', payload=None, extra=None, missing_ok=False):
        req = Request(base + path, data=payload, method=method, headers={**headers, **(extra or {})})
        try:
            with urlopen(req, timeout=60) as response:
                return response.read()
        except HTTPError as error:
            if missing_ok and error.code in (400, 404):
                body = json.loads(error.read())
                if str(body.get('statusCode')) == '404' or body.get('error') in ('not_found', 'Not Found'):
                    return None
            raise RuntimeError(f'target_http_{error.code}') from None

    buckets = json.loads(decrypt('storage-buckets'))
    target_buckets = {row['id']: row for row in json.loads(request('/storage/v1/bucket'))}
    for bucket in buckets:
        current = target_buckets.get(bucket['id'])
        wanted = {key: bucket.get(key) for key in ('public', 'file_size_limit', 'allowed_mime_types')}
        if current is None:
            payload = {'id': bucket['id'], 'name': bucket['name'], **wanted}
            request('/storage/v1/bucket', 'POST', json.dumps(payload).encode(), {'Content-Type': 'application/json'})
        elif any(current.get(key) != value for key, value in wanted.items()):
            # This is an empty destination selected for migration, not the source.
            request('/storage/v1/bucket/' + quote(bucket['id'], safe=''), 'PUT',
                    json.dumps(wanted).encode(), {'Content-Type': 'application/json'})

    metadata = {}
    for record in manifest['objects']:
        if record['label'].startswith('storage-list/'):
            _, bucket, tail = record['label'].split('/', 2)
            prefix = tail.rsplit('/', 1)[0]
            for entry in json.loads(decrypt(record['label'])):
                if entry.get('id'):
                    metadata[f'{bucket}/{prefix}{entry["name"]}'] = entry.get('metadata') or {}

    copied = verified = 0
    for record in manifest['objects']:
        if not record['label'].startswith('storage-object/'):
            continue
        path = record['label'].removeprefix('storage-object/')
        bucket, name = path.split('/', 1)
        encoded = quote(bucket, safe='') + '/' + quote(name, safe='/')
        raw = decrypt(record['label'])
        existing = request('/storage/v1/object/authenticated/' + encoded, missing_ok=True)
        if existing is None:
            info = metadata.get(path, {})
            request('/storage/v1/object/' + encoded, 'POST', raw,
                    {'Content-Type': info.get('mimetype') or 'application/octet-stream',
                     'Cache-Control': info.get('cacheControl') or 'max-age=3600', 'x-upsert': 'false'})
            copied += 1
            existing = request('/storage/v1/object/authenticated/' + encoded)
        if hashlib.sha256(existing).hexdigest() != record['sha256']:
            raise RuntimeError('destination_object_hash_mismatch; no existing object was overwritten')
        verified += 1
    result = {'target': 'cfxntjnewkmlvkogfxyu', 'files_copied': copied,
              'files_hash_verified': verified, 'original_ownership_restored': False}
    (args.export_dir.parent / 'storage-copy-summary.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
