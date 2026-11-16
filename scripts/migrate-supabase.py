#!/usr/bin/env python3
"""Apply only the reviewed additive audit migrations, transactionally and once.
SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set explicitly.
Default is a read-only status check; --apply is required for changes.
"""
import argparse,hashlib,json,os,pathlib,re,urllib.request
MIGRATIONS=[('20261116000100','20261116_billing_atomic'),('20261116000200','20261116_sync_atomic'),('20261116000300','20261116_ai_usage'),('20261116000400','20261116_storage_limits'),('20261116000500','20261116_registration_guard'),('20261116000600','20261116_whatsapp_versions')]
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--phase',choices=['before-deploy','after-deploy']);args=parser.parse_args()
 ref=os.environ['SUPABASE_PROJECT_REF'];token=os.environ['SUPABASE_ACCESS_TOKEN']
 def query(sql):
  request=urllib.request.Request('https://api.supabase.com/v1/projects/'+ref+'/database/query',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps({'query':sql}).encode())
  with urllib.request.urlopen(request,timeout=120) as response:return json.load(response)
 for version,name in MIGRATIONS:
  if args.phase=='before-deploy' and name.endswith(('storage_limits','whatsapp_versions')):continue
  if args.phase=='after-deploy' and not name.endswith(('storage_limits','whatsapp_versions')):continue
  source=pathlib.Path('supabase/'+name+'.sql').read_text();marker='-- sha256:'+hashlib.sha256(source.encode()).hexdigest()
  old=query("BEGIN READ ONLY; SELECT statements FROM supabase_migrations.schema_migrations WHERE version='"+version+"'; COMMIT;")
  if old:
   if marker not in (old[0].get('statements') or []):raise RuntimeError('Migration checksum mismatch: '+name)
   print(name,'already applied');continue
  if not args.apply:print(name,'pending');continue
  body=re.sub(r'(?m)^(?:BEGIN|COMMIT);\s*$','',source)
  sql="BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('obratrack-migrations',0)); "+body+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('"+version+"','"+name+"',ARRAY['"+marker+"']); COMMIT;"
  query(sql);print(name,'applied')
if __name__=='__main__':main()
