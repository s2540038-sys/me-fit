"""Apply the prepared ME FIT catalog using the Supabase Management API.
Credentials are read only from the environment and never written or printed.
Usage: python3 scripts/supabase-admin.py PROJECT_REF [--apply]
Without --apply, only inspect the project and existing table names.
"""
import argparse
import json
import os
from pathlib import Path
import re
import ssl
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
TABLES = ('brands', 'products', 'shades', 'shade_colors', 'popularity_evidence')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project_ref')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9]{20}', args.project_ref):
        raise RuntimeError('Expected the 20-character Supabase project reference')
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token:
        raise RuntimeError('SUPABASE_ACCESS_TOKEN is not available in this machine')

    def request(path, body=None):
        req = urllib.request.Request(
            'https://api.supabase.com/v1/projects/' + args.project_ref + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'},
            method='POST' if body is not None else 'GET',
        )
        try:
            with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=90) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Do not echo arbitrary API responses, request headers, or credentials.
            raise RuntimeError(f'Management API HTTP {error.code}; no credential values logged') from None

    def query(sql):
        return request('/database/query', {'query': sql})

    project = request('')
    print(json.dumps({k: project.get(k) for k in ('id', 'name', 'region', 'status')}, ensure_ascii=False))
    table_names = "','".join(TABLES)
    present = query(f"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('{table_names}') ORDER BY table_name")
    print('Existing ME FIT tables:', [r['table_name'] for r in present])
    if not args.apply:
        return
    # Never replace unknown existing tables or silently run against a pre-existing catalog.
    if present:
        raise RuntimeError('Existing catalog tables found; inspect schema and data before applying. No changes made.')
    print('Creating tables, importing the workbook, and enabling public catalog reads...')
    # Send all three scripts as a single transaction. No partial schema/import/policy changes.
    chunks = []
    for file in ('setup.sql', 'seed.sql', 'read-access.sql'):
        sql = (ROOT / 'database' / file).read_text()
        sql = re.sub(r'^\s*(BEGIN|COMMIT);\s*$', '', sql, flags=re.MULTILINE)
        chunks.append(sql)
    counts_sql = " UNION ALL ".join(f"SELECT '{name}' AS table_name, COUNT(*) AS rows FROM public.{name}" for name in TABLES)
    query('BEGIN;\n' + '\n'.join(chunks) + '\nCOMMIT;')
    counts = {r['table_name']: int(r['rows']) for r in query(counts_sql)}
    expected = {'brands': 16, 'products': 120, 'shades': 827, 'shade_colors': 13, 'popularity_evidence': 56}
    if counts != expected:
        raise RuntimeError('Import counts differ from the workbook; inspect the project before connecting the app')
    print('Verified imported row counts:', json.dumps(counts))
    policies = query("SELECT tablename,cmd,roles FROM pg_policies WHERE schemaname='public' AND policyname='mefit_catalog_read'")
    if len(policies) != 5 or any(p['cmd'] != 'SELECT' for p in policies):
        raise RuntimeError('Read access policies were not confirmed')
    keys = request('/api-keys?reveal=true')
    anon = next((k.get('api_key') for k in keys if k.get('name') == 'anon'), None)
    if not anon or len(anon.split('.')) != 3:
        raise RuntimeError('The public anon key was not returned; catalog imported but app connection not saved')
    import base64
    part = anon.split('.')[1]
    role = json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4))).get('role')
    if role != 'anon':
        raise RuntimeError('Only the public anon key may be used in the app')
    config = {'url': f'https://{args.project_ref}.supabase.co', 'publishableKey': anon}
    (ROOT / 'data' / 'supabase-public.json').write_text(json.dumps(config, indent=2) + '\n')
    print('Public read connection saved. Management credentials were not saved. Run app/API tests before deployment.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Known errors are deliberately sanitized above. Avoid tracebacks with request internals.
        if isinstance(error, RuntimeError): print(str(error), file=sys.stderr)
        else: print('Supabase operation failed: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
