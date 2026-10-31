'use strict';
const {app,BrowserWindow,ipcMain,desktopCapturer,session,protocol,net,globalShortcut,dialog,safeStorage,shell,powerSaveBlocker,screen}=require('electron');
const path=require('node:path');const fs=require('node:fs/promises');
const ROOT=path.join(__dirname,'renderer'),URL_APP='clipa://app/studio.html';
protocol.registerSchemesAsPrivileged([{scheme:'clipa',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'; worker-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: https://huggingface.co https://*.huggingface.co https://*.hf.co https://storage.googleapis.com/mediapipe-models/";
let micUntil=0,publisher,narrator,publisherError='';
let nativeMedia,powerBlocker=null;
function maintainPower(){const active=recording||busy||nativeMedia?.busy;if(active&&powerBlocker===null)powerBlocker=powerSaveBlocker.start('prevent-app-suspension');else if(!active&&powerBlocker!==null){powerSaveBlocker.stop(powerBlocker);powerBlocker=null;}}
let nativeChoice=null;let win,selection=null,sourceCache=new Map(),sourceRequest=0,recording=false,busy=false,shortcutOK=false;
function trusted(e){if(!win||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||e.senderFrame.url!==URL_APP)throw Error('Origem não autorizada.');}
function send(type,data){if(win&&!win.isDestroyed())win.webContents.send(type,data);}
if(process.platform==='win32'&&!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(win){win.restore();win.show();win.focus();}});
app.whenReady().then(async()=>{
 protocol.handle('clipa',async request=>{
  const u=new URL(request.url);if(u.host==='app'&&u.pathname.startsWith('/media/'))return nativeMedia?nativeMedia.serve(request):new Response('Not ready',{status:503});let relative;try{relative=decodeURIComponent(u.pathname);}catch{return new Response('Bad path',{status:400});}
  const file=path.resolve(ROOT,'.'+relative);
  if(u.host!=='app'||!file.startsWith(ROOT+path.sep)||!['GET','HEAD'].includes(request.method))return new Response('Forbidden',{status:403});
  try{const info=await fs.stat(file);if(!info.isFile())return new Response('Not found',{status:404});const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.json':'application/json'};const body=request.method==='HEAD'?null:await fs.readFile(file);return new Response(body,{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':String(info.size),'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'}});}catch{return new Response('Not found',{status:404});}
 });
 win=new BrowserWindow({width:1440,height:960,minWidth:760,minHeight:600,title:'Clipa',backgroundColor:'#10111a',icon:path.join(ROOT,'icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(e,url)=>{if(url!==URL_APP)e.preventDefault();});
 win.webContents.on('will-attach-webview',e=>e.preventDefault());
 const resetCaptureState=()=>{selection=null;micUntil=0;recording=false;busy=false;maintainPower();sourceCache.clear();sourceRequest++;if(!win.isDestroyed())win.setTitle('Clipa');};
 win.webContents.on('did-navigate',resetCaptureState);
 win.webContents.on('render-process-gone',resetCaptureState);
 const {makePublisher,externalURL,sanitizeError}=require('./publisher.cjs');
 publisher=makePublisher({directory:path.join(app.getPath('userData'),'creator-library'),safeStorage,openExternal:url=>shell.openExternal(url),onChange:()=>send('clipa:library-updated',{})});
 narrator=require('./narrator.cjs').makeNarrator({getKey:()=>publisher.aiKey()});
 try{await publisher.init();}catch(e){publisherError=e.message;}
 ipcMain.handle('clipa:publisher',async(e,data)=>{
  trusted(e);if(publisherError)throw Error(publisherError);if(!data||typeof data.action!=='string')throw Error('Pedido inválido.');
  const handlers={rankClips:()=>narrator.rankClips(data.value),reviewCaptions:()=>narrator.reviewCaptions(data.value),analyzeVisual:()=>narrator.analyzeVisual(data.value),speech:()=>narrator.speech(data.value),cancelNarrator:()=>narrator.cancel(),status:()=>publisher.snapshot(),configure:()=>publisher.configure(data.value),profile:()=>publisher.profile(data.provider,data.url),connect:()=>publisher.connect(data.provider),disconnect:()=>publisher.disconnect(data.provider),creator:()=>publisher.creatorInfo(),begin:()=>publisher.beginFile(data.value),chunk:()=>publisher.chunk(data.id,data.bytes),finish:()=>publisher.finishFile(data.id,data.value),abandon:()=>publisher.abandon(data.id),enqueue:()=>publisher.enqueue(data.value),cancel:()=>publisher.cancelJob(data.id),confirm:()=>publisher.markPublished(data.id,data.url),imageKey:()=>publisher.imageKey(data.value),thumbnail:()=>publisher.thumbnail(data.value),cancelImage:()=>publisher.cancelImage(),
   download:async()=>{const file=await publisher.assetPath(data.id);const result=await dialog.showSaveDialog(win,{title:'Salvar arquivo',defaultPath:path.join(app.getPath('downloads'),path.basename(file)),filters:[{name:'Mídia',extensions:[path.extname(file).slice(1)]}]});if(result.canceled)return {cancelled:true};await fs.copyFile(file,result.filePath);return {saved:true};},
   reveal:async()=>{shell.showItemInFolder(await publisher.assetPath(data.id));return true;},
   open:async()=>{externalURL(data.url,['youtube.com','youtu.be','tiktok.com','instagram.com','developers.google.com','developers.tiktok.com','developers.facebook.com','console.cloud.google.com','platform.openai.com']);await shell.openExternal(data.url);return true;}
  };
  if(!Object.hasOwn(handlers,data.action))throw Error('Ação não autorizada.');try{return await handlers[data.action]();}catch(e){throw Error(sanitizeError(e));}
 });
 nativeMedia=require('./native-media.cjs').makeMedia({directory:path.join(app.getPath('userData'),'media-engine'),videos:app.getPath('videos'),downloads:app.getPath('downloads'),dialog,window:()=>win,safeStorage,reveal:file=>shell.showItemInFolder(file),getRectangle:source=>{if(!nativeChoice||nativeChoice.id!==source||Date.now()-nativeChoice.at>60000)throw Error('Selecione a tela novamente.');const chosen=sourceCache.get(source);if(!chosen||!source.startsWith('screen:'))throw Error('Captura nativa: selecione uma tela inteira. Para janelas, use Compatibilidade.');const display=screen.getAllDisplays().find(d=>String(d.id)===chosen.display_id);if(!display)throw Error('Monitor desconectado. Atualize as telas.');return screen.dipToScreenRect(null,display.bounds);},ffmpeg:path.join(__dirname,'native',process.platform==='win32'?'ffmpeg.exe':'ffmpeg')});await nativeMedia.init();
 ipcMain.handle('clipa:file',async(e,file)=>{trusted(e);return nativeMedia.acceptFile(file);});
 ipcMain.handle('clipa:media',async(e,data)=>{trusted(e);const p=nativeMedia.call(data);maintainPower();try{return await p;}finally{maintainPower();}});
 const ses=session.defaultSession;
 // Electron reports display capture as media with an empty mediaTypes array.
 // Permit it only while our trusted picker has a fresh one-use screen selection.
 // Camera requests contain 'video' and remain denied; microphone has its own opt-in.
 const pendingDisplayConsent=()=>selection&&Date.now()-selection.at<15000;
 ses.setPermissionRequestHandler((wc,permission,callback,details={})=>callback(wc===win.webContents&&wc.getURL()===URL_APP&&(permission==='display-capture'||(permission==='media'&&details.requestingUrl===URL_APP&&details.isMainFrame===true&&((Date.now()<micUntil&&details.mediaTypes?.length===1&&details.mediaTypes[0]==='audio')||(details.mediaTypes?.length===0&&!!pendingDisplayConsent()))))));
 ses.setPermissionCheckHandler((wc,permission,origin,details={})=>wc===win.webContents&&wc.getURL()===URL_APP&&(permission==='display-capture'||(permission==='media'&&Date.now()<micUntil&&(origin==='clipa://app'||origin==='clipa://app/')&&details.mediaType==='audio')));
 ipcMain.handle('clipa:microphone',(e,enabled)=>{trusted(e);if(typeof enabled!=='boolean')throw Error('Pedido inválido.');micUntil=enabled?Date.now()+60000:0;return true;});
 ses.setDisplayMediaRequestHandler((request,callback)=>{
  // A source chosen in our trusted picker is a one-use permission. Reuse that exact object;
  // a second desktopCapturer scan here can stall the display request on Windows.
  if(request.frame!==win.webContents.mainFrame||request.frame?.url!==URL_APP){callback(null);return;}
  const chosen=selection;selection=null;
  if(!chosen||Date.now()-chosen.at>15000){callback(null);return;}
  callback({video:chosen.source,...(chosen.audio&&request.audioRequested&&process.platform==='win32'?{audio:'loopback'}:{})});
 });
 ipcMain.handle('clipa:sources',async e=>{
  trusted(e);if(recording||busy)throw Error('Finalize a tarefa atual.');
  const request=++sourceRequest;selection=null;
  const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180}});
  if(request!==sourceRequest)throw Error('A lista de telas foi atualizada. Tente novamente.');
  sourceCache=new Map(sources.map(source=>[source.id,source]));
  return sources.map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}));
 });
 ipcMain.handle('clipa:select',(e,data)=>{
  trusted(e);
  if(!data||typeof data.id!=='string'||!sourceCache.has(data.id)||typeof data.audio!=='boolean'||recording||busy)throw Error('Seleção inválida. Atualize as telas e escolha novamente.');
  nativeChoice={id:data.id,at:Date.now()};selection={source:sourceCache.get(data.id),audio:data.audio,at:Date.now()};return true;
 });
 ipcMain.handle('clipa:cancel-capture',e=>{trusted(e);selection=null;nativeChoice=null;micUntil=0;return true;});
 ipcMain.handle('clipa:state',(e,data)=>{trusted(e);if(!data||typeof data.recording!=='boolean'||typeof data.busy!=='boolean')throw Error('Estado inválido.');recording=data.recording;busy=data.busy;maintainPower();win.setTitle(recording?'● REC — Clipa':'Clipa');if(data.finished===true){win.show();win.focus();}return true;});
 ipcMain.handle('clipa:info',e=>{trusted(e);return {platform:process.platform,version:app.getVersion(),shortcut:shortcutOK?'Ctrl+Shift+9':null};});
 ses.on('will-download',(e,item,wc)=>{
  if(wc!==win.webContents||!item.getURL().startsWith('blob:')){e.preventDefault();return;}
  item.setSaveDialogOptions({title:'Salvar arquivo do Clipa',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});
  item.once('done',(_,state)=>send('clipa:download',{state,name:path.basename(item.getSavePath()||item.getFilename())}));
 });
 shortcutOK=process.platform==='win32'&&globalShortcut.register('CommandOrControl+Shift+9',()=>{if(busy)return;if(!recording){win.restore();win.show();win.focus();}send('clipa:toggle');});
 win.on('close',e=>{if(recording||busy||nativeMedia?.busy||publisher?.busy||narrator?.busy){const choice=dialog.showMessageBoxSync(win,{type:'warning',buttons:['Continuar no Clipa','Fechar e descartar tarefa'],defaultId:0,cancelId:0,message:'Existe uma gravação ou processamento em andamento.'});if(choice===0)e.preventDefault();}});
 await win.loadURL(URL_APP);
});
app.on('will-quit',()=>{narrator?.cancel();nativeMedia?.close();publisher?.close();globalShortcut.unregisterAll();});app.on('window-all-closed',()=>app.quit());
}
