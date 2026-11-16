#!/usr/bin/env python3
"""Encrypted business-data backup. Read-only source; never print credentials or rows.
Requires SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, BACKUP_KEY_FILE.
Storage originals are included; Auth identities require the provider's separate backup.
"""
import argparse,base64,hashlib,hmac,json,os,pathlib,secrets,subprocess,urllib.request

def request(url,token,body=None):
    headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
    if body is not None: body=json.dumps(body).encode()
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers,data=body),timeout=120) as res:return res.read()

def verify(output,key):
    manifest=json.loads(output.with_suffix('.manifest.json').read_text());actual=hmac.new(key.read_bytes(),output.read_bytes(),'sha256').hexdigest()
    if not hmac.compare_digest(manifest['hmac_sha256'],actual):raise RuntimeError('Backup integrity verification failed')
    raw=subprocess.check_output(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','600000','-pass','file:'+str(key),'-in',str(output)])
    payload=json.loads(raw)
    if sum(len(t['rows']) for t in payload['tables'])!=manifest['rows']:raise RuntimeError('Backup row verification failed')
    for file in payload['storage_files']:
        if hashlib.sha256(base64.b64decode(file['base64'])).hexdigest()!=file['sha256']:raise RuntimeError('Backup file verification failed')
    print(json.dumps({'verified_integrity':True,'tables':manifest['tables'],'rows':manifest['rows'],'files':manifest['files']}))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--verify',action='store_true');args=parser.parse_args()
    if args.verify:
        verify(pathlib.Path(args.output),pathlib.Path(os.environ['BACKUP_KEY_FILE']));return
    token=os.environ['SUPABASE_ACCESS_TOKEN'];ref=os.environ['SUPABASE_PROJECT_REF'];key=pathlib.Path(os.environ['BACKUP_KEY_FILE'])
    if not key.exists():
        key.parent.mkdir(parents=True,exist_ok=True);key.write_bytes(base64.b64encode(secrets.token_bytes(48)));key.chmod(0o600)
    base='https://api.supabase.com/v1/projects/'+ref
    def sql(q):return json.loads(request(base+'/database/query',token,{'query':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; '+q+'; COMMIT;'}))
    tables=sql("select tablename from pg_tables where schemaname='public' order by tablename")
    # A single read-only transaction gives every business table the same snapshot.
    terms=["select '"+t['tablename']+"' name, coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) rows from public.\""+t['tablename']+'\" t' for t in tables]
    payload={'format':'obratrack-encrypted-backup-v1','project':ref,'tables':sql(' union all '.join(terms))}
    payload['columns']=sql("select c.relname table_name,a.attname column_name,format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull not_null,a.attgenerated generated,pg_get_expr(d.adbin,d.adrelid) default_value from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r' order by c.relname,a.attnum")
    payload['functions']=sql("select p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'")
    payload['constraints']=sql("select c.relname table_name,t.conname,pg_get_constraintdef(t.oid) definition from pg_constraint t join pg_class c on c.oid=t.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'")
    payload['policies']=sql("select * from pg_policies where schemaname in ('public','storage')")
    payload['triggers']=sql("select c.relname table_name,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal")
    payload['indexes']=sql("select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public'")
    payload['storage_objects']=sql('select bucket_id,name from storage.objects order by bucket_id,name')
    keys=json.loads(request(base+'/api-keys?reveal=true',token));service=next(k['api_key'] for k in keys if k['name']=='service_role')
    payload['storage_files']=[]
    for row in payload['storage_objects']:
        from urllib.parse import quote
        path=quote(row['bucket_id']+'/'+row['name'],safe='/')
        data=request('https://'+ref+'.supabase.co/storage/v1/object/authenticated/'+path,service)
        payload['storage_files'].append({**row,'sha256':hashlib.sha256(data).hexdigest(),'base64':base64.b64encode(data).decode()})
    plain=json.dumps(payload,separators=(',',':')).encode();output=pathlib.Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','600000','-salt','-pass','file:'+str(key),'-out',str(output)],input=plain,check=True);output.chmod(0o600)
    verified=subprocess.check_output(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','600000','-pass','file:'+str(key),'-in',str(output)])
    if verified!=plain:raise RuntimeError('Backup verification failed')
    summary={'format':payload['format'],'tables':len(tables),'rows':sum(len(t['rows']) for t in payload['tables']),'files':len(payload['storage_files']),'encrypted_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'hmac_sha256':hmac.new(key.read_bytes(),output.read_bytes(),'sha256').hexdigest(),'verified_decryption':True,'includes_auth_users':False}
    output.with_suffix('.manifest.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
if __name__=='__main__':main()
