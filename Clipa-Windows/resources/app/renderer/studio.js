'use strict';
function clipSpeed(){return Math.max(.25,Math.min(4,Number($('clipSpeed')?.value)||1));}
function clipFade(t){const a=Number($('start').value),b=Number($('end').value),elapsed=(t-a)/clipSpeed(),remaining=(b-t)/clipSpeed();return Math.max(0,Math.min(1,clipaAudioEdit.fadeIn?elapsed/clipaAudioEdit.fadeIn:1,clipaAudioEdit.fadeOut?remaining/clipaAudioEdit.fadeOut:1));}

const ext=globalThis.browser||globalThis.chrome;
const $ = id => document.getElementById(id);
const video = $('video');
let recorder, capture, chunks = [], tick, began, rawBlob, rawURL, resultBlob, resultURL;
let composition=ClipComposition.defaults(),backgroundImage=null,backgroundURL=null,compositionSelection='content',modeRegions={};
let crop = {x:0,y:0,w:1,h:1}, dragging, duration = 0, exporting = false, cancelExport = false;
let audioContext, audioSource, monitor, previewing = false;
let cropCenter={x:0.5,y:0.5}, viewMode='source', panDrag, previewFrame;
let formatMode='wide',regionKey='content',regionStates={},wideState,placingCaption=false;
let cues=[],exclusions=[],aiWorking=false,aiWorker,aiJob=0,aiCancel=false,detectorBusy=false;
let sourceInfo={fps:null,hasAudio:null};
let selectionTool='select',regionAssigned={cam1:false,content:false,cam2:false},shortInitialized=false;
let modeSettings={},cropHistory={},seekSerial=0,aiStarted=0,aiTimer,lastDownloadId=null;
const modeFields=['resolution','fps','quality','fit','aspect','captionX','captionY','captionSize','captionStyle','captionColor','captionOutline','captionHighlight','captionBoxColor','captionsEnabled','hardware','videoCodec'];
const regionLabels={cam1:'1 · Câmera',content:'2 · Vídeo',cam2:'3 · Câmera inferior'};
const regionLabel=key=>window.clipaLayouts321?.label(key)||(formatMode==='composition'?({cam1:'2 · Câmera',content:'1 · Vídeo'}[key]||regionLabels[key]):Number($('cameraCount').value)===0?'Vídeo livre':regionLabels[key]);
const regionColors={cam1:'#f2f2f2',content:'#c7c7c7',cam2:'#999999'};
const clone=o=>JSON.parse(JSON.stringify(o));
function cropState(){return {crop:clone(crop),center:{...cropCenter},zoom:Number($('zoom').value)};}
function stateFor(rect){return {crop:{...rect},center:{x:rect.x+rect.w/2,y:rect.y+rect.h/2},zoom:1};}
function commitRegion(){if(formatMode!=='wide'||window.clipaLayouts321?.active)regionStates[regionKey]=cropState();else wideState=cropState();}
function loadState(s){crop=clone(s.crop);cropCenter={...s.center};$('zoom').value=s.zoom;}
function regionRect(key,time=video.currentTime){const s=regionStates[key];const r=ClipGeometry.effective(s.crop,s.zoom,s.center);const tracked=window.clipaTracking?.rect(formatMode,key,r,time)||r;return window.clipaMotion?.rect(formatMode,key,tracked,time)||tracked;}
function captionOptions(){return {enabled:$('captionsEnabled').checked,size:Number($('captionSize').value),x:Number($('captionX').value),y:Number($('captionY').value),style:$('captionStyle').value,color:$('captionColor').value,outline:$('captionOutline').value,highlight:$('captionHighlight').value,boxColor:$('captionBoxColor').value,placing:placingCaption};}
function isBusy(){return exporting||aiWorking;}
const fmt = n => `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const precise=n=>fmt(n)+'.'+String(Math.floor((n%1)*100)).padStart(2,'0');
const status = text => $('status').textContent = text;
const editStatus = text => {if(!exporting)$('exportTitle').textContent='Aviso do editor';$('editStatus').textContent=text;$('footerStatus').textContent=text;$('exportNotice').hidden=false;};
const once = (target,event) => new Promise((resolve,reject) => {
  const timer=setTimeout(()=>{cleanup();reject(new Error('O vídeo não respondeu a tempo.'));},15000);
  const ok=()=>{cleanup();resolve();}, bad=()=>{cleanup();reject(new Error('Não foi possível ler este vídeo.'));};
  function cleanup(){clearTimeout(timer);target.removeEventListener(event,ok);target.removeEventListener('error',bad);}
  target.addEventListener(event,ok,{once:true});target.addEventListener('error',bad,{once:true});
});
const dbPromise = new Promise((resolve,reject)=>{
  const r=indexedDB.open('clipa',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips');
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});
async function storage(mode, value){
  const db=await dbPromise;
  return new Promise((resolve,reject)=>{const tx=db.transaction('clips',mode),s=tx.objectStore('clips');
    const req=mode==='readonly'?s.get('last'):s.put(value,'last');
    tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
let lastSaved;
storage('readonly').then(v=>{lastSaved=v;$('restore').hidden=!v;}).catch(()=>status('Armazenamento local indisponível. Baixe antes de fechar.'));
$('restore').onclick=async()=>{if(isBusy()||capturePending)return;try{if(lastSaved?.nativeRecording){const meta=await clipaDesktop.io({action:'last-recording'});lastSaved={blob:await clipaDisk.load(meta),duration:lastSaved.duration};}if(!lastSaved?.blob)throw Error('Importe novamente o arquivo da pasta de gravações.');await openEditor(lastSaved.blob,lastSaved.duration);}catch(e){status('Não foi possível reabrir: '+e.message+' Importe o original pela tela inicial.');}};
function mp4Type(withAudio=true){return (withAudio?['video/mp4;codecs=avc1.420028,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc1,opus']:['video/mp4;codecs=avc1.420028','video/mp4;codecs=avc1']).find(t=>MediaRecorder.isTypeSupported(t));}
function stopCapture(){if(capturePending){window.clipaCancelCaptureSetup?.();captureStartup?.abort();}if(recorder&&recorder.state!=='inactive')recorder.stop();}
let capturePending=false,pickerRequest=null,captureStartup=null;
async function startCapture(fromShortcut=false,returnTabId=null){
 if(window.clipaImporting){status("Aguarde o vídeo terminar de abrir.");return;}
  if(isBusy()||capturePending||recorder?.state==='recording')return;
  if(rawBlob&&!fromShortcut&&!confirm('Iniciar outra gravação? A última gravação salva será substituída quando esta terminar.'))return;
  capturePending=true;captureStartup=new AbortController();let recorderStarted=false;capture=null;let diskRecorder=null;
  $('record').disabled=true;$('restore').disabled=true;$('file').disabled=true;$('stop').disabled=false;$('stop').textContent='Cancelar preparação';status('Escolha a tela para iniciar a gravação.');
  try{
    video.pause();$('output').pause();previewing=false;
    const fps=Number($('captureFps').value);
    capture=window.clipaDesktop?await desktopCaptureStream(fps):fromShortcut?await shortcutStream(fps):await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:7680},height:{ideal:4320},resizeMode:'none',frameRate:{ideal:fps,max:fps}},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},systemAudio:'include',selfBrowserSurface:'exclude'});
    if(captureStartup.signal.aborted)throw new DOMException('Preparação cancelada.','AbortError');
    const track=capture.getVideoTracks()[0];
    if(!track||track.readyState!=='live')throw Error('A tela foi desconectada. Selecione-a novamente.');
    try{await captureStep(track.applyConstraints(window.ClipaQuality?ClipaQuality.captureConstraints(track.getSettings(),fps):{resizeMode:'none',frameRate:{ideal:fps,max:fps}}),'Ajustar qualidade',captureStartup.signal,2500);}catch(e){if(captureStartup.signal.aborted)throw e;/* Optional settings: retain the source dimensions. */}
    track.contentHint='motion';
    const settings=track.getSettings();const captureBitrate=window.ClipaQuality?ClipaQuality.captureBitrate(settings,fps):Math.round(Math.min(80000000,Math.max(10000000,(settings.width||1920)*(settings.height||1080)*fps*.18)));
    $('captureStats').textContent=`Captura: ${settings.width||'?'} × ${settings.height||'?'} · até ${settings.frameRate?.toFixed(1)||fps} fps · vídeo solicitado ${(captureBitrate/1e6).toFixed(1)} Mb/s`;
    if($('editor').open)$('editor').close();
    chunks=[];let bytes=0;
    const mime=window.clipaCaptureMime319?.()||['video/webm;codecs=vp8,opus','video/webm',mp4Type()].filter(Boolean).find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error('Não foi encontrado um formato de gravação compatível neste aplicativo.');
    const nativeRecorder=await window.clipaMakeNativeRecorder320?.(capture,{fps,bitrate:captureBitrate});
    if(!nativeRecorder&&window.clipaDisk&&$('captureStorage316').value==='disk')diskRecorder=await clipaDisk.start(mime);
    recorder=nativeRecorder||new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:captureBitrate,audioBitsPerSecond:320000});
    recorder.ondataavailable=e=>{if(e.data.size){if(diskRecorder){diskRecorder.write(e.data);return;}chunks.push(e.data);bytes+=e.data.size;if(bytes>700*1024*1024){status('Limite de memória atingido. Finalizando para editar.');stopCapture();}}};
    recorder.onerror=e=>{captureLog('Gravador','error',e.error||new Error('Falha do MediaRecorder'));if(recorderStarted){status('A gravação encontrou um erro. Tentando recuperar o trecho.');stopCapture();}};
    recorder.onstop=async()=>{
      if(!recorderStarted)return;
      window.clipaCaptureHealth319?.stop();$('captureLiveAudio').hidden=true;
      const elapsed=(performance.now()-began)/1000;notifyCapture({recording:false,finished:true});clearInterval(tick);capture.clipaCleanup?.();capture.getTracks().forEach(t=>t.stop());
      $('record').disabled=false;$('stop').disabled=true;$('restore').disabled=false;$('file').disabled=false;
      let blob;try{blob=recorder.clipaFinish?await recorder.clipaFinish():diskRecorder?await diskRecorder.finish():new Blob(chunks,{type:recorder.mimeType});}catch(e){status('Falha ao finalizar: '+e.message+'. Verifique a pasta das gravações.');return;}chunks=[];
      if(!blob.size){status('Não houve vídeo gravado. Tente novamente.');return;}
      lastSaved={blob,duration:elapsed};
      try{const disk=window.clipaSourceAssets319?.get(blob);await storage('readwrite',disk?{nativeRecording:true,duration:elapsed,recordingName:disk.name}:lastSaved);$('restore').hidden=false;status('Gravação salva neste aplicativo. Pronta para editar.');}catch{status('Não foi possível salvar automaticamente. Baixe a gravação antes de fechar.');}
      try{await openEditor(blob,elapsed);}catch(e){rawBlob=blob;status(e.message+' Use Reabrir última gravação ou importe outro arquivo.');}
    };
    capture.getVideoTracks()[0].addEventListener('ended',stopCapture,{once:true});
    status('Tela conectada. Iniciando o gravador…');
    let onStarted,onStartError;
    const ready=new Promise((resolve,reject)=>{onStarted=resolve;onStartError=e=>reject(e.error||new Error('O gravador não iniciou.'));recorder.addEventListener('start',onStarted,{once:true});recorder.addEventListener('error',onStartError,{once:true});});
    try{began=performance.now();recorder.start(1000);await captureStep(ready,'Iniciar gravador',captureStartup.signal,8000);}
    finally{recorder.removeEventListener('start',onStarted);recorder.removeEventListener('error',onStartError);}
    recorderStarted=true;if(!recorder.native320)window.clipaCaptureHealth319?.start(capture);$('stop').textContent='■ Parar e editar';$('stop').disabled=false;notifyCapture({recording:true,returnTabId});
    const sources=capture.clipaSources;
    status(sources?.system&&sources?.microphone?'● Gravando tela + áudio do computador + seu microfone. Ctrl + Shift + 9 para parar.':capture.getAudioTracks().length?'● Gravando com '+(sources?.microphone?'seu microfone.':sources?.system?'áudio do computador.':'áudio.')+' Ctrl + Shift + 9 para parar.':'● Gravando sem áudio, conforme as opções escolhidas. Ctrl + Shift + 9 para parar.');
    $('captureLiveAudio').hidden=!capture.clipaLevels;
    $('captureSystemMeter').parentElement.hidden=!sources?.system;$('captureMicMeter').parentElement.hidden=!sources?.microphone;
    let micSignalAt=performance.now();const updateClock=()=>{$('clock').textContent=fmt((performance.now()-began)/1000);const levels=capture.clipaLevels?.()||{};$('captureSystemMeter').value=levels.system||0;$('captureMicMeter').value=levels.mic||0;if((levels.mic||0)>.005)micSignalAt=performance.now();$('captureMicMeter').title=sources?.microphone&&performance.now()-micSignalAt>8000?'Sem sinal recente. Fale para testar; confira o dispositivo e a entrada selecionada.':'Sinal do microfone';};
    updateClock();tick=setInterval(updateClock,150);
  }catch(e){
    recorderStarted=false;await recorder?.clipaAbort?.();await diskRecorder?.abort?.();clearInterval(tick);if(recorder&&recorder.state!=='inactive')recorder.stop();releaseCapture(capture);notifyCapture({recording:false});
    window.clipaCaptureHealth319?.stop();$('captureLiveAudio').hidden=true;$('record').disabled=false;$('stop').disabled=true;$('stop').textContent='■ Parar e editar';$('restore').disabled=false;$('file').disabled=false;
    status(e.name==='AbortError'?'Preparação cancelada. Clique em Iniciar gravação para tentar novamente.':'Não foi possível iniciar a gravação: '+e.name+' — '+e.message);
  }
  finally{capturePending=false;pickerRequest=null;captureStartup=null;}
}
$('record').onclick=()=>startCapture();
$('stop').onclick=stopCapture;
$('file').onchange=async e=>{if(isBusy())return;const file=e.target.files[0];if(!file)return;if(file.size>100_000_000_000){status('O limite por arquivo é 100 GB (100.000.000.000 bytes).');return;}try{await openEditor(file);}catch(err){status(err.message);}e.target.value='';};
async function openEditor(blob,knownDuration){
  video.pause();previewing=false;rawBlob=blob;cropHistory={};modeSettings={};shortInitialized=false;modeRegions={};composition=ClipComposition.defaults();if(typeof resetEnhancements==='function')resetEnhancements();$('compositionOrientation').value='wide';$('backgroundColor').value=composition.background;for(const [id,k] of [['bgX','x'],['bgY','y'],['bgW','w'],['bgH','h']])$(id).value=composition.backgroundCrop[k]*100;regionAssigned={cam1:false,content:false,cam2:false};cues=[];exclusions=[];placingCaption=false;renderCaptions();sourceInfo={fps:null,hasAudio:null};if(rawURL)URL.revokeObjectURL(rawURL);rawURL=URL.createObjectURL(blob);
  const ready=once(video,'loadedmetadata');video.src=rawURL;video.load();await ready;
  duration=video.duration;
  if(!Number.isFinite(duration)||duration<=0){
    try{const reader=await import('./vendor/exporter.js');duration=(await reader.inspectMedia(blob)).duration;}catch(e){if(knownDuration>0)duration=knownDuration;else throw e;}
  }
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Não foi possível descobrir a duração do arquivo.');
  if(!$('editor').open)$('editor').showModal();await seekTo(0);$('start').value='0';$('end').value=duration.toFixed(3);$('seek').max=duration;
  $('start').max=duration;$('end').max=duration;formatMode='wide';regionKey='content';
  regionStates={content:stateFor({x:0,y:0,w:1,h:1}),cam1:stateFor({x:0,y:0,w:1,h:1}),cam2:stateFor({x:0,y:0,w:1,h:1})};
  resetCrop();setFormat('wide');$('result').hidden=true;editStatus('Selecione o trecho e arraste na imagem para recortar.');
  $('export').disabled=false;if(!$('editor').open)$('editor').showModal();setView('source');updateFraming();updateTimeline();$('captionsPanel').hidden=true;$('exportNotice').hidden=true;
  const thisBlob=blob;
  let inspectTimer;await Promise.race([import('./vendor/exporter.js').then(m=>m.inspectMedia(blob)),new Promise((_,reject)=>{inspectTimer=setTimeout(()=>reject(Error('Leitura de metadados demorou.')),20000);})]).then(info=>{if(rawBlob!==thisBlob)return;sourceInfo=info;updateFraming();if(Number.isFinite(info.duration)&&info.duration>0){const oldDuration=duration;duration=info.duration;if(Math.abs(Number($('end').value)-oldDuration)<.1)$('end').value=duration.toFixed(3);$('seek').max=duration;$('start').max=duration;$('end').max=duration;updateTimeline();}$('sourceStats').textContent=`Fonte: ${video.videoWidth}×${video.videoHeight} · ${info.fps?info.fps.toFixed(1)+' fps':'fps desconhecido'} · ${info.hasAudio?'com áudio':'sem áudio'}`;}).catch(()=>{$('sourceStats').textContent='Fonte: '+video.videoWidth+'×'+video.videoHeight+' · fps não identificado';}).finally(()=>clearTimeout(inspectTimer));
}
async function seekTo(time){
 const target=ClipGeometry.clamp(time,0,Math.max(0,duration-.001));
 if(Math.abs(video.currentTime-target)<.004){drawPreview();return;}
 let timer;const ready=once(video,'seeked');video.currentTime=target;try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('A fonte não respondeu ao posicionamento. Tente reabrir o vídeo.')),15000);})]);}finally{clearTimeout(timer);}drawPreview();
}
function selectedRect(){return ClipGeometry.effective(crop,Number($('zoom').value),cropCenter);}
function outputFps(){const value=$('fps').value;if(value!=='auto')return Math.max(1,Math.min(120,Number(value)||30));const f=sourceInfo.fps||30;return f>90?120:f>45?60:f>26?30:f>23?24:Math.max(10,Math.round(f));}
function outputSize(){const res=$('resolution').value;if(res==='original')return ClipGeometry.output(res,video.videoWidth||1920,video.videoHeight||1080);const h=Number(res)>0?Number(res):1080,w=Math.round(h*16/9/2)*2;return formatMode==='short'||(formatMode==='composition'&&composition.orientation==='vertical')?{w:h,h:w}:{w,h};}
function outputLabel(){const size=outputSize();return $('resolution').value==='original'?`${size.w}×${size.h}`:`${$('resolution').value}p`;}
function resetCrop(){crop={x:0,y:0,w:1,h:1};cropCenter={x:0.5,y:0.5};$('zoom').value=1;updateFraming();}
function setView(){viewMode='preview';$('sourcePane').hidden=false;$('previewPane').hidden=false;drawPreview();}
function drawFrame(ctx,w,h,rect=selectedRect(),fit=$('fit').value,source=video,time=video.currentTime){
 const sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;
 ctx.fillStyle=formatMode==='composition'||backgroundImage?composition.background:'#000';ctx.fillRect(0,0,w,h);
 if(window.clipaLayouts321?.active)clipaLayouts321.background(ctx,w,h,source,time);
 if(backgroundImage)drawTransformedBackground(ctx,w,h);
 if(!sw||!sh||(source===video&&video.readyState<2))return;
 if(typeof requestPreviewMasks==='function'&&source===video)requestPreviewMasks(source,time);
 const slots=window.clipaLayouts321?.active?clipaLayouts321.slots(w,h,time):formatMode==='wide'?[{key:'content',x:0,y:0,w,h}]:formatMode==='composition'?compositionSlots(w,h,time):shortSlots(w,h);
 const order=window.clipaMedia?.sceneOrder?clipaMedia.sceneOrder(slots.map(s=>s.key)):slots.map(s=>'source:'+s.key);
 for(const id of order){
  if(id.startsWith('media:')){clipaMedia.drawImages(ctx,w,h,time,id.slice(6));continue;}
  const slot=slots.find(s=>s.key===id.slice(7));if(!slot)continue;
  const custom=window.clipaLayouts321?.active,customLayer=custom&&clipaLayouts321.layer(slot.key);if(customLayer&&!clipaLayouts321.live(customLayer,time))continue;
  ctx.save();if(custom)clipaLayouts321.transform(ctx,slot);
  if(!custom&&formatMode!=='composition'&&window.clipaMedia?.padding){const p=clipaMedia.padding;ctx.translate(w*p,h*p);ctx.scale(1-p*2,1-p*2);}
  if(typeof visualFilterCSS==='function')ctx.filter=visualFilterCSS();
  if(formatMode==='wide'&&!custom){
   let r=window.clipaTracking?.rect('wide','content',rect,time)||rect;r=window.clipaMotion?.rect('wide','content',r,time)||r;
   const dest=window.clipaMedia?.serialize().primary||{x:0,y:0,w:1,h:1},g=ClipGeometry.layout(r,sw,sh,w*dest.w,h*dest.h,fit);
   ctx.beginPath();ctx.rect(dest.x*w,dest.y*h,dest.w*w,dest.h*h);ctx.clip();if(!window.drawCameraInline319?.(ctx,source,g,dest.x*w,dest.y*h,time))ctx.drawImage(source,g.sx,g.sy,g.sw,g.sh,dest.x*w+g.dx,dest.y*h+g.dy,g.dw,g.dh);
  }else if(!regionAssigned[slot.key]){
   if(source===video){ctx.fillStyle='#292929';ctx.fillRect(slot.x,slot.y,slot.w,slot.h);ctx.fillStyle='#ddd';ctx.font=`600 ${Math.max(12,w*.025)}px sans-serif`;ctx.textAlign='center';ctx.fillText(regionLabel(slot.key),slot.x+slot.w/2,slot.y+slot.h/2);ctx.font=`${Math.max(10,w*.018)}px sans-serif`;ctx.fillText('Selecione esta área no original',slot.x+slot.w/2,slot.y+slot.h/2+w*.04);}
  }else{
   const f=custom?customLayer.fit:formatMode==='composition'?composition.layers[slot.key].fit:window.clipaLayout317?.fit(slot.key)||(slot.key==='content'&&$('contentContain').checked?'contain':'cover');
   const g=ClipGeometry.layout(regionRect(slot.key,time),sw,sh,slot.w,slot.h,f);
   if(custom)clipaLayouts321.path(ctx,slot);else{ctx.beginPath();ctx.rect(slot.x,slot.y,slot.w,slot.h);}ctx.clip();
   if(!(slot.key==='content'&&window.drawCameraInline319?.(ctx,source,g,slot.x,slot.y,time))&&!(typeof drawCameraCutout==='function'&&drawCameraCutout(ctx,source,slot,g,time)))ctx.drawImage(source,g.sx,g.sy,g.sw,g.sh,slot.x+g.dx,slot.y+g.dy,g.dw,g.dh);
  }
  if(custom)clipaLayouts321.border(ctx,slot,h);ctx.restore();
 }
 if(!window.clipaLayouts321?.active&&formatMode==='composition'&&composition.divider?.enabled){const d=composition.divider;ctx.fillStyle=d.color;ctx.fillRect(d.x*w-d.width*h/1080/2,0,d.width*h/1080,h);}
 if(typeof window.clipaDrawGrade==='function')window.clipaDrawGrade(ctx,w,h);
 CaptionTools.draw(ctx,w,h,time,cues,captionOptions(),exclusions);
 if(typeof drawTransitions==='function')drawTransitions(ctx,w,h,time);
}
function drawPreview(){
  if(viewMode!=='preview')return;
  const c=$('framing'),size=outputSize(),cap=window.clipaPreviewCap||1280,target=Math.min(size.w,Math.max(size.h>size.w?360:640,Math.round(c.clientWidth*Math.min(2,devicePixelRatio||1)))),dimensions=ClipaStudioCore.canvasSize(target,target*size.h/size.w,cap),w=dimensions.w,h=dimensions.h;
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  drawFrame(c.getContext('2d',{alpha:false}),w,h);updateCaptionMarker();if(formatMode==='composition')drawSelectionMap();
}
function animatePreview(){cancelAnimationFrame(previewFrame);if(previewing&&video.currentTime>=Number($('end').value)){previewing=false;video.pause();video.currentTime=Number($('end').value);}drawPreview();if(!video.paused&&viewMode==='preview'&&!exporting)previewFrame=requestAnimationFrame(animatePreview);}
video.addEventListener('play',()=>{updatePlayButton();animatePreview();});video.addEventListener('pause',()=>{updatePlayButton();drawPreview();});video.addEventListener('resize',()=>{updateFraming();});video.addEventListener('seeked',drawPreview);video.addEventListener('loadeddata',drawPreview);
function updateFraming(){
  commitRegion();
  const r=selectedRect(),c=$('crop'),size=outputSize(),sw=video.videoWidth||1920,sh=video.videoHeight||1080;
  c.hidden=false;c.style.setProperty('--region-color',formatMode!=='wide'?regionColors[regionKey]:'#eeeeee');c.querySelector('.cropLabel').textContent=formatMode!=='wide'?regionLabel(regionKey):'Área mantida';
  Object.assign(c.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});
  for(const [id,key,scale] of [['cropX','x',sw],['cropY','y',sh],['cropW','w',sw],['cropH','h',sh]])$(id).value=Math.round(crop[key]*scale);
  $('zoomValue').textContent=Number($('zoom').value).toFixed(2).replace('.',',')+'×';
  $('outputSpec').textContent=`MP4 · ${$('videoCodec').value==='av1'?'AV1':'H.264'} · ${size.w} × ${size.h} · ${outputFps()} fps · ${bitrate()/1000000} Mb/s`;
  $('export').textContent=`Exportar e salvar · ${outputLabel()} ${outputFps()} fps`;$('previewSize').textContent=`${size.w} × ${size.h}`;$('exportFooter').textContent='Finalizar';
  $('exportAdvice').textContent=`Fonte: ${sourceInfo.fps?.toFixed(1)||'?'} fps · saída: ${outputFps()} fps. `+(outputFps()>(sourceInfo.fps||30)+3?'Quadros serão repetidos. ':'')+($('quality').value==='max'?'Arquivo grande: alguns players ou discos podem engasgar.':'');
  $('cropInfo').textContent=`Gravação: ${sw} × ${sh} · Área selecionada com zoom: ${Math.round(r.w*sw)} × ${Math.round(r.h*sh)} → saída: ${size.w} × ${size.h}.`+(size.w>r.w*sw+1||size.h>r.h*sh+1?' A área será ampliada; não cria detalhes novos.':'');
  drawSelectionMap();refreshRegionButtons();$('undo').disabled=!(cropHistory[historyKey()]?.length)||isBusy();drawPreview();
}
$('sourceTab').onclick=()=>setSelectionTool('select');$('previewTab').onclick=()=>setSelectionTool('move');$('applyCrop').onclick=drawPreview;
$('reset').onclick=()=>{rememberCrop();if(formatMode!=='wide'||window.clipaLayouts321?.active)regionAssigned[regionKey]=true;resetCrop();};
$('resolution').onchange=$('fit').onchange=$('fps').onchange=$('quality').onchange=updateFraming;
$('zoom').onpointerdown=rememberCrop;$('zoom').oninput=()=>{updateFraming();};
$('zoomIn').onclick=()=>{rememberCrop();$('zoom').value=Math.min(4,Number($('zoom').value)+.1);updateFraming();};
$('zoomOut').onclick=()=>{rememberCrop();$('zoom').value=Math.max(1,Number($('zoom').value)-.1);updateFraming();};
function point(e){const r=$('stage').getBoundingClientRect();return {x:ClipGeometry.clamp((e.clientX-r.left)/r.width,0,1),y:ClipGeometry.clamp((e.clientY-r.top)/r.height,0,1)};}
$('stage').onpointerdown=e=>{
 if(isBusy()||e.button!==0)return;video.pause();previewing=false;rememberCrop();const p=point(e),handle=selectionTool==='move'?e.target.dataset.handle:null,rect=selectedRect();
 if(handle){crop=rect;cropCenter={x:rect.x+rect.w/2,y:rect.y+rect.h/2};$('zoom').value=1;dragging={type:'resize',start:p,anchor:{x:handle.includes('w')?rect.x+rect.w:rect.x,y:handle.includes('n')?rect.y+rect.h:rect.y}};}
 else dragging={type:selectionTool==='move'?'move':'select',start:p,base:{...crop}};
 $('stage').setPointerCapture(e.pointerId);
};
$('stage').onpointermove=e=>{
 if(!dragging)return;const p=point(e);dragging.moved=true;
 if(dragging.type==='move'){crop={...dragging.base,x:ClipGeometry.clamp(dragging.base.x+p.x-dragging.start.x,0,1-dragging.base.w),y:ClipGeometry.clamp(dragging.base.y+p.y-dragging.start.y,0,1-dragging.base.h)};}
 else{const next=ClipGeometry.selection(dragging.anchor||dragging.start,p,video.videoWidth,video.videoHeight,$('aspect').value);if(next.w<.002||next.h<.002)return;crop=next;$('zoom').value=1;}
 cropCenter={x:crop.x+crop.w/2,y:crop.y+crop.h/2};if(formatMode!=='wide'||window.clipaLayouts321?.active)regionAssigned[regionKey]=true;updateFraming();
};
function finishCrop(){const changed=dragging?.moved;dragging=null;if(changed)setSelectionTool('move');updateFraming();}
$('stage').onpointerup=finishCrop;$('stage').onpointercancel=finishCrop;
for(const id of ['cropX','cropY','cropW','cropH'])$(id).onchange=()=>{
 const sw=video.videoWidth,sh=video.videoHeight,vals=['cropX','cropY','cropW','cropH'].map(id=>Number($(id).value));if(!sw||vals.some(v=>!Number.isFinite(v))){updateFraming();return;}rememberCrop();
 const x=ClipGeometry.clamp(vals[0],0,sw-2),y=ClipGeometry.clamp(vals[1],0,sh-2);crop={x:x/sw,y:y/sh,w:ClipGeometry.clamp(vals[2],2,sw-x)/sw,h:ClipGeometry.clamp(vals[3],2,sh-y)/sh};cropCenter={x:crop.x+crop.w/2,y:crop.y+crop.h/2};$('zoom').value=1;if(formatMode!=='wide'||window.clipaLayouts321?.active)regionAssigned[regionKey]=true;updateFraming();
};
$('framing').onpointerdown=e=>{
 if(isBusy()||e.button!==0)return;if(placingCaption){moveCaption(e);panDrag={caption:true};$('framing').setPointerCapture(e.pointerId);return;}
 if(formatMode!=='wide'){const b=$('framing').getBoundingClientRect(),y=(e.clientY-b.top)/b.height,x=(e.clientX-b.left)/b.width;const slot=shortSlots(1,1).slice().reverse().find(s=>x>=s.x&&x<s.x+s.w&&y>=s.y&&y<s.y+s.h);if(slot&&slot.key!==regionKey)chooseRegion(slot.key);}
 rememberCrop();const r=selectedRect();panDrag={x:e.clientX,y:e.clientY,cx:r.x+r.w/2,cy:r.y+r.h/2,rect:r};$('framing').setPointerCapture(e.pointerId);
};
$('framing').onpointermove=e=>{if(!panDrag||isBusy())return;if(panDrag.caption){moveCaption(e);return;}
 const box=$('framing').getBoundingClientRect(),slot=formatMode!=='wide'?shortSlots(box.width,box.height).find(s=>s.key===regionKey):null,g=ClipGeometry.layout(panDrag.rect,video.videoWidth,video.videoHeight,slot?.w||box.width,slot?.h||box.height,formatMode==='composition'?composition.layers[regionKey].fit:formatMode==='short'?(window.clipaLayout317?.fit(regionKey)||(regionKey==='content'&&$('contentContain').checked?'contain':'cover')):$('fit').value);
 cropCenter={x:panDrag.cx-(e.clientX-panDrag.x)/g.dw*panDrag.rect.w,y:panDrag.cy-(e.clientY-panDrag.y)/g.dh*panDrag.rect.h};const r=selectedRect();cropCenter={x:r.x+r.w/2,y:r.y+r.h/2};updateFraming();};
$('framing').onpointerup=$('framing').onpointercancel=()=>{panDrag=null;};
$('framing').addEventListener('wheel',e=>{e.preventDefault();if(isBusy())return;$('zoom').value=ClipGeometry.clamp(Number($('zoom').value)+(e.deltaY<0?.1:-.1),1,4);updateFraming();},{passive:false});
function range(){const start=Number($('start').value),end=Number($('end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+0.05||end-start<0.1-1e-7)throw new Error('Escolha início e fim dentro do vídeo, com pelo menos 0,1 segundo de diferença.');return {start,end:Math.min(end,duration)};}
function updateTimeline(){
 $('totalTime').textContent='/ '+precise(duration);$('clipDuration').textContent=`Corte: ${Math.max(0,Number($('end').value)-Number($('start').value)).toFixed(2)} s`;
 $('seek').style.setProperty('--cut-start',Number($('start').value)/duration*100+'%');$('seek').style.setProperty('--cut-end',Number($('end').value)/duration*100+'%');
}
function updatePlayButton(){$('play').textContent=video.paused?'▶ Reproduzir':'Ⅱ Pausar';$('position').textContent=precise(video.currentTime);}
$('markStart').onclick=()=>{$('start').value=video.currentTime.toFixed(2);updateTimeline();};$('markEnd').onclick=()=>{$('end').value=video.currentTime.toFixed(2);updateTimeline();};
$('start').oninput=$('end').oninput=updateTimeline;
$('seek').oninput=()=>{previewing=false;video.currentTime=Number($('seek').value);$('position').textContent=precise(video.currentTime);};
video.ontimeupdate=()=>{$('position').textContent=precise(video.currentTime);$('seek').value=video.currentTime;if(previewing&&video.currentTime>=Number($('end').value)){previewing=false;video.pause();video.currentTime=Number($('end').value);}drawPreview();};
async function setupAudio(){if(!audioContext){audioContext=new AudioContext();audioSource=audioContext.createMediaElementSource(video);monitor=audioContext.createGain();audioSource.connect(monitor);monitor.connect(audioContext.destination);}await audioContext.resume();}
$('play').onclick=async()=>{try{if(!video.paused){video.pause();return;}await setupAudio();monitor.gain.value=1;if(video.ended||video.currentTime>=duration-.02)await seekTo(0);await video.play();}catch(e){editStatus(e.message);}};
$('previewCut').onclick=async()=>{try{const r=range();video.pause();await setupAudio();await seekTo(r.start);previewing=true;await video.play();}catch(e){editStatus(e.message);}};
async function jump(time){previewing=false;try{await seekTo(time);}catch(e){editStatus(e.message);}}
$('back5').onclick=()=>jump(video.currentTime-5);$('forward5').onclick=()=>jump(video.currentTime+5);$('jumpTo').onclick=()=>jump(Number($('jumpTime').value));
$('editor').addEventListener('keydown',e=>{if(isBusy()||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();$('play').click();}});
function closeEditor(){if(isBusy())return;video.pause();cancelAnimationFrame(previewFrame);$('output').pause();$('editor').close();}
$('close').onclick=closeEditor;$('editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
function bitrate(){const pixels=outputSize().w*outputSize().h,base=$('quality').value==='max'?50000000:$('quality').value==='high'?24000000:12000000;return Math.round(Math.min(120000000,Math.max(4000000,base*pixels/(1920*1080)*outputFps()/60))/100000)*100000;}
function setLocked(value){
 for(const el of $('editor').querySelectorAll('input,select,textarea,button')){
   if(['cancel','cancelAI','cancelAIInline','footerCancel','processCancel312'].includes(el.id)||el.dataset.tool)continue;
   if(value){if(!('wasDisabled' in el.dataset))el.dataset.wasDisabled=String(el.disabled);el.disabled=true;}
   else{el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;}
 }
 for(const id of ['record','restore','file','captureFps'])$(id).disabled=value;
}
function busy(value){exporting=value;notifyDesktopState();setLocked(value);if(!value){refreshRegionButtons();$('undo').disabled=!(cropHistory[historyKey()]?.length);}$('cancel').hidden=!value;$('footerCancel').hidden=!value;$('progress').hidden=!value;}
$('cancel').onclick=()=>{cancelExport=true;};
$('export').onclick=async()=>{
 if(isBusy())return;if(!window.clipaDesktop?.io&&(window.clipaTimeline?.plan().duration??(Number($('end').value)-Number($('start').value))/clipSpeed())*bitrate()/8>(window.clipaDesktop?900:150)*1024*1024){editStatus('Este corte excede o limite de saída em memória ('+(window.clipaDesktop?900:150)+' MB). Reduza a duração ou o preset e exporte trechos separadamente.');return;}cancelExport=false;window.clipaLastExportError=null;
 try{
  const {start,end}=range();if(isBusy())return;if(formatMode!=='wide'){const missing=shortSlots(1,1).filter(s=>!regionAssigned[s.key]);if(missing.length)throw new Error('Selecione no original: '+missing.map(s=>regionLabel(s.key)).join(', ')+'.');}
  $('exportNotice').classList.remove('error');$('exportTitle').textContent='Gerando MP4';$('downloadNow').hidden=true;placingCaption=false;$('placeCaption').setAttribute('aria-pressed','false');commitRegion();setView('preview');cancelAnimationFrame(previewFrame);busy(true);cancelExport=false;previewing=false;video.pause();$('output').pause();$('result').hidden=!resultBlob;
  const {exportClip}=await import('./vendor/exporter.js'),size=outputSize(),label=outputLabel(),fps=outputFps(),rect=selectedRect(),fit=$('fit').value;
  const result=await exportClip({blob:rawBlob,width:size.w,height:size.h,fps,bitrate:bitrate(),start,end,speed:clipSpeed(),removed:window.clipaTimeline?.serialize().removed||[],hardwareAcceleration:$('hardware').value,codec:$('videoCodec').value,engine:$('exportEngine')?.value||'auto',audioEdit:window.clipaAudioEdit||{},cancelled:()=>cancelExport,
    render:async(ctx,w,h,source,time)=>{if(typeof prepareCameraMasks==='function')await prepareCameraMasks(source,time,true);drawFrame(ctx,w,h,rect,fit,source,time);if(typeof showRenderFrame==='function')showRenderFrame(ctx.canvas,time);},
    progress:(percent,message)=>{$('progress').value=percent;editStatus(message);}});
  if(resultURL)URL.revokeObjectURL(resultURL);resultBlob=result.blob;resultURL=URL.createObjectURL(resultBlob);
  $('output').src=resultURL;$('download').href=resultURL;$('download').download=`clipa-${formatMode}-${new Date().toISOString().replace(/[:.]/g,'-')}-${label}-${fps}fps.mp4`;$('download').textContent=`Salvar MP4 ${label} · ${fps} fps`;
  $('result').hidden=false;$('exportTitle').textContent='MP4 gerado';$('resultMeta').textContent=`${size.w} × ${size.h} · ${fps} fps · ${(resultBlob.size/1048576).toFixed(1)} MB`;$('downloadNow').hidden=false;$('footerDownload').hidden=false;editStatus(`Pronto: ${(resultBlob.size/1048576).toFixed(1)} MB · ${label} · ${fps} fps · ${result.frames} quadros · ${result.engine||'Nativo'} · áudio ${result.audioCodec}${result.audioCodec==='opus'?' (alguns apps podem não aceitar)':''}.`);$('result').scrollIntoView({behavior:'smooth'});$('downloadStatus').textContent='Toque em Salvar MP4 ou Compartilhar arquivo para guardar o resultado antes de fechar.';
 }catch(e){$('exportNotice').classList.add('error');$('exportTitle').textContent=cancelExport?'Exportação cancelada':'Não foi possível exportar';window.clipaLastExportError=e.message||String(e);$('exportNotice').scrollIntoView({behavior:'smooth',block:'center'});editStatus(cancelExport?'Sua gravação foi preservada. Você pode tentar novamente.':(e.message||String(e)));$('downloadNow').hidden=!resultBlob;}
 finally{if(exporting)busy(false);drawPreview();}
};
$('raw').onclick=()=>{if(!rawBlob)return;const a=document.createElement('a');a.href=rawURL;a.download='clipa-original.'+(rawBlob.type.includes('mp4')?'mp4':rawBlob.type.includes('webm')?'webm':'video');a.click();};
$('share').onclick=async()=>{
  const file=new File([resultBlob],$('download').download,{type:'video/mp4'});
  if(!navigator.canShare?.({files:[file]})){editStatus('Compartilhamento do sistema indisponível. Baixe o MP4 e anexe ao Discord ou envie ao Drive para gerar um link.');return;}
  try{await navigator.share({files:[file],title:'Meu clipe'});}catch(e){if(e.name!=='AbortError')editStatus('Não foi possível compartilhar. Use Salvar MP4.');}
};
window.addEventListener('beforeunload',e=>{if(isBusy()||recorder?.state==='recording'){e.preventDefault();e.returnValue='';}});

function shortSlots(w,h){
 if(window.clipaLayouts321?.active)return clipaLayouts321.slots(w,h);
 if(formatMode==='composition')return compositionSlots(w,h,video.currentTime);
 if(window.clipaLayout317)return ClipaLayoutCore.slots(w,h,Number($('cameraCount').value),clipaLayout317.serialize());
 const count=Number($('cameraCount').value),fraction=Number($('cameraHeight').value)/100,camH=h*fraction;
 if(count===0)return [{key:'content',x:0,y:0,w,h}];
 if(count===1)return [{key:'cam1',x:0,y:0,w,h:camH},{key:'content',x:0,y:camH,w,h:h-camH}];
 return [{key:'cam1',x:0,y:0,w,h:camH},{key:'content',x:0,y:camH,w,h:h-2*camH},{key:'cam2',x:0,y:h-camH,w,h:camH}];
}
function saveModeSettings(){const values={};for(const id of modeFields)values[id]=$(id).type==='checkbox'?$(id).checked:$(id).value;modeSettings[formatMode]=values;}
function setFormat(mode){
 commitRegion();saveModeSettings();if(formatMode!=='wide'||window.clipaLayouts321?.active)modeRegions[formatMode]={states:regionStates,assigned:regionAssigned};formatMode=mode;
 if(!modeSettings[mode])modeSettings[mode]={...modeSettings.wide,resolution:'720',aspect:'free',captionY:'78'};
 for(const [id,value] of Object.entries(modeSettings[mode])){if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value;}
 if(mode!=='wide'||window.clipaLayouts321?.activeFor(mode)){
  if(!modeRegions[mode])modeRegions[mode]={states:{content:stateFor({x:0,y:0,w:1,h:1}),cam1:stateFor({x:0,y:0,w:1,h:1}),cam2:stateFor({x:0,y:0,w:1,h:1})},assigned:{content:false,cam1:false,cam2:false}};
  regionStates=modeRegions[mode].states;regionAssigned=modeRegions[mode].assigned;
  if($('resolution').value==='original')$('resolution').value='1080';regionKey=mode==='composition'?'content':$('regionTarget').value;loadState(regionStates[regionKey]);
 }else if(wideState)loadState(wideState);
 const originalOption=$('resolution').querySelector('[value=original]');if(originalOption)originalOption.disabled=mode!=='wide';
 $('shortTools').hidden=mode!=='short';$('regionButtons').hidden=mode!=='short';$('compositionTools').hidden=mode!=='composition';$('compositionBar').hidden=mode!=='composition';
 $('editor').classList.toggle('short-mode',mode==='short'||(mode==='composition'&&composition.orientation==='vertical'));
 $('previewTitle').textContent=mode==='short'?'Resultado vertical 9:16':mode==='composition'?'Vídeo + câmera + fundo':'Resultado horizontal';
 for(const [id,key] of [['wideTab','wide'],['shortTab','short'],['compositionTab','composition']])$(id).setAttribute('aria-pressed',String(mode===key));
 $('regionBadge').textContent=mode==='wide'?'Seleção horizontal':regionLabel(regionKey);
 if(mode==='composition')selectComposition('content');refreshRegionButtons();updateFraming();drawPreview();
}
$('wideTab').onclick=()=>setFormat('wide');$('shortTab').onclick=()=>setFormat('short');
function chooseRegion(key){if(formatMode==='composition'&&!composition.layers[key])return;commitRegion();regionKey=key;$('regionTarget').value=key;loadState(regionStates[key]);$('regionBadge').textContent=regionLabel(key);if(formatMode==='composition'){compositionSelection=key;$('backgroundTools').hidden=true;$('layerTools').hidden=false;for(const b of $('compositionBar').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.composition===key));syncLayerControls();}refreshRegionButtons();updateFraming();}
$('regionTarget').onchange=()=>chooseRegion($('regionTarget').value);
for(const b of $('regionButtons').querySelectorAll('button'))b.onclick=()=>chooseRegion(b.dataset.region);
$('cameraCount').onchange=()=>{const count=Number($('cameraCount').value);$('regionTarget').querySelector('[value=cam2]').disabled=count<2;$('regionTarget').querySelector('[value=cam1]').disabled=count<1;if((regionKey==='cam2'&&count<2)||(regionKey==='cam1'&&count<1)){$('regionTarget').value='content';$('regionTarget').onchange();}refreshRegionButtons();drawSelectionMap();drawPreview();};
$('cameraHeight').oninput=()=>{$('cameraHeightValue').textContent=$('cameraHeight').value+'%';drawSelectionMap();drawPreview();};$('contentContain').onchange=drawPreview;
function moveCaption(e){const r=$('framing').getBoundingClientRect();$('captionX').value=Math.round(ClipGeometry.clamp((e.clientX-r.left)/r.width*100,10,90));$('captionY').value=Math.round(ClipGeometry.clamp((e.clientY-r.top)/r.height*100,5,95));drawPreview();}
function togglePlacement(){placingCaption=!placingCaption;$('placeCaption').setAttribute('aria-pressed',String(placingCaption));setView('preview');$('framing').scrollIntoView({behavior:'smooth',block:'center'});drawPreview();}
$('placeCaption').onclick=$('placeCaption2').onclick=togglePlacement;
for(const id of ['captionsEnabled','captionSize','captionX','captionY','captionStyle','captionColor','captionOutline','captionHighlight','captionBoxColor'])$(id).oninput=()=>{if(id==='captionX')$('captionX').value=ClipGeometry.clamp(Number($('captionX').value),10,90);if(id==='captionY')$('captionY').value=ClipGeometry.clamp(Number($('captionY').value),5,95);drawPreview();};
$('openCaptions').onclick=()=>{$('captionsPanel').hidden=false;$('captionsPanel').scrollIntoView({behavior:'smooth',block:'start'});};$('closeCaptions').onclick=()=>{$('captionsPanel').hidden=true;$('editor').querySelector('.workspace').scrollIntoView({behavior:'smooth',block:'start'});};
function renderCaptions(){
 const list=$('captionList');list.replaceChildren();
 if(!cues.length){const p=document.createElement('p');p.className='hint';p.textContent='Gere as legendas com IA ou importe um SRT. Você também pode adicionar uma legenda manual.';list.append(p);}
 cues.forEach((cue,index)=>{
  const row=document.createElement('div');row.className='captionRow'+(cue.flagged||cue.review?' flagged':'');
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=cue.enabled;enabled.setAttribute('aria-label','Incluir legenda '+(index+1));enabled.onchange=()=>{cue.enabled=enabled.checked;drawPreview();};
  const start=document.createElement('input'),end=document.createElement('input');
  for(const [el,key] of [[start,'start'],[end,'end']]){el.type='number';el.min=0;el.max=duration;el.step=.01;el.value=cue[key].toFixed(2);el.setAttribute('aria-label',key==='start'?'Início da legenda em segundos':'Fim da legenda em segundos');el.onchange=()=>{const n=Number(el.value);if(!Number.isFinite(n)||n<0||n>duration||(key==='start'?n>=cue.end:n<=cue.start)){el.value=cue[key].toFixed(2);return;}cue[key]=n;delete cue.words;drawPreview();window.dispatchEvent(new CustomEvent('clipa-captions'));};}
  const text=document.createElement('textarea');text.value=cue.text;text.placeholder='Digite a legenda';text.setAttribute('aria-label','Texto da legenda');text.oninput=()=>{cue.text=text.value;delete cue.words;cue.review=false;drawPreview();window.dispatchEvent(new CustomEvent('clipa-captions'));};if(cue.flagged)text.title='Possível alerta/donate: revise antes de incluir.';else if(cue.review)text.title='A IA encontrou repetição incomum. Revise este texto antes de exportar.';
  const jump=document.createElement('button');jump.textContent='Ver';jump.onclick=async()=>{video.pause();await seekTo(cue.start+.01);setView('preview');drawPreview();$('framing').scrollIntoView({behavior:'smooth',block:'center'});};
  const remove=document.createElement('button');remove.textContent='Excluir';remove.title='Remover somente esta legenda';remove.onclick=()=>{cues.splice(index,1);renderCaptions();drawPreview();};row.append(enabled,start,end,text,jump,remove);for(const control of row.querySelectorAll('input,button,textarea'))control.disabled=isBusy();list.append(row);
 });
 window.dispatchEvent(new CustomEvent('clipa-captions'));
 $('excludedInfo').textContent=exclusions.length?'Intervalos sem legenda: '+exclusions.map(e=>`${e.start.toFixed(2)}–${e.end.toFixed(2)} s`).join(' · '):'Nenhum intervalo excluído.';
}
$('addCaption').onclick=()=>{const start=Math.min(video.currentTime,Math.max(0,duration-.1));cues.push({start,end:Math.min(duration,start+2),text:'',enabled:true,flagged:false});renderCaptions();};
$('markExcludeStart').onclick=()=>{$('excludeStart').value=video.currentTime.toFixed(2);};$('markExcludeEnd').onclick=()=>{$('excludeEnd').value=video.currentTime.toFixed(2);};
$('excludeCurrent').onclick=()=>{const start=Number($('excludeStart').value),end=Number($('excludeEnd').value);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration){$('excludedInfo').textContent='Informe um intervalo de donate válido dentro da gravação.';return;}exclusions.push({start,end});renderCaptions();drawPreview();};
$('clearExclusions').onclick=()=>{exclusions=[];renderCaptions();drawPreview();};
$('downloadSrt').onclick=()=>{try{const r=range(),text=CaptionTools.toSrt(cues.map(c=>({...c,start:c.start/clipSpeed(),end:c.end/clipSpeed(),words:c.words?.map(w=>({...w,start:w.start/clipSpeed(),end:w.end/clipSpeed()}))})),r.start/clipSpeed(),r.end/clipSpeed(),exclusions.map(c=>({...c,start:c.start/clipSpeed(),end:c.end/clipSpeed()}))),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='clipa-legendas.srt';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){editStatus(e.message);}};
$('importSrt').onchange=async e=>{const file=e.target.files[0];if(!file)return;const imported=CaptionTools.parseSrt(await file.text(),Number($('start').value));if(!imported.length){$('aiStatus').textContent='SRT inválido ou sem legendas.';return;}cues=imported.filter(c=>c.start<duration).map(c=>({...c,end:Math.min(c.end,duration)}));renderCaptions();drawPreview();$('aiStatus').textContent='SRT importado: tempos relativos ao início do trecho selecionado.';e.target.value='';};
function aiLock(value){queueMicrotask(notifyDesktopState);
 aiWorking=value;setLocked(value);$('cancelAI').hidden=!value;$('cancelAIInline').hidden=!value;$('footerCancel').hidden=!value;
 clearInterval(aiTimer);
 if(value){aiStarted=performance.now();$('aiElapsed').textContent='Análise iniciada.';aiTimer=setInterval(()=>{$('aiElapsed').textContent='Tempo de análise: '+fmt((performance.now()-aiStarted)/1000)+' · o processamento pode levar alguns minutos.';$('footerStatus').textContent=detectorBusy?$('faceStatus').textContent:$('aiStatus').textContent;},1000);}
 else{$('aiElapsed').textContent='';refreshRegionButtons();$('footerStatus').textContent=$('aiStatus').textContent;}
}
$('cancelAI').onclick=()=>{aiCancel=true;aiJob++;aiWorker?.terminate();aiWorker=null;if(!detectorBusy&&aiWorking)aiLock(false);$('aiStatus').textContent='Análise cancelada. Você pode tentar novamente.';};
async function audioForAI(start,end){const {extractAudio}=await import('./vendor/media-analysis.js');return extractAudio(rawBlob,start,end,()=>aiCancel);}
$('transcribe').onclick=async()=>{
 if(isBusy())return;let job;
 try{
  const r=range();if(sourceInfo.hasAudio===false)throw new Error('Esta gravação não contém trilha de áudio.');
  if(cues.length&&!confirm('Substituir as legendas atuais pela nova transcrição?'))return;
  video.pause();aiCancel=false;job=++aiJob;aiLock(true);$('aiStatus').textContent='Preparando o áudio do trecho…';
  const audio=await audioForAI(r.start,r.end);if(aiCancel||job!==aiJob)return;
  const speechWindows=CaptionTools.audibleWindows(audio,16000,r.start);
  let energy=0;for(let i=0;i<audio.length;i+=16)energy+=audio[i]*audio[i];if(energy/Math.max(1,audio.length/16)<0.0000001)throw new Error('O trecho está sem áudio audível. Não foram criadas legendas.');
  if(!aiWorker)aiWorker=new Worker(new URL('vendor/ai-worker.js',location.href),{type:'module'});
  aiWorker.onerror=e=>{if(job!==aiJob)return;$('aiStatus').textContent='A IA não iniciou: '+(e.message||'verifique os arquivos da extensão e recarregue.');aiLock(false);aiWorker?.terminate();aiWorker=null;};
  aiWorker.onmessage=({data})=>{
   if(data.id!==aiJob)return;
   if(data.type==='progress')$('aiStatus').textContent=`Preparando modelo local · ${data.file||data.status||''} ${Number.isFinite(data.progress)?Math.round(data.progress)+'%':''}`;
   if(data.type==='status')$('aiStatus').textContent=data.text;
   if(data.type==='done'){
    cues=CaptionTools.filterSilence(CaptionTools.fromWhisper(data.result,r.start,r.end,$('filterAlerts').checked),speechWindows);renderCaptions();drawPreview();
    $('aiStatus').textContent=`${cues.length} legendas geradas. ${cues.filter(c=>c.flagged).length} marcadas como possíveis alertas. Revise texto, tempos e vozes de donate antes de exportar.`;aiLock(false);
   }
   if(data.type==='error'){$('aiStatus').textContent='Não foi possível transcrever: '+data.message+' Verifique a conexão para baixar o modelo; tente Tiny se faltar memória.';aiLock(false);}
  };
  aiWorker.postMessage({id:job,audio,model:$('asrModel').value,language:$('asrLanguage').value},[audio.buffer]);
 }catch(e){$('aiStatus').textContent=e.message;if(job===aiJob&&aiWorking)aiLock(false);}
};
$('detectCameras').onclick=async()=>{
 if(isBusy())return;const originalTime=video.currentTime;let workStarted=false;
 try{
  const r=window.clipaAnalysis?window.clipaAnalysis.range():range(),samples=window.clipaAnalysis?window.clipaAnalysis.profile().faces:5;video.pause();aiCancel=false;aiLock(true);detectorBusy=true;workStarted=true;$('faceStatus').textContent='Comparando rostos em '+samples+' quadros da seleção…';
  const {detectFaces}=await import('./vendor/face-ai.js'),canvas=document.createElement('canvas');const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);const ctx=canvas.getContext('2d');const clusters=[];
  for(let i=0;i<samples;i++){
   if(aiCancel)break;await seekTo(r.start+(r.end-r.start)*((i+.5)/samples));ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const found=await detectFaces(canvas);for(const f of found){const b=f.box,x=(b.originX+b.width/2)/canvas.width,y=(b.originY+b.height/2)/canvas.height,w=b.width/canvas.width,h=b.height/canvas.height;
    if(w>.5||h>.65)continue;
    let match=clusters.find(c=>Math.hypot(c.x-x,c.y-y)<.09);if(match){const n=match.n;match.x=(match.x*n+x)/(n+1);match.y=(match.y*n+y)/(n+1);match.w=(match.w*n+w)/(n+1);match.h=(match.h*n+h)/(n+1);match.n++;}else clusters.push({x,y,w,h,n:1});
   }
   $('faceStatus').textContent=`Analisando quadro ${i+1}/${samples}…`;
  }
  if(aiCancel){$('faceStatus').textContent='Análise de câmeras cancelada.';return;}
  const consistent=clusters.filter(c=>c.n>=Math.max(2,Math.ceil(samples*.25))),compact=consistent.filter(c=>c.w<.22&&c.h<.30);
  const stable=(compact.length?compact:consistent).sort((a,b)=>(b.n+(b.x<.25||b.x>.75?4:0)+(b.y>.55?1:0))-(a.n+(a.x<.25||a.x>.75?4:0)+(a.y>.55?1:0))).slice(0,2);
  if(!stable.length){$('faceStatus').textContent='Nenhuma câmera consistente encontrada. Selecione Câmera 1/2 e desenhe cada área manualmente.';return;}
  stable.forEach((c,i)=>{const w=Math.min(1,c.w*2.8),h=Math.min(1,Math.max(c.h*2.5,w*video.videoWidth/video.videoHeight*9/16));const rect={x:ClipGeometry.clamp(c.x-w/2,0,1-w),y:ClipGeometry.clamp(c.y-h*.38,0,1-h),w,h};regionStates['cam'+(i+1)]=stateFor(rect);regionAssigned['cam'+(i+1)]=true;});
  // Suggest a content area only when the detected webcams share an outer strip.
  const areas=stable.map((_,i)=>regionStates['cam'+(i+1)].crop),base=regionStates.content.crop;
  if(areas.every(a=>a.y>.5)){const bottom=Math.min(...areas.map(a=>a.y));if(bottom-base.y>.35)regionStates.content=stateFor({...base,h:Math.min(base.h,bottom-base.y)});}
  else if(areas.every(a=>a.y+a.h<.5)){const top=Math.max(...areas.map(a=>a.y+a.h));if(base.y+base.h-top>.35)regionStates.content=stateFor({...base,y:Math.max(base.y,top),h:base.y+base.h-Math.max(base.y,top)});}
  regionAssigned.content=true;$('cameraCount').value=String(stable.length);regionKey='content';$('regionTarget').value='content';loadState(regionStates.content);updateFraming();setView('preview');
  $('faceStatus').textContent=`${stable.length} câmera(s) sugerida(s). Confira o conteúdo e ajuste os retângulos de cada câmera; as sugestões são estáticas, sem rastreamento ao longo do vídeo.`;
 }catch(e){$('faceStatus').textContent='Não foi possível analisar: '+e.message+' Você pode selecionar as áreas manualmente.';}
 finally{if(workStarted){await seekTo(originalTime).catch(()=>{});detectorBusy=false;aiLock(false);$('regionTarget').querySelector('[value=cam1]').disabled=Number($('cameraCount').value)<1;$('regionTarget').querySelector('[value=cam2]').disabled=Number($('cameraCount').value)<2;drawPreview();}}
};

function setSelectionTool(tool){selectionTool=tool;$('sourceTab').setAttribute('aria-pressed',String(tool==='select'));$('previewTab').setAttribute('aria-pressed',String(tool==='move'));$('stage').style.cursor=tool==='move'?'move':'crosshair';$('stage').dataset.selectionTool=tool;window.dispatchEvent(new Event('clipa-selection-tool'));}
function historyKey(){return formatMode+'-'+(formatMode==='wide'?'full':regionKey);}
function rememberCrop(){const key=historyKey();(cropHistory[key]||=[]).push({state:cropState(),assigned:regionAssigned[regionKey]});if(cropHistory[key].length>30)cropHistory[key].shift();$('undo').disabled=false;}
$('undo').onclick=()=>{const h=cropHistory[historyKey()]?.pop();if(!h)return;loadState(h.state);if(formatMode!=='wide')regionAssigned[regionKey]=h.assigned;updateFraming();};
function refreshRegionButtons(){
 const slots=shortSlots(1,1),keys=slots.map(s=>s.key);
 for(const button of $('regionButtons').querySelectorAll('button')){const key=button.dataset.region;button.hidden=!keys.includes(key);button.style.setProperty('--region-color',regionColors[key]);button.setAttribute('aria-pressed',String(regionKey===key));button.querySelector('span').textContent=regionLabel(key).replace(/^\d · /,'');button.querySelector('small').textContent=regionAssigned[key]?'Área selecionada ✓':'Defina no original';}
 for(const option of $('regionTarget').options)option.disabled=!keys.includes(option.value);
}
function drawSelectionMap(){
 const other=$('otherRegions'),markers=$('destinationMarkers');other.replaceChildren();markers.replaceChildren();if(formatMode==='wide'&&!window.clipaLayouts321?.active)return;
 for(const slot of shortSlots(1,1)){
  if(slot.key!==regionKey&&regionAssigned[slot.key]){const r=regionRect(slot.key),el=document.createElement('div');el.className='regionOverlay';Object.assign(el.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});el.style.setProperty('--region-color',regionColors[slot.key]);const tag=document.createElement('span');tag.textContent=regionLabel(slot.key);el.append(tag);other.append(el);}
  const dest=document.createElement('div');dest.className='destMarker'+(slot.key===regionKey?' active':'');dest.style.left=slot.x*100+'%';dest.style.width=slot.w*100+'%';dest.style.top=slot.y*100+'%';dest.style.height=slot.h*100+'%';dest.style.setProperty('--region-color',regionColors[slot.key]);const tag=document.createElement('span');tag.textContent=regionLabel(slot.key);dest.append(tag);markers.append(dest);
 }
}
function updateCaptionMarker(){const marker=$('captionMarker');marker.hidden=!placingCaption;marker.style.left=$('captionX').value+'%';marker.style.top=$('captionY').value+'%';$('previewHint').textContent=placingCaption?'Clique ou arraste o marcador para posicionar a legenda. Em pausas, nenhum texto é inventado.':'A prévia acompanha o original. Com zoom, arraste para reposicionar a área ativa.';}
async function downloadResult(saveAs=false){
 if(!resultBlob||!resultURL)return;
 $('downloadStatus').textContent='Iniciando download…';
 try{
  if(ext?.downloads?.download){lastDownloadId=await ext.downloads.download({url:resultURL,filename:$('download').download,saveAs});$('downloadStatus').textContent='Download enviado ao Brave. Se cancelar, use Salvar MP4 novamente.';}
  else{const a=document.createElement('a');a.href=resultURL;a.download=$('download').download;document.body.append(a);a.click();a.remove();$('downloadStatus').textContent='Escolha o destino na janela de salvamento. O arquivo continua disponível.';}
 }catch(e){$('downloadStatus').textContent='Não foi possível iniciar o salvamento: '+(e.message||String(e))+'. O MP4 está pronto; tente Salvar MP4 novamente.';}
}
$('download').onclick=e=>{e.preventDefault();downloadResult(false);};$('downloadNow').onclick=()=>downloadResult(false);$('saveAs').onclick=()=>downloadResult(true);
if(ext?.downloads?.onChanged)ext.downloads.onChanged.addListener(change=>{if(change.id!==lastDownloadId)return;if(change.state?.current==='complete')$('downloadStatus').textContent='Download concluído. Confira a pasta de downloads do Brave.';if(change.state?.current==='interrupted')$('downloadStatus').textContent='Download interrompido ('+(change.error?.current||'cancelado pelo navegador')+'). O MP4 permanece pronto; clique para baixar novamente.';});

$('exportFooter').onclick=()=> $('export').click();$('footerDownload').onclick=()=>downloadResult(false);$('footerCancel').onclick=()=>{if(exporting)$('cancel').click();else if(aiWorking)$('cancelAI').click();};$('cancelAIInline').onclick=()=> $('cancelAI').click();$('restartAI').onclick=()=>{aiWorker?.terminate();aiWorker=null;aiJob++;$('aiStatus').textContent='IA reiniciada. Clique em Transcrever para tentar novamente. As legendas existentes foram mantidas.';};

function notifyCapture(message){if(window.clipaDesktop){window.clipaDesktop.state({recording:message.recording===true,busy:isBusy()||!!window.clipaImporting,finished:message.finished===true}).catch(()=>{});return;}if(ext?.runtime?.id)ext.runtime.sendMessage({type:'capture-state',...message}).catch(()=>{});}
function shortcutStream(fps){
 return new Promise((resolve,reject)=>{
  if(!ext?.desktopCapture)return reject(new Error('Neste navegador, clique em Iniciar gravação para escolher a tela.'));
  pickerRequest=ext.desktopCapture.chooseDesktopMedia(['screen','window','tab','audio'],async(id,options)=>{
   pickerRequest=null;
   if(!id)return reject(new DOMException('Captura cancelada','AbortError'));
   try{resolve(await navigator.mediaDevices.getUserMedia({
    video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:id,maxWidth:7680,maxHeight:4320,maxFrameRate:fps}},
    audio:options?.canRequestAudioTrack?{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:id},echoCancellation:false,noiseSuppression:false,autoGainControl:false}:false
   }));}catch(e){reject(e);}
  });
 });
}
async function takeShortcut(){
 if(!ext?.runtime?.id)return;
 const request=await ext.runtime.sendMessage({type:'take-shortcut'}).catch(()=>null);if(!request)return;
 if(recorder?.state==='recording'){stopCapture();return;}
 if(capturePending){status('A seleção de captura já está aberta. Confirme ou cancele nessa janela.');return;}
 if(isBusy()){status('Finalize a exportação ou análise antes de gravar.');return;}
 if(!ext?.desktopCapture){status('Atalho recebido. Clique em Iniciar gravação para autorizar a captura neste navegador.');$('record').focus();return;}
 await startCapture(true,request.returnTabId);
}
if(ext?.runtime?.id){
 ext.runtime.onMessage.addListener(message=>{if(message.type==='shortcut-available')takeShortcut();});
 takeShortcut();
 ext.commands.getAll().then(commands=>{$('shortcutKey').textContent=commands.find(c=>c.name==='toggle-recording')?.shortcut||'Atalho não atribuído';});
}
$('shortcutSettings').onclick=()=>{if(globalThis.browser){status('Firefox: abra Extensões → engrenagem → Gerenciar atalhos de extensões.');return;}ext?.tabs.create({url:'chrome://extensions/shortcuts'});};
$('cleanOriginal').onclick=()=>{const enabled=$('stage').classList.toggle('clean-original');$('cleanOriginal').setAttribute('aria-pressed',String(enabled));};
function compositionSlots(w,h,time){const t=Math.max(0,time-Number($('start').value));return ['content','cam1'].map(key=>{const r=ClipComposition.rect(composition.layers[key],t);return {key,x:r.x*w,y:r.y*h,w:r.w*w,h:r.h*h};});}
function drawComposition(ctx,w,h,source,time,sw,sh){
 ctx.fillStyle=composition.background;ctx.fillRect(0,0,w,h);
 if(backgroundImage)drawTransformedBackground(ctx,w,h);
 for(const slot of compositionSlots(w,h,time)){
  if(!regionAssigned[slot.key]){if(source===video){ctx.fillStyle='#22283d';ctx.fillRect(slot.x,slot.y,slot.w,slot.h);ctx.fillStyle='#ddd';ctx.font=`${Math.max(12,w*.02)}px sans-serif`;ctx.textAlign='center';ctx.fillText(slot.key==='cam1'?'Selecione a câmera':'Selecione o vídeo',slot.x+slot.w/2,slot.y+slot.h/2);}continue;}
  const g=ClipGeometry.layout(regionRect(slot.key,time),sw,sh,slot.w,slot.h,composition.layers[slot.key].fit);ctx.save();ctx.beginPath();ctx.rect(slot.x,slot.y,slot.w,slot.h);ctx.clip();if(!(slot.key==='content'&&window.drawCameraInline319?.(ctx,source,g,slot.x,slot.y,time))&&!(typeof drawCameraCutout==='function'&&drawCameraCutout(ctx,source,slot,g,time)))ctx.drawImage(source,g.sx,g.sy,g.sw,g.sh,slot.x+g.dx,slot.y+g.dy,g.dw,g.dh);ctx.restore();
 }
 const d=composition.divider;if(d?.enabled){ctx.fillStyle=d.color;ctx.fillRect(d.x*w-d.width*h/1080/2,0,d.width*h/1080,h);}
}
function selectComposition(key){
 compositionSelection=key;$('backgroundTools').hidden=key!=='background';$('layerTools').hidden=key==='background';
 for(const b of $('compositionBar').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.composition===key));
 if(key!=='background'){chooseRegion(key);$('regionBadge').textContent=key==='cam1'?'2 · Câmera':'1 · Vídeo';syncLayerControls();}
}
function syncLayerControls(){const l=composition.layers[regionKey];if(!l)return;const r=l[$('layerPhase').value];for(const [id,k]of [['layerX','x'],['layerY','y'],['layerW','w'],['layerH','h']])$(id).value=(r[k]*100).toFixed(1);$('layerHold').value=l.hold;$('layerMove').value=l.move;$('layerFit').value=l.fit;}
function updateLayerControls(){if(isBusy())return;const l=composition.layers[regionKey];if(!l)return;const n=id=>Number($(id).value)||0;const w=ClipGeometry.clamp(n('layerW')/100,.01,1),h=ClipGeometry.clamp(n('layerH')/100,.01,1);l[$('layerPhase').value]={x:ClipGeometry.clamp(n('layerX')/100,0,1-w),y:ClipGeometry.clamp(n('layerY')/100,0,1-h),w,h};l.hold=ClipGeometry.clamp(n('layerHold'),0,3600);l.move=ClipGeometry.clamp(n('layerMove'),0,3600);l.fit=$('layerFit').value;drawPreview();}
$('compositionTab').onclick=()=>setFormat('composition');
for(const b of $('compositionBar').querySelectorAll('button'))b.onclick=()=>selectComposition(b.dataset.composition);
$('compositionOrientation').onchange=()=>{composition.orientation=$('compositionOrientation').value;$('editor').classList.toggle('short-mode',composition.orientation==='vertical');updateFraming();};
for(const id of ['layerX','layerY','layerW','layerH','layerHold','layerMove','layerFit'])$(id).oninput=updateLayerControls;
$('layerPhase').onchange=syncLayerControls;
$('pinTop').onclick=()=>{const l=composition.layers[regionKey];l.from.y=0;l.to={...l.from};l.motion='still';syncLayerControls();drawPreview();};
$('stillLayer').onclick=()=>{const l=composition.layers[regionKey];l.to={...l.from};l.move=0;l.motion='still';syncLayerControls();drawPreview();};
$('showLayerPhase').onclick=async()=>{const l=composition.layers[regionKey];video.pause();await seekTo(Number($('start').value)+($('layerPhase').value==='to'?l.hold+l.move:0));};
$('backgroundFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('Use PNG, JPG ou WebP até 15 MB.');const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('Imagem muito grande: limite de 40 megapixels.');}backgroundImage?.close?.();backgroundImage=bitmap;if(backgroundURL)URL.revokeObjectURL(backgroundURL);backgroundURL=URL.createObjectURL(file);$('backgroundThumb').src=backgroundURL;$('backgroundThumb').hidden=false;$('backgroundDimensions').textContent=`Imagem: ${bitmap.width} × ${bitmap.height} px`;drawPreview();}catch(err){$('compositionStatus').textContent=err.message;}e.target.value='';};
$('removeBackground').onclick=()=>{backgroundImage?.close?.();backgroundImage=null;if(backgroundURL)URL.revokeObjectURL(backgroundURL);backgroundURL=null;$('backgroundThumb').hidden=true;drawPreview();};
$('backgroundColor').oninput=()=>{composition.background=$('backgroundColor').value;drawPreview();};
for(const id of ['bgX','bgY','bgW','bgH'])$(id).oninput=()=>{const w=ClipGeometry.clamp(Number($('bgW').value)/100,.01,1),h=ClipGeometry.clamp(Number($('bgH').value)/100,.01,1);composition.backgroundCrop={x:ClipGeometry.clamp(Number($('bgX').value)/100,0,1-w),y:ClipGeometry.clamp(Number($('bgY').value)/100,0,1-h),w,h};drawPreview();};
$('saveTemplate').onclick=()=>{commitRegion();const data={type:'clipa-composition',version:2,composition,crops:{content:regionRect('content'),cam1:regionRect('cam1')}};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='clipa-modelo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
$('loadTemplate').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('Modelo maior que 100 KB.');const result=ClipComposition.validate(JSON.parse(await file.text()));composition=result.composition;for(const k of ['content','cam1']){regionStates[k]=stateFor(result.crops[k]);regionAssigned[k]=true;}loadState(regionStates[regionKey]);$('compositionOrientation').value=composition.orientation;$('backgroundColor').value=composition.background;for(const [id,k]of [['bgX','x'],['bgY','y'],['bgW','w'],['bgH','h']])$(id).value=composition.backgroundCrop[k]*100;$('editor').classList.toggle('short-mode',composition.orientation==='vertical');selectComposition('content');updateFraming();$('compositionStatus').textContent='Modelo carregado. Confira os recortes neste vídeo e escolha a imagem de fundo.';}catch(err){$('compositionStatus').textContent=err.message;}e.target.value='';};
$('compositionAI').onclick=async()=>{await $('detectCameras').onclick();$('compositionStatus').textContent=$('faceStatus').textContent||'Sugestão aplicada; revise os recortes.';selectComposition('cam1');};
// Destination dragging edits the selected initial/final rectangle, independently of the source crop.
const cropPreviewDown=$('framing').onpointerdown,cropPreviewMove=$('framing').onpointermove,cropPreviewUp=$('framing').onpointerup;let layerDrag=null;
$('framing').onpointerdown=e=>{if(formatMode==='composition'&&$('moveLayer').checked&&!placingCaption&&!isBusy()&&compositionSelection!=='background'){const r=composition.layers[regionKey][$('layerPhase').value];layerDrag={x:e.clientX,y:e.clientY,r:{...r}};$('framing').setPointerCapture(e.pointerId);}else cropPreviewDown(e);};
$('framing').onpointermove=e=>{if(!layerDrag)return cropPreviewMove(e);const b=$('framing').getBoundingClientRect(),r=layerDrag.r;composition.layers[regionKey][$('layerPhase').value]={...r,x:ClipGeometry.clamp(r.x+(e.clientX-layerDrag.x)/b.width,0,1-r.w),y:ClipGeometry.clamp(r.y+(e.clientY-layerDrag.y)/b.height,0,1-r.h)};syncLayerControls();drawPreview();};
$('framing').onpointerup=$('framing').onpointercancel=()=>{layerDrag=null;cropPreviewUp();};
$('hardware').onchange=updateFraming;

$('browserNotice').textContent=globalThis.browser?'Firefox: o atalho abre o painel; clique em Iniciar para autorizar a tela. A captura de áudio depende do suporte do navegador/SO. Importe um vídeo com som se a captura vier sem áudio.':'Brave, Chrome, Edge e Opera: use o atalho ou Iniciar gravação. A exportação é local e o vídeo não é enviado.';

$('videoCodec').onchange=updateFraming;
$('checkSupport').onclick=async()=>{try{const m=await import('./vendor/exporter.js'),size=outputSize();const ok=await m.checkVideoSupport({width:size.w,height:size.h,fps:outputFps(),bitrate:bitrate(),codec:$('videoCodec').value,hardwareAcceleration:$('hardware').value});$('codecStatus').textContent=ok?'Preset aceito pelo navegador. Faça um corte curto para medir o desempenho real.':'Preset não suportado aqui. Use H.264 / Automática ou reduza resolução e FPS.';}catch(e){$('codecStatus').textContent=e.message;}};
$('clearLocal').onclick=async()=>{if(isBusy()||recorder?.state==='recording')return;const db=await dbPromise;await new Promise((resolve,reject)=>{const tx=db.transaction('clips','readwrite');tx.objectStore('clips').delete('last');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});lastSaved=null;$('restore').hidden=true;status('Última gravação salva apagada. O vídeo que já está aberto continua na memória até fechar a aba.');};
// Fine adjustment without having to draw the selection again.
$('stage').addEventListener('keydown',e=>{if(isBusy()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();rememberCrop();const scale=e.shiftKey?10:1,dx=(e.key==='ArrowRight'?scale:e.key==='ArrowLeft'?-scale:0)/(video.videoWidth||1920),dy=(e.key==='ArrowDown'?scale:e.key==='ArrowUp'?-scale:0)/(video.videoHeight||1080);crop.x=ClipGeometry.clamp(crop.x+dx,0,1-crop.w);crop.y=ClipGeometry.clamp(crop.y+dy,0,1-crop.h);cropCenter={x:crop.x+crop.w/2,y:crop.y+crop.h/2};updateFraming();});

if(false){ $('videoCodec').querySelector('option[value=av1]').disabled=true; $('hardware').value='prefer-software'; $('hardware').disabled=true; $('codecStatus').textContent='Firefox usa H.264 por CPU local: pode demorar mais, preservando os quadros. Arquivos de até 512 MB.'; }

function notifyDesktopState(){window.clipaDesktop?.state({recording:recorder?.state==='recording',busy:isBusy()||!!window.clipaImporting}).catch(()=>{});}
if(window.clipaDesktop){
 $('browserNotice').textContent='Aplicativo Windows · processamento local · selecione a janela do navegador ou sua tela para gravar. O áudio do computador inclui outros aplicativos.';
 $('shortcutSettings').textContent='Sobre o atalho';$('shortcutSettings').onclick=()=>status('Com o Clipa aberto, Ctrl+Shift+9 inicia a seleção ou para a gravação. Se outro aplicativo usar esse atalho, use os botões Iniciar/Parar.');
 window.clipaDesktop.info().then(info=>{$('shortcutKey').textContent=info.shortcut||'Indisponível: use Iniciar/Parar';});
 window.clipaDesktop.onToggle(()=>{if(capturePending||recorder?.state==='recording')stopCapture();else if(!isBusy())startCapture(true);});
 window.clipaDesktop.onDownload(result=>{$('downloadStatus').textContent=result.state==='completed'?'Arquivo salvo: '+result.name:result.state==='cancelled'?'Salvamento cancelado. O arquivo continua disponível para salvar novamente.':'O salvamento foi interrompido. Tente novamente.';});
 document.querySelector('.brand').onclick=e=>e.preventDefault();
}
