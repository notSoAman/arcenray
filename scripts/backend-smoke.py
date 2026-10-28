"""Live disposable backend smoke test. Explicit staging URL + admin key required.
Creates temporary users; always removes them. No tokens or signed URLs are printed.
Run via the setup guide; this script is never part of frontend code.
"""
import os, json, uuid, time, base64, hashlib, pathlib, urllib.request, urllib.error, subprocess, tempfile, socket, xml.etree.ElementTree as ET
# Cache DNS per process to avoid repeated resolver latency during disposable tests.
_real_getaddrinfo=socket.getaddrinfo
_dns={}
def _getaddrinfo(*args,**kwargs):
 key=(args,tuple(sorted(kwargs.items())))
 if key not in _dns:_dns[key]=_real_getaddrinfo(*args,**kwargs)
 return _dns[key]
socket.getaddrinfo=_getaddrinfo
BASE=os.environ['SUPABASE_URL'].rstrip('/')
PUBLIC=os.environ['SUPABASE_PUBLISHABLE_KEY']; ADMIN=os.environ['SUPABASE_SERVICE_ROLE_KEY']
class ApiError(Exception):
 def __init__(self,status,body): self.status=status;self.body=body;super().__init__(f'API HTTP {status}: {body[:300]}')
CLERK=os.environ.get('ARCENRAY_TEST_AUTH_PROVIDER')=='clerk'
def clerk(path,body=None,method=None):
 # Use the supported Node transport. This environment's Python client is rejected
 # by Clerk's browser-integrity filter; no protections or TLS checks are disabled.
 program="""let text='';for await(const part of process.stdin)text+=part;
 const input=JSON.parse(text);const response=await fetch('https://api.clerk.com/v1'+input.path,{method:input.method,headers:{Authorization:'Bearer '+process.env.CLERK_SECRET_KEY,'Content-Type':'application/json'},body:input.body===null?undefined:JSON.stringify(input.body)});
 const raw=await response.text();process.stdout.write(JSON.stringify({status:response.status,raw}));"""
 result=subprocess.run(['node','--input-type=module','-e',program],input=json.dumps({'path':path,'body':body,'method':method or ('POST' if body is not None else 'GET')}),text=True,capture_output=True,check=True)
 response=json.loads(result.stdout)
 if response['status']>=400:raise ApiError(response['status'],response['raw'])
 return json.loads(response['raw']) if response['raw'] else None
def token_for(token):
 if CLERK and token:
  u=next((u for u in users if u.get('token')==token),None)
  if u:
   claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
   if claims['exp']<time.time()+20:
    u['token']=clerk('/sessions/'+u['session']+'/tokens',{})['jwt'];return u['token']
 return token
def api(path,method='GET',body=None,token=None,public=False,headers=None):
 token=token_for(token)
 h={'apikey':PUBLIC if public else ADMIN,'Authorization':'Bearer '+(token or ADMIN),'Content-Type':'application/json'}
 h.update(headers or {})
 r=urllib.request.Request(BASE+path,method=method,headers=h,data=json.dumps(body).encode() if body is not None else None)
 try:
  with urllib.request.urlopen(r,timeout=60) as response:
   raw=response.read();return json.loads(raw) if raw else None
 except urllib.error.HTTPError as e: raise ApiError(e.code,e.read().decode()) from None
def denied(path,body,token):
 try:api(path,'POST',body,token,True)
 except ApiError as e:
  assert e.status in (400,401,403,404,409),e.status;return
 raise AssertionError('Expected denial')
def fn(name,body,token):return api('/functions/v1/'+name,'POST',body,token,True)
def retry_read(fn_call):
 # Only use for idempotent status/sign requests, never a reservation or finish.
 for attempt in range(4):
  try:return fn_call()
  except ApiError as error:
   if error.status not in (502,503,504) or attempt==3:raise
   time.sleep(2**attempt)
