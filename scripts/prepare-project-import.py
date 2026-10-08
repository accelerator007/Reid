#!/usr/bin/env python3
"""Prepare a private, transactional restore from the verified API recovery.

Requires the Owner's explicit acceptance of NEW passwords. Source password
hashes/session/MFA secrets are unavailable. Defaults to a rollback-only rehearsal.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import uuid
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def identifier(value):
    if not re.fullmatch(r'[a-z][a-z0-9_]*', value):
        raise ValueError('invalid_sql_identifier')
    return '"' + value + '"'


def json_literal(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    tag = '$reid_' + hashlib.sha256(raw.encode()).hexdigest()[:24] + '$'
    if tag in raw:
        raise ValueError('unexpected_dollar_quote_collision')
    return tag + raw + tag + '::jsonb'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-dir', required=True, type=Path)
    parser.add_argument('--schema-file', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--commit', action='store_true')
    parser.add_argument('--stage-dir', type=Path, help='Private SQL chunks for API request size limits')
    args = parser.parse_args()
    os.umask(0o077)
    cipher = AESGCM((args.export_dir / 'recovery.key').read_bytes())

    def decrypt(label):
        name = hashlib.sha256(label.encode()).hexdigest() + '.aesgcm'
        data = (args.export_dir / name).read_bytes()
        return cipher.decrypt(data[:12], data[12:], label.encode())

    manifest = json.loads(decrypt('manifest'))
    if manifest['source'] != 'https://pkogchbrknwmzefjklkr.supabase.co':
        raise ValueError('unexpected_source_project')
    schema = {}
    for column in json.loads(args.schema_file.read_text())['rows']:
        if 'column_name' in column:
            schema.setdefault((column['table_schema'], column['table_name']), {})[column['column_name']] = column
    tables, users = {}, []
    for item in manifest['objects']:
        raw = decrypt(item['label'])
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('export_integrity_failed')
        if item['label'].startswith('table/'):
            table = item['label'].split('/')[1]
            if table != 'workshop_registration_counts':  # Derived view, never a persisted table.
                tables.setdefault(table, []).extend(json.loads(raw))
        if item['label'].startswith('auth-user-detail/'):
            detail = json.loads(raw)
            users.append(detail.get('user', detail))
    if len(users) != manifest['auth_users']:
        raise ValueError('per_user_auth_details_required')
    if any(any(f.get('status') == 'verified' for f in (user.get('factors') or [])) for user in users):
        raise ValueError('verified_mfa_requires_separate_reenrollment_plan')

    identities, auth_rows = [], []
    for user in users:
        row = {key: user.get(key) for key in ('id', 'aud', 'role', 'email', 'email_confirmed_at',
               'invited_at', 'confirmation_sent_at', 'last_sign_in_at', 'created_at', 'updated_at',
               'phone_confirmed_at', 'banned_until', 'deleted_at')}
        row.update(instance_id='00000000-0000-0000-0000-000000000000',
                   phone=user.get('phone') or None, raw_app_meta_data=user.get('app_metadata') or {},
                   raw_user_meta_data=user.get('user_metadata') or {}, is_super_admin=False,
                   is_sso_user=bool(user.get('is_sso_user')), is_anonymous=bool(user.get('is_anonymous')))
        for field in ('confirmation_token', 'recovery_token', 'email_change_token_new',
                      'email_change', 'phone_change', 'phone_change_token',
                      'email_change_token_current', 'reauthentication_token'):
            row[field] = ''
        auth_rows.append(row)
        linked = user.get('identities') or []
        for identity in linked:
            provider_id = str(identity.get('provider_id') or identity['id'])
            identities.append({'id': identity.get('identity_id') or str(uuid.uuid5(uuid.NAMESPACE_URL, user['id'] + '/' + identity['provider'] + '/' + provider_id)),
                               'provider_id': provider_id, 'user_id': user['id'],
                               'identity_data': identity.get('identity_data') or {},
                               'provider': identity['provider'], 'last_sign_in_at': identity.get('last_sign_in_at'),
                               'created_at': identity.get('created_at') or user['created_at'],
                               'updated_at': identity.get('updated_at') or user['updated_at']})
        # Password recovery needs an email identity even for an OAuth-only user.
        # Verification state is inherited; never verify an unverified address.
        if user.get('email') and not any(i['provider'] == 'email' for i in linked):
            identities.append({'id': str(uuid.uuid5(uuid.NAMESPACE_URL, user['id'] + '/email')),
                               'provider_id': user['id'], 'user_id': user['id'], 'provider': 'email',
                               'identity_data': {'sub': user['id'], 'email': user['email'],
                                                 'email_verified': bool(user.get('email_confirmed_at'))},
                               'created_at': user['created_at'], 'updated_at': user['updated_at']})

    staged = []
    if args.stage_dir:
        args.stage_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
        (args.stage_dir / '00000.sql').write_text('CREATE SCHEMA reid_migration_20260926; REVOKE ALL ON SCHEMA reid_migration_20260926 FROM PUBLIC, anon, authenticated; CREATE TABLE reid_migration_20260926.payloads(id integer PRIMARY KEY, data jsonb NOT NULL);')

    def payload_literal(rows):
        literal = json_literal(rows)
        if not args.stage_dir:
            return literal
        index = len(staged) + 1
        chunk = args.stage_dir / f'{index:05d}.sql'
        chunk.write_text(f'INSERT INTO reid_migration_20260926.payloads VALUES ({index},{literal});')
        staged.append(chunk)
        return f'(SELECT data FROM reid_migration_20260926.payloads WHERE id={index})'

    sql = ['BEGIN;', "SET LOCAL statement_timeout = '180s';", 'SET LOCAL session_replication_role = replica;',
           # Execute only with an explicit destination --project-ref.
           'CREATE TEMP TABLE reid_source_users(id uuid PRIMARY KEY) ON COMMIT DROP;',
           'INSERT INTO reid_source_users SELECT id FROM jsonb_to_recordset(' + json_literal([{'id':u['id']} for u in users]) + ') AS x(id uuid);',
           "DO $$ BEGIN IF EXISTS (SELECT 1 FROM auth.users u WHERE NOT EXISTS(SELECT 1 FROM reid_source_users s WHERE s.id=u.id)) THEN RAISE EXCEPTION 'destination_has_unrelated_users'; END IF; END $$;",
           'CREATE TEMP TABLE reid_expected_counts(name text PRIMARY KEY,n bigint) ON COMMIT DROP;']

    def insert_rows(namespace, table, rows, conflict=False, passwords=False):
        if not rows:
            return
        columns = sorted(set().union(*(row.keys() for row in rows)))
        known = schema[(namespace, table)]
        if any(column not in known for column in columns):
            raise ValueError(f'schema_drift_{namespace}_{table}')
        columns = [column for column in columns if known[column]['is_generated'] == 'NEVER']
        destination = identifier(namespace) + '.' + identifier(table)
        selected = ','.join(identifier(column) for column in columns)
        for offset in range(0, len(rows), 100):
            payload = payload_literal(rows[offset:offset + 100])
            extra_column = ',encrypted_password' if passwords else ''
            extra_select = ",extensions.crypt(encode(extensions.gen_random_bytes(32),'hex'),extensions.gen_salt('bf',10))" if passwords else ''
            statement = f'INSERT INTO {destination} ({selected}{extra_column}) OVERRIDING SYSTEM VALUE SELECT {selected}{extra_select} FROM jsonb_populate_recordset(NULL::{destination},{payload})'
            if conflict:
                updates = ','.join(identifier(c) + '=excluded.' + identifier(c) for c in columns if c != 'id')
                statement += f' ON CONFLICT(id) DO UPDATE SET {updates}'
            sql.append(statement + ';')

    insert_rows('auth', 'users', auth_rows, conflict=True, passwords=True)
    # Preserve an already-set destination password on refresh; INSERT conflict
    # updates above deliberately omit encrypted_password from their SET clause.
    sql.append('DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM reid_source_users);')
    insert_rows('auth', 'identities', identities)
    for table, rows in sorted(tables.items()):
        if table != 'agent_tools':
            sql.append('DELETE FROM public.' + identifier(table) + ';')
        insert_rows('public', table, rows, conflict=table == 'agent_tools')
        sql.append("INSERT INTO reid_expected_counts VALUES ('" + table + "'," + str(len(rows)) + ');')

    sql.append(r"""
