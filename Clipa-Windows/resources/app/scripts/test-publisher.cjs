'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const {makePublisher,externalURL}=require('../publisher.cjs');
const secure={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'test',encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clipa-publisher-test-'));let clock=Date.now(),requests=[],failUpload=false,instance;
 const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
 const fakeFetch=async(url,opts={})=>{url=String(url);requests.push({url,method:opts.method||'GET',headers:opts.headers,body:opts.body});
  if(url.includes('/oauth/token/')||url.includes('oauth2.googleapis.com'))return json({access_token:'TEST_ACCESS',refresh_token:'TEST_REFRESH',expires_in:3600,open_id:'tiktok-account'});
  if(url.includes('/thumbnails/set?'))return json({items:[{default:{url:'https://test.invalid/thumb.jpg'}}]});
  if(url.includes('/channels?'))return json({items:[{id:'yt-account',snippet:{title:'Conta de teste'}}]});
  if(url.includes('/creator_info/'))return json({data:{creator_nickname:'TikTok teste',max_video_post_duration_sec:180,privacy_level_options:['SELF_ONLY','PUBLIC_TO_EVERYONE'],comment_disabled:false,duet_disabled:true,stitch_disabled:false},error:{code:'ok'}});
  if(url.includes('/upload/youtube/v3/videos'))return json({},200,{location:'https://www.googleapis.com/upload/session/test'});
  if(url.includes('/upload/session/test')){if(failUpload)throw Error('network down');let size=0;for await(const b of opts.body)size+=b.length;assert(size>0);return json({id:'yt-video'});}
  if(url.includes('/youtube/v3/videos?'))return json({items:[{status:{uploadStatus:'processed',privacyStatus:'public'}}]});
  if(url.includes('/post/publish/video/init/'))return json({data:{publish_id:'tt-publish',upload_url:'https://upload.us.tiktokapis.com/video/test'},error:{code:'ok'}});
  if(url.includes('upload.us.tiktokapis.com')){for await(const b of opts.body){}return new Response('',{status:201});}
  if(url.includes('/status/fetch/'))return json({data:{status:'PUBLISH_COMPLETE'},error:{code:'ok'}});
  if(url.includes('graph.facebook.com')&&url.includes('fields=id,username'))return json({id:'123456789',username:'instagram-teste'});
  if(url.endsWith('/media'))return json({id:'ig-container',uri:'https://rupload.facebook.com/ig-api-upload/test'});
  if(url.includes('rupload.facebook.com')){for await(const b of opts.body){}return json({success:true});}
  if(url.includes('fields=status_code,status'))return json({status_code:'FINISHED'});
  if(url.endsWith('/media_publish'))return json({id:'ig-posted'});
  if(url.includes('fields=permalink'))return json({permalink:'https://www.instagram.com/reel/test/'});
  if(url.includes('api.openai.com')){assert.equal(opts.body.get('model'),'gpt-image-2');assert.equal(opts.body.get('size'),'1536x864');assert.equal(opts.body.getAll('image[]').length,1);return json({data:[{b64_json:Buffer.from([255,216,255,217]).toString('base64')}]});}
  throw Error('Unexpected request: '+url);
 };
 const openExternal=async url=>{const u=new URL(url);assert(u.searchParams.get('state').length>30);assert(u.searchParams.get('code_challenge').length>=43);const callback=new URL(u.searchParams.get('redirect_uri'));callback.search=new URLSearchParams({state:u.searchParams.get('state'),code:'TEST_CODE'});await fetch(callback);};
 const options={directory:dir,safeStorage:secure,fetch:fakeFetch,openExternal,now:()=>clock};instance=makePublisher(options);await instance.init();
 assert.throws(()=>externalURL('https://youtube.com.evil.invalid/',['youtube.com']));assert.throws(()=>externalURL('file:///etc/passwd',['youtube.com']));assert.throws(()=>externalURL('https://name:password@youtube.com',['youtube.com']));
 await assert.rejects(instance.connect('youtube'),/Configure/);await assert.rejects(instance.thumbnail({prompt:'test',images:[]}),/chave/);await assert.rejects(instance.beginFile({kind:'video',size:2e9}),/limite/);
 let h=await instance.beginFile({kind:'video',size:64});await assert.rejects(instance.chunk(h,new Uint8Array(100)),/inválido/);await assert.rejects(instance.finishFile(h,{}),/incompleta/);await instance.abandon(h);
 for(const p of ['youtube','tiktok']){await instance.configure({provider:p,clientId:'TEST_CLIENT',clientSecret:'TEST_SECRET'});await instance.connect(p);}
 await instance.configure({provider:'instagram',accountId:'123456789',accessToken:'TEST_META'});
 const bytes=Buffer.alloc(2048);bytes.write('ftyp',4);h=await instance.beginFile({kind:'video',size:bytes.length});await instance.chunk(h,new Uint8Array(bytes));const a=await instance.finishFile(h,{title:'Vídeo teste',duration:10,width:1280,height:720,fps:60,codec:'avc'});
 let thumbHandle=await instance.beginFile({kind:'thumbnail',size:4});await instance.chunk(thumbHandle,new Uint8Array([255,216,255,217]));const thumbAsset=await instance.finishFile(thumbHandle,{title:'Capa'});
 const meta={title:'Publicação de teste',description:'Teste controlado',privacy:'public',madeForKids:false,consent:true};
 await assert.rejects(instance.enqueue({assetId:a.id,provider:'youtube',metadata:{title:'x'}}),/visibilidade/);
 const future=new Date(clock+120000).toISOString();await instance.enqueue({assetId:a.id,provider:'youtube',metadata:{...meta,thumbnailAssetId:thumbAsset.id},when:future});await assert.rejects(instance.enqueue({assetId:a.id,provider:'youtube',metadata:{...meta,thumbnailAssetId:thumbAsset.id},when:future}),/Já existe/);assert.equal(instance.snapshot().jobs[0].status,'scheduled');clock+=120001;await instance.tick();await new Promise(r=>setTimeout(r,80));await instance.tick();assert.equal(instance.snapshot().jobs[0].status,'published');assert(requests.some(r=>r.url.includes('/thumbnails/set?')));
 await instance.enqueue({assetId:a.id,provider:'tiktok',metadata:{...meta,privacy:'SELF_ONLY',allowDuet:true},when:new Date(clock+100000).toISOString()});clock+=100001;await instance.tick();await new Promise(r=>setTimeout(r,30));await instance.tick();assert.equal(instance.snapshot().jobs[1].status,'published');const tt=JSON.parse(requests.find(r=>r.url.includes('/post/publish/video/init/')).body);assert.equal(tt.post_info.disable_duet,true);assert.equal(tt.source_info.chunk_size,2048);
 await instance.enqueue({assetId:a.id,provider:'instagram',metadata:meta,when:new Date(clock+100000).toISOString()});clock+=100001;await instance.tick();await new Promise(r=>setTimeout(r,30));await instance.tick();assert.equal(instance.snapshot().jobs[2].status,'published');
 // Missed jobs never post late without another decision from the editor.
 await instance.enqueue({assetId:a.id,provider:'youtube',metadata:meta,when:new Date(clock+100000).toISOString()});clock+=800001;await instance.tick();assert.equal(instance.snapshot().jobs[3].status,'missed');
 // Uncertain upload is never blindly retried, to avoid duplicate uploads.
 failUpload=true;await instance.enqueue({assetId:a.id,provider:'youtube',metadata:meta,when:new Date(clock+100000).toISOString()});clock+=100001;await instance.tick();await new Promise(r=>setTimeout(r,30));await instance.tick();assert.equal(instance.snapshot().jobs[4].status,'review');
 await instance.imageKey('TEST_IMAGE_KEY');const image=await instance.thumbnail({prompt:'Thumbnail de teste',images:[new Uint8Array([255,216,255,217])],quality:'high'});assert.equal(image[0],255);
 const state=JSON.stringify(instance.snapshot());assert(!state.includes('TEST_ACCESS'));assert(!state.includes('TEST_SECRET'));assert(!state.includes('TEST_IMAGE_KEY'));await instance.close();
 instance=makePublisher(options);await instance.init();assert.equal(instance.snapshot().jobs.length,5);assert.equal(instance.snapshot().assets.length,2);assert.equal(instance.snapshot().accounts.youtube.connected,true);await instance.close();
 const insecure=makePublisher({...options,directory:dir+'-insecure',safeStorage:{...secure,isEncryptionAvailable:()=>false}});await insecure.init();await assert.rejects(insecure.configure({provider:'youtube',clientId:'x'}),/cofre/);assert.equal(insecure.snapshot().accounts.youtube.configured,false);await insecure.close();
 console.log('PASS: URLs, OAuth/PKCE callbacks, protected credentials, chunk limits, final file, 3 upload adapters, scheduling, duplicates, late jobs, interrupted upload review, image request, persistence. All network responses controlled; no real post or billable generation.');
})().catch(e=>{console.error(e);process.exit(1)});