def s3_delete(bucket,key):
 # Cleanup requires separately supplied bucket-scoped R2 credentials; never log them.
 import datetime, hashlib, hmac, urllib.parse
 account=os.environ['R2_ACCOUNT_ID'];access=os.environ['R2_ACCESS_KEY_ID'];secret=os.environ['R2_SECRET_ACCESS_KEY']
 now=datetime.datetime.now(datetime.timezone.utc);date=now.strftime('%Y%m%d');stamp=now.strftime('%Y%m%dT%H%M%SZ');host=account+'.r2.cloudflarestorage.com'
 path='/'+bucket+'/'+urllib.parse.quote(key,safe='/');empty=hashlib.sha256(b'').hexdigest();headers=f'host:{host}\nx-amz-content-sha256:{empty}\nx-amz-date:{stamp}\n';signed='host;x-amz-content-sha256;x-amz-date';scope=date+'/auto/s3/aws4_request'
 canonical='\n'.join(['DELETE',path,'',headers,signed,empty]);string='AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+hashlib.sha256(canonical.encode()).hexdigest()
 def hm(k,v):return hmac.new(k,v.encode(),hashlib.sha256).digest()
 key_sig=hm(hm(hm(hm(('AWS4'+secret).encode(),date),'auto'),'s3'),'aws4_request');sig=hmac.new(key_sig,string.encode(),hashlib.sha256).hexdigest()
 req=urllib.request.Request('https://'+host+path,method='DELETE',headers={'x-amz-content-sha256':empty,'x-amz-date':stamp,'Authorization':f'AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed}, Signature={sig}'})
 with urllib.request.urlopen(req,timeout=30) as r:assert r.status==204
 canonical='\n'.join(['HEAD',path,'',headers,signed,empty]);string='AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+hashlib.sha256(canonical.encode()).hexdigest()
 sig=hmac.new(key_sig,string.encode(),hashlib.sha256).hexdigest()
 req=urllib.request.Request('https://'+host+path,method='HEAD',headers={'x-amz-content-sha256':empty,'x-amz-date':stamp,'Authorization':f'AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed}, Signature={sig}'})
 try:
  with urllib.request.urlopen(req,timeout=30):raise AssertionError('Deleted fixture object is still present')
 except urllib.error.HTTPError as error:
  if error.code!=404:raise