DO $$ DECLARE r record; actual bigint; seq text; maximum bigint;
BEGIN
  FOR r IN SELECT * FROM reid_expected_counts LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',r.name) INTO actual;
    IF (r.name <> 'agent_tools' AND actual <> r.n) OR actual < r.n THEN
      RAISE EXCEPTION 'record_count_mismatch_%',r.name;
    END IF;
  END LOOP;
  FOR r IN SELECT ns.nspname AS src_schema,cl.relname AS src_table,
       rt.relname AS dst_table,rn.nspname AS dst_schema,c.conname,
       string_agg(format('s.%I IS NOT NULL',sa.attname),' AND ' ORDER BY sk.n) AS nonnull,
       string_agg(format('d.%I = s.%I',da.attname,sa.attname),' AND ' ORDER BY sk.n) AS joined
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace JOIN pg_class rt ON rt.oid=c.confrelid
    JOIN pg_namespace rn ON rn.oid=rt.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY sk(att,n)
    JOIN LATERAL unnest(c.confkey) WITH ORDINALITY dk(att,n) ON dk.n=sk.n
    JOIN pg_attribute sa ON sa.attrelid=cl.oid AND sa.attnum=sk.att
    JOIN pg_attribute da ON da.attrelid=rt.oid AND da.attnum=dk.att
    WHERE c.contype='f' AND (ns.nspname='public' OR (ns.nspname='auth' AND cl.relname='identities'))
    GROUP BY ns.nspname,cl.relname,rt.relname,rn.nspname,c.conname
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I s WHERE %s AND NOT EXISTS (SELECT 1 FROM %I.%I d WHERE %s)',
      r.src_schema,r.src_table,r.nonnull,r.dst_schema,r.dst_table,r.joined) INTO actual;
    IF actual <> 0 THEN RAISE EXCEPTION 'foreign_key_violation_%',r.conname; END IF;
  END LOOP;
  FOR r IN SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND (is_identity='YES' OR column_default LIKE 'nextval%') LOOP
    seq:=pg_get_serial_sequence(format('public.%I',r.table_name),r.column_name);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT max(%I) FROM public.%I',r.column_name,r.table_name) INTO maximum;
      PERFORM setval(seq,greatest(coalesce(maximum,1),1),maximum IS NOT NULL);
    END IF;
  END LOOP;
END $$;
""")
    # Re-apply the approved product policy after copying the old provider/tool rows.
    sql.append("UPDATE public.agents SET enabled=false,status='disabled' WHERE id='finance';")
    sql.append("UPDATE public.agent_tools SET enabled=false WHERE id IN ('finance.budgets','projects.budget.update');")
    sql.append("DELETE FROM public.agent_tool_assignments WHERE agent_id='finance' OR tool_id IN ('finance.budgets','projects.budget.update');")
    sql.append("UPDATE public.llm_providers SET enabled=false WHERE id='gemini';")
    sql.append("UPDATE public.agent_runner_status SET status='offline';")
    sql.append("SELECT (SELECT count(*) FROM auth.users) AS users,(SELECT count(*) FROM auth.identities) AS identities,(SELECT sum(n) FROM reid_expected_counts) AS source_public_rows;")
    if args.stage_dir:
        sql.append('DROP SCHEMA reid_migration_20260926 CASCADE;')
    sql.append('COMMIT;' if args.commit else 'ROLLBACK;')
    args.output.write_text('\n'.join(sql) + '\n')
    args.output.chmod(0o600)
    print(json.dumps({'prepared_tables': len(tables), 'users': len(users), 'identities': len(identities),
                      'source_public_rows': sum(len(rows) for rows in tables.values()),
                      'mode': 'commit' if args.commit else 'rollback_rehearsal', 'sql_bytes': args.output.stat().st_size}))


if __name__ == '__main__':
    main()