users=[];assets=[];film=None; upload_pending=set()
try:
 for i in range(3):
  email='backend-smoke-'+uuid.uuid4().hex+'@example.invalid';password=uuid.uuid4().hex+'!A9'
  if CLERK:
   u=clerk('/users',{'email_address':['backend-smoke-'+uuid.uuid4().hex+'+clerk_test@example.com'],'username':'smoke_'+uuid.uuid4().hex[:20],'password':password})
   fixture={'id':None,'clerk_id':u['id']};users.append(fixture)
   session=clerk('/sessions',{'user_id':u['id']});fixture['session']=session['id']
   fixture['token']=clerk('/sessions/'+session['id']+'/tokens',{})['jwt']
   claims=json.loads(base64.urlsafe_b64decode(fixture['token'].split('.')[1]+'==='));assert claims.get('role')=='authenticated'
   fixture['id']=api('/rest/v1/rpc/ensure_current_profile','POST',{},fixture['token'],True)
   assert fixture['id']==api('/rest/v1/rpc/ensure_current_profile','POST',{},fixture['token'],True)
  else:
   u=api('/auth/v1/admin/users','POST',{'email':email,'password':password,'email_confirm':True});users.append({'id':u['id']})
   session=api('/auth/v1/token?grant_type=password','POST',{'email':email,'password':password},public=True)
   users[-1]['token']=session['access_token']
  print('Created disposable '+('Clerk ' if CLERK else '')+'user',i+1,flush=True)
  api('/rest/v1/profiles?id=eq.'+users[-1]['id'],'PATCH',{'handle':'test_'+uuid.uuid4().hex[:16],'full_name':'Backend smoke fixture','bio':'Disposable verification user','roles':['director'],'onboarding_completed':True},users[-1]['token'],True)
 a,b,c=users
 guest=PUBLIC
 # Publishable keys are not JWTs. Explicitly omit Authorization for a real anon request.
 def guest_api(path,method='GET',body=None):
  req=urllib.request.Request(BASE+path,method=method,headers={'apikey':PUBLIC,'Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None)
  try:
   with urllib.request.urlopen(req,timeout=30) as res:
    raw=res.read();return json.loads(raw) if raw else None
  except urllib.error.HTTPError as e:raise ApiError(e.code,e.read().decode()) from None
 try:guest_api('/rest/v1/messages');raise AssertionError('Guest messages leaked')
 except ApiError as error:assert error.status in (401,403)
 film=api('/rest/v1/films','POST',{'owner_id':a['id'],'title':'Disposable backend smoke film','synopsis':'A quiet film about leaving home.','genres':['drama']},a['token'],True,{'Prefer':'return=representation'})[0]
 assert api('/rest/v1/films?id=eq.'+film['id'],token=b['token'],public=True)==[]
 assert guest_api('/rest/v1/films?id=eq.'+film['id'])==[]
 denied('/rest/v1/rpc/publish_film',{'p_film_id':film['id']},b['token'])
 cid=api('/rest/v1/rpc/open_conversation','POST',{'p_other_user':b['id']},a['token'],True)
 api('/rest/v1/messages','POST',{'conversation_id':cid,'sender_id':a['id'],'body':'Disposable hello'},a['token'],True)
 assert len(api('/rest/v1/messages?conversation_id=eq.'+cid,token=b['token'],public=True))==1
 assert api('/rest/v1/messages?conversation_id=eq.'+cid,token=c['token'],public=True)==[]
 denied('/rest/v1/messages',{'conversation_id':cid,'sender_id':b['id'],'body':'Forged'},a['token'])
 print('PASS auth, profile bootstrap, draft privacy, chat authorization, impersonation denial')
 assert fn('index-entity',{'kind':'profile','id':a['id']},a['token'])['indexed']
 assert fn('index-entity',{'kind':'film','id':film['id']},a['token'])['indexed']
 search=fn('search',{'query':'quiet films about leaving home'},a['token']);assert search['mode']=='hybrid',search
 print('PASS Supabase gte-small indexing and hybrid query embedding',flush=True)
 with tempfile.TemporaryDirectory(prefix='arcenray-smoke-') as tmp:
  movie=pathlib.Path(tmp)/'film.mp4';poster=pathlib.Path(tmp)/'poster.webp'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=320x240:d=1','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',str(movie)],check=True)
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=256x256','-frames:v','1',str(poster)],check=True)
  film_source=pathlib.Path(os.environ['ARCENRAY_SMOKE_FILM']) if os.environ.get('ARCENRAY_SMOKE_FILM') else movie
  for kind,file,mime in [('film',film_source,'video/mp4'),('hook',movie,'video/mp4'),('poster',poster,'image/webp'),('profile_picture',poster,'image/webp')]:
   if kind=='film' and os.environ.get('ARCENRAY_SMOKE_MULTIPART')=='1':
    size=file.stat().st_size; hashes=[]; fingerprint_start=time.monotonic()
    with file.open('rb') as source:
     while chunk:=source.read(16*1024*1024):hashes.append(hashlib.sha256(chunk).hexdigest())
    manifest=json.dumps({'version':1,'size':size,'type':'video/mp4','parts':hashes},separators=(',',':'))
    print('Fingerprint elapsed seconds',round(time.monotonic()-fingerprint_start,1),'bytes',size,flush=True)
    reserved=fn('media-upload',{'action':'multipart_create','draft_id':film['id'],'request_id':str(uuid.uuid4()),'bytes':size,'content_type':mime,'fingerprint':hashlib.sha256(manifest.encode()).hexdigest()},a['token']);aid=reserved['asset_id'];assets.append(aid);upload_pending.add(aid)
    started=time.monotonic()
    with file.open('rb') as source:
     for first in range(1,reserved['part_count']+1,2):
      numbers=list(range(first,min(first+2,reserved['part_count']+1)))
      parts=retry_read(lambda:fn('media-upload',{'action':'multipart_sign','asset_id':aid,'part_numbers':numbers},a['token']))['parts']
      for number,part in zip(numbers,parts,strict=True):
       assert part['part_number']==number
       data=source.read(part['bytes']);assert len(data)==part['bytes']
       with urllib.request.urlopen(urllib.request.Request(part['upload_url'],method='PUT',data=data,headers=part['headers']),timeout=900) as res:assert res.status==200
       if number%10==0 or number==reserved['part_count']:print('Multipart progress',number,'/',reserved['part_count'],'elapsed seconds',round(time.monotonic()-started,1),flush=True)
    status=retry_read(lambda:fn('media-upload',{'action':'multipart_status','asset_id':aid},a['token']))
    assert len(status['parts'])==reserved['part_count'] and sum(p['bytes'] for p in status['parts'])==size
    print('PASS multipart part upload and server-side resume listing',flush=True)
   else:
    data=file.read_bytes();reserved=fn('media-upload',{'action':'create','kind':kind,'bytes':len(data),'content_type':mime},a['token']);aid=reserved['asset_id'];assets.append(aid)
    req=urllib.request.Request(reserved['upload_url'],method='PUT',data=data,headers=reserved['headers'])
    try:
     with urllib.request.urlopen(req,timeout=60) as res:assert res.status==200
    except urllib.error.HTTPError as e:
     try:code=ET.fromstring(e.read()).findtext('Code')
     except ET.ParseError:code='unrecognized_error'
     raise AssertionError(f'R2 direct upload failed HTTP {e.code}, code {code}') from None
   # Direct uploads require an existing draft attachment. Multipart verification
   # attaches its own completed reservation inside the trusted transaction.
   if kind=='film' and os.environ.get('ARCENRAY_SMOKE_MULTIPART')!='1':api('/rest/v1/films?id=eq.'+film['id'],'PATCH',{'film_asset_id':aid},a['token'],True)
   complete=fn('media-upload',{'action':'multipart_finish' if kind=='film' and os.environ.get('ARCENRAY_SMOKE_MULTIPART')=='1' else 'complete','asset_id':aid},a['token']);assert complete['status'] in ('uploaded','ready')
   upload_pending.discard(aid)
   if kind not in ('film','profile_picture'):api('/rest/v1/films?id=eq.'+film['id'],'PATCH',{kind+'_asset_id':aid},a['token'],True)
   if kind=='film':
    deadline=time.monotonic()+int(os.environ.get('ARCENRAY_SMOKE_PROCESSING_TIMEOUT','300'))
    while True:
     state=retry_read(lambda:api('/rest/v1/rpc/get_media_processing_state','POST',{'p_asset':aid},a['token'],True))
     if state and state.get('state')=='complete':break
     if state and state.get('state')=='queued' and state.get('error') and os.environ.get('ARCENRAY_SMOKE_EXPECT_FAILURE')=='1':
      print('Observed processing rejection after first attempt:',state.get('error'),'total seconds',round(time.monotonic()-started,1),flush=True)
      api('/rest/v1/rpc/delete_my_film','POST',{'p_film':film['id'],'p_confirmation':'DELETE FILM'},a['token'],True)
      raise SystemExit(0)
     if state and state.get('state') in ('failed','cancelled'):
      if os.environ.get('ARCENRAY_SMOKE_EXPECT_FAILURE')=='1':
       print('Observed processing failure',state.get('state'),'reason',state.get('error'),'total seconds',round(time.monotonic()-started,1),flush=True)
       raise SystemExit(0)
      raise AssertionError('Film processing failed: '+str(state.get('state')))
     if time.monotonic()>=deadline:raise AssertionError('Film processing timed out')
     time.sleep(5)
  published=fn('media-upload',{'action':'publish','film_id':film['id']},a['token']);assert published['status']=='published'
  assert len(api('/rest/v1/films?id=eq.'+film['id'],token=b['token'],public=True))==1
  url=os.environ['R2_PUBLIC_URL']+'/'+published['film_key']
  subprocess.run(['node','scripts/check-media-range.mjs'],env={**os.environ,'ARCENRAY_SMOKE_MEDIA_URL':url},check=True)
  print('PASS R2 upload, server processing, profile picture, publication, CDN Range playback')
  semantic=fn('search',{'query':'quiet films about leaving home','kind':'film'},b['token'])
  assert semantic['mode']=='hybrid' and any(row['id']==film['id'] and row['score']>0 for row in semantic['results']),semantic
  print('PASS published film retrieved with real gte-small query vector')
  assert guest_api('/rest/v1/films?id=eq.'+film['id'])[0]['id']==film['id']
  assert guest_api('/rest/v1/profiles?id=eq.'+a['id'])[0]['id']==a['id']
  print('PASS guest public films/profiles and draft/message privacy')
  api('/rest/v1/rpc/record_event','POST',{'p_film_id':film['id'],'p_kind':'film_complete','p_idempotency_key':str(uuid.uuid4()),'p_watch_seconds':1},b['token'],True)
  assert not any(f['id']==film['id'] for f in api('/rest/v1/rpc/get_personalized_feed','POST',{},b['token'],True))
  print('PASS event ingestion and consumed-film filtering')
 print('All live checks passed, including Supabase embedding inference')
finally:
 # Only IDs created by this process are deleted. Never delete unrelated project data.
 cleanup_ok=True
 for aid in upload_pending:
  try:fn('media-upload',{'action':'multipart_abort','asset_id':aid},users[0]['token']);print('Incomplete multipart cleanup queued:',aid)
  except Exception as e:print('Incomplete multipart abort needs retry:',aid,type(e).__name__)
  cleanup_ok=False
 for aid in assets:
  if aid in upload_pending:continue
  try:
   asset=api('/rest/v1/rpc/backend_asset','POST',{'p_id':aid,'p_owner':users[0]['id']})
   if asset:
    for bucket,key in [(os.environ['R2_UPLOAD_BUCKET_NAME'],asset['object_key']),(os.environ['R2_BUCKET_NAME'],'assets/'+aid)]:
     try:s3_delete(bucket,key)
     except Exception:
      # Optional local CLI fallback if server secrets were rotated independently.
      if os.environ.get('ARCENRAY_TEST_WRANGLER_CLEANUP')!='1':raise
      subprocess.run(['pnpm','exec','wrangler','r2','object','delete',bucket+'/'+key,'--remote'],check=True,stdout=subprocess.DEVNULL)
  except Exception as e:cleanup_ok=False;print('Fixture object cleanup needs retry:',aid,type(e).__name__)
 for u in reversed(users):
  try:
   if not cleanup_ok:print('Retained disposable user for cleanup:',u.get('id'));continue
   if CLERK:
    if u['id']:api('/rest/v1/profiles?id=eq.'+u['id'],'DELETE')
    clerk('/users/'+u['clerk_id'],method='DELETE')
   else:api('/auth/v1/admin/users/'+u['id'],'DELETE')
  except Exception as e:print('Fixture user cleanup needs retry:',u['id'],type(e).__name__)
 # Polymorphic private embedding rows have no entity FK; remove this run's orphans.
 ids=[str(uuid.UUID(u['id'])) for u in users if u['id']]
 if film:ids.append(str(uuid.UUID(film['id'])))
 if ids:
  literals=','.join("'"+value+"'" for value in ids)
  sql="delete from private.entity_embeddings e where entity_id in ("+literals+") and ((kind='profile' and not exists(select 1 from public.profiles p where p.id=e.entity_id)) or (kind='film' and not exists(select 1 from public.films f where f.id=e.entity_id)));"
  result=subprocess.run(['pnpm','exec','supabase','db','query','--linked',sql],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  if result.returncode:print('Fixture embedding cleanup needs retry')
 print('Disposable test cleanup attempted')
