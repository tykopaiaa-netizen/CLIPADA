'use strict';
let segmentationWorker,segmentationReady,segmentID=0,segmentRequests=new Map(),cameraMasks={},previewMaskPending=false,lastMaskRequest=-Infinity;
let cameraStatusBase318='';
let segmentEpoch318=0,maskQueue=Promise.resolve(),maskActivation318=false,maskCompare318=false;
let highlightCancelled=false,highlightRunning=false,clipBank=[],activityCache=null;
const maskInput=document.createElement('canvas'),maskInputCtx=maskInput.getContext('2d');
const cutoutCanvas=document.createElement('canvas'),cutoutCtx=cutoutCanvas.getContext('2d');
function maskStatus318(text){cameraStatusBase318=text;if(text.startsWith('Fundo removido')&&window.clipaLayerUI318?.cameraCovered())text+=' Há mídia acima da câmera. Use Ao fundo se ela deveria ficar atrás.';for(const id of ['cameraAIStatus','cameraResult315','quickBgStatus318',...(maskActivation318?['aiStatus','cameraProgress319']:[])]){const e=$(id);if(e&&e.textContent!==text)e.textContent=text;}}
function segmentAbort318(message='Processamento cancelado.') {const e=Error(message);e.name='AbortError';return e;}
function resetCameraMasks318(terminate=false){
 segmentEpoch318++;cameraMasks={};lastMaskRequest=-Infinity;previewMaskPending=false;maskQueue=Promise.resolve();
 if(terminate){for(const q of segmentRequests.values()){clearTimeout(q.timer);q.reject(segmentAbort318());}segmentRequests.clear();segmentationWorker?.terminate();segmentationWorker=null;segmentationReady=null;}
}
function segmentCall(data,transfer=[]){return new Promise((resolve,reject)=>{
 const id=++segmentID,timer=setTimeout(()=>{const error=Error('A IA de fundo não respondeu em 60 segundos. Tente o modo Leve ou Recalcular.');segmentRequests.delete(id);reject(error);for(const q of segmentRequests.values()){clearTimeout(q.timer);q.reject(error);}segmentRequests.clear();segmentationWorker?.terminate();segmentationWorker=null;segmentationReady=null;},60000);
 segmentRequests.set(id,{resolve,reject,timer});
 try{segmentationWorker.postMessage({id,...data},transfer);}catch(e){clearTimeout(timer);segmentRequests.delete(id);reject(e);}
});}
function ensureSegmentation(quality=$('segmentQuality')?.value||'precise'){
 if(!segmentationReady){
  segmentationWorker=new Worker(new URL('vendor/segment-worker.js',location.href));
  segmentationWorker.onmessage=({data})=>{if(segmentationWorker!==worker)return;const q=segmentRequests.get(data.id);if(!q)return;clearTimeout(q.timer);segmentRequests.delete(data.id);data.error?q.reject(Error(data.error)):q.resolve(data);};
  segmentationWorker.onerror=e=>{if(segmentationWorker!==worker)return;const error=Error(e.message||'Falha ao abrir a IA de fundo local.');for(const q of segmentRequests.values()){clearTimeout(q.timer);q.reject(error);}segmentRequests.clear();segmentationWorker?.terminate();segmentationWorker=null;segmentationReady=null;};
  const worker=segmentationWorker;
  segmentationReady=segmentCall({type:'init',quality}).catch(e=>{if(segmentationWorker===worker){worker.terminate();segmentationWorker=null;segmentationReady=null;}throw e;});
 }
 return segmentationReady;
}
function cameraKeys(){if(window.clipaCamera319)return clipaCamera319.keys();return formatMode==='composition'?['cam1']:formatMode==='short'?shortSlots(1,1).filter(s=>s.key!=='content').map(s=>s.key):[];}
function cameraAssigned319(k){return window.clipaCamera319?clipaCamera319.assigned(k):regionAssigned[k];}
function cameraRect319(k,time){return window.clipaCamera319?clipaCamera319.rect(k,time):regionRect(k,time);}
function cameraSignature319(k,time,quality){return formatMode+':'+JSON.stringify(cameraRect319(k,time))+quality;}
function prepareCameraMasks(source,time,exact=false){
 if(!$('removeCameraBg').checked||!cameraKeys().length)return Promise.resolve();
 const epoch=segmentEpoch318,quality=$('segmentQuality')?.value||'precise',sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;
 if(!sw||!sh)return Promise.reject(Error('Aguarde o quadro do vídeo carregar.'));
 const pending=[];
 // Snapshot pixels now, before model initialization or a queued inference can move the video.
 for(const key of cameraKeys().filter(cameraAssigned319)){
  const rect={...cameraRect319(key,time)},signature=cameraSignature319(key,time,quality);
  if(cameraMasks[key]?.time===time&&cameraMasks[key]?.signature===signature)continue;
  const maxSide=quality==='precise'?768:384,scale=Math.min(1,maxSide/Math.max(rect.w*sw,rect.h*sh));
  maskInput.width=Math.max(2,Math.round(rect.w*sw*scale));maskInput.height=Math.max(2,Math.round(rect.h*sh*scale));
  maskInputCtx.drawImage(source,rect.x*sw,rect.y*sh,rect.w*sw,rect.h*sh,0,0,maskInput.width,maskInput.height);
  pending.push({key,signature,bitmap:createImageBitmap(maskInput)});
 }
 if(!pending.length)return Promise.resolve();
 const run=async()=>{
  const results=await Promise.allSettled(pending.map(async p=>({...p,bitmap:await p.bitmap}))),frames=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  try{
   const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   if(epoch!==segmentEpoch318)throw segmentAbort318();
   await ensureSegmentation(quality);
   for(const {key,signature,bitmap}of frames){
    if(epoch!==segmentEpoch318||!$('removeCameraBg').checked||exact&&exporting&&cancelExport)throw segmentAbort318();
    const result=await segmentCall({bitmap,quality},[bitmap]);
    if(epoch!==segmentEpoch318)throw segmentAbort318();
    if(!(result.width>0&&result.height>0)||result.values?.length!==result.width*result.height)throw Error('A IA devolveu uma máscara inválida. Recalcule este quadro.');
    const previous=cameraMasks[key],blend=Math.max(0,Math.min(.7,Number($('maskTemporal')?.value)||0));
    if(previous&&previous.signature===signature&&time>previous.time&&time-previous.time<.15&&previous.values.length===result.values.length&&blend>0){
     for(let i=0;i<result.values.length;i++){const delta=Math.abs(result.values[i]-previous.values[i]);if(delta<.2)result.values[i]=result.values[i]*(1-blend)+previous.values[i]*blend;}
    }
    cameraMasks[key]={...result,time,signature};
   }
  }finally{for(const f of frames)f.bitmap.close();}
 };
 const job=maskQueue.then(run);maskQueue=job.catch(()=>{});return job;
}
function requestPreviewMasks(source,time){
 if(exporting||maskActivation318||!$('removeCameraBg').checked||previewMaskPending||!cameraKeys().some(cameraAssigned319))return;
 const keys=cameraKeys().filter(cameraAssigned319),quality=$('segmentQuality')?.value||'precise';
 if(keys.every(k=>cameraMasks[k]?.time===time&&cameraMasks[k]?.signature===cameraSignature319(k,time,quality)))return;
 if(!video.paused&&Math.abs(time-lastMaskRequest)<.1)return;
 const epoch=segmentEpoch318;previewMaskPending=true;lastMaskRequest=time;if(video.paused)maskStatus318('Atualizando recorte da câmera…');
 prepareCameraMasks(source,time).then(()=>{if(epoch===segmentEpoch318&&!exporting){maskStatus318('Fundo removido · '+keys.length+' câmera(s). Confira as bordas na prévia.');drawPreview();}}).catch(e=>{if(epoch===segmentEpoch318&&e.name!=='AbortError'){maskStatus318('Não foi possível atualizar: '+e.message);$('removeCameraBg').checked=false;}}).finally(()=>{if(epoch!==segmentEpoch318)return;previewMaskPending=false;if(video.paused&&Math.abs(video.currentTime-time)>.01)drawPreview();});
}
function drawCameraCutout(ctx,source,slot,g,time){
 if(!$('removeCameraBg').checked||slot.key==='content'||!cameraKeys().includes(slot.key)||maskCompare318&&!exporting)return false;
 const mask=cameraMasks[slot.key],r=cameraRect319(slot.key,time),signature=cameraSignature319(slot.key,time,$('segmentQuality')?.value||'precise');
 if(!mask||mask.signature!==signature||!exporting&&video.paused&&Math.abs(mask.time-time)>.1){
  if(exporting)throw Error('A máscara da '+regionLabel(slot.key)+' não está pronta. Recalcule a remoção de fundo.');
  return false;
 }
 const sw=source.videoWidth||source.width,sh=source.videoHeight||source.height,scale=Math.min(1,4096/Math.max(r.w*sw,r.h*sh)),cw=Math.max(1,Math.round(r.w*sw*scale)),ch=Math.max(1,Math.round(r.h*sh*scale));
 if(cutoutCanvas.width!==cw||cutoutCanvas.height!==ch){cutoutCanvas.width=cw;cutoutCanvas.height=ch;}
 cutoutCtx.clearRect(0,0,cw,ch);cutoutCtx.drawImage(source,r.x*sw,r.y*sh,r.w*sw,r.h*sh,0,0,cw,ch);
 const refinement=window.clipaCamera319?.get(slot.key),threshold=Math.max(.1,Math.min(.9,Number($('maskThreshold').value)||.5)),soft=Math.max(.02,Math.min(.4,Number($('maskSoftness').value)||.15)),cacheKey=threshold+':'+soft+':'+$('maskCleanup318')?.checked+':'+JSON.stringify(refinement);
 if(mask.alphaKey!==cacheKey){
  const c=document.createElement('canvas');c.width=mask.width;c.height=mask.height;const x=c.getContext('2d'),pixels=x.createImageData(c.width,c.height);
  const alpha=ClipaCameraCore.alpha(mask,threshold,soft,refinement?.chair||0);for(let i=0;i<mask.values.length;i++){pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;pixels.data[i*4+3]=alpha[i];}
  if($('maskCleanup318')?.checked)ClipaMaskRefine.clean(pixels.data,c.width,c.height);x.putImageData(pixels,0,0);mask.alpha=c;mask.alphaKey=cacheKey;x.save();x.lineCap='round';x.lineJoin='round';x.fillStyle=x.strokeStyle='#fff';for(const stroke of refinement?.strokes||[]){x.globalCompositeOperation=stroke.mode==='restore'?'source-over':'destination-out';x.lineWidth=stroke.size*Math.min(c.width,c.height);x.beginPath();stroke.points.forEach((p,i)=>i?x.lineTo(p.x*c.width,p.y*c.height):x.moveTo(p.x*c.width,p.y*c.height));x.stroke();for(const p of [stroke.points[0],stroke.points.at(-1)])if(p){x.beginPath();x.arc(p.x*c.width,p.y*c.height,x.lineWidth/2,0,Math.PI*2);x.fill();}}x.restore();
 }
 cutoutCtx.globalCompositeOperation='destination-in';cutoutCtx.imageSmoothingEnabled=true;cutoutCtx.imageSmoothingQuality='high';
 try{cutoutCtx.drawImage(mask.alpha,0,0,cw,ch);}finally{cutoutCtx.globalCompositeOperation='source-over';}
 // Reuse the exact layout selected for this slot, including Encaixar and tracking.
 ctx.drawImage(cutoutCanvas,0,0,cw,ch,slot.x+g.dx,slot.y+g.dy,g.dw,g.dh);return true;
}
async function activateCameraBg318(){
 if(isBusy())return;
 window.clipaCamera319?.ensureSelected();const keys=cameraKeys();
 if(!keys.some(cameraAssigned319)){$('removeCameraBg').checked=false;maskStatus318('Marque a webcam no original antes de aplicar.');return;}
 video.pause();previewing=false;resetCameraMasks318(true);const epoch=segmentEpoch318;
 $('removeCameraBg').checked=true;maskActivation318=true;aiLock(true);$('cancelAI').disabled=false;if($('cancelBg318')){$('cancelBg318').hidden=false;$('cancelBg318').disabled=false;}
 const started=performance.now();maskStatus318('Analisando a câmera com IA local…');const timer=setInterval(()=>maskStatus318('Analisando a câmera · '+Math.floor((performance.now()-started)/1000)+' s…'),500);
 try{await prepareCameraMasks(video,video.currentTime,true);if(epoch!==segmentEpoch318)return;maskStatus318('Fundo removido · '+keys.filter(cameraAssigned319).length+' câmera(s). Ajuste Borda e Suavidade se necessário.');}
 catch(e){if(epoch===segmentEpoch318){$('removeCameraBg').checked=false;maskStatus318(e.name==='AbortError'?'Remoção cancelada.':'Não foi possível remover: '+e.message);}}
 finally{clearInterval(timer);maskActivation318=false;aiLock(false);if($('cancelBg318'))$('cancelBg318').hidden=true;drawPreview();}
}
function disableCameraBg318(){resetCameraMasks318(true);window.clipaCamera319?.disable();$('removeCameraBg').checked=false;maskCompare318=false;maskStatus318('Fundo original restaurado.');drawPreview();}
$('removeCameraBg').onchange=()=>{$('removeCameraBg').checked?activateCameraBg318():disableCameraBg318();};
for(const id of ['maskThreshold','maskSoftness'])$(id).oninput=drawPreview;
window.clipaCameraBg={refreshStatus:()=>maskStatus318(cameraStatusBase318),enable:activateCameraBg318,disable:disableCameraBg318,invalidate:resetCameraMasks318,get busy(){return maskActivation318;},get masks(){return cameraMasks;},compare(on){maskCompare318=!!on;drawPreview();}};
video.addEventListener('loadedmetadata',()=>resetCameraMasks318(true));
const platformInfo={shorts:'YouTube Shorts: até 180 s, formato quadrado ou vertical. Sugestões: 15, 30, 60, 90 ou 180 s.',tiktok:'TikTok: presets de cortes de 15–180 s. O app permite uploads de até 60 min; TikTok Studio web informa até 30 min. O limite depende da via de envio.',reels:'Instagram Reels: presets de 15–180 s. A ajuda informa até 20 min, mas vídeos acima de 3 min não são recomendados a novos públicos.',custom:'Escolha a duração do corte. Você pode ajustar o início e o fim depois.'};
function updatePlatform(){const platform=$('platformPreset').value,length=Number($('clipLength').value);$('platformHelp').textContent=platformInfo[platform]+(platform==='shorts'&&length>180?' Este tempo excede o limite de Shorts.':'')+' · Referências conferidas em 13/10/2026.';}
$('platformPreset').onchange=updatePlatform;$('clipLength').oninput=()=>{const value=String(Number($('clipLength').value));$('clipLengthPreset').value=[...$('clipLengthPreset').options].some(o=>o.value===value)?value:'custom';updatePlatform();};$('clipLengthPreset').onchange=()=>{if($('clipLengthPreset').value!=='custom')$('clipLength').value=$('clipLengthPreset').value;updatePlatform();};
function renderClipBank(){const root=$('highlightList');root.replaceChildren();for(const [i,clip] of clipBank.entries()){const card=document.createElement('article');card.className='clipCard';const title=document.createElement('input');title.value=clip.title||`Corte ${i+1}`;title.setAttribute('aria-label','Nome do corte');title.onchange=()=>clip.title=title.value;const meta=document.createElement('p');meta.textContent=`${fmt(clip.start)} → ${fmt(clip.end)} · ${(clip.end-clip.start).toFixed(1)} s`;const reason=document.createElement('small');reason.textContent=clip.manual?'Marcado por você':clip.semantic?clip.reason:'Sugestão por atividade de áudio · revise o contexto';const actions=document.createElement('div');const load=async(short)=>{if(isBusy())return;video.pause();$('start').value=clip.start.toFixed(2);$('end').value=clip.end.toFixed(2);updateTimeline();if(short){setFormat('short');$('resolution').value='720';$('fps').value='30';updateFraming();}$('stage').inert=false;document.querySelector('.clipDesk').open=true;for(const c of root.querySelectorAll('.clipCard'))c.classList.remove('reviewing');card.classList.add('reviewing');refreshReady();await seekTo(clip.start);$('framing').scrollIntoView({behavior:'smooth',block:'center'});};for(const [label,fn] of [['Ver trecho',()=>load(false)],['Abrir no Shorts',()=>load(true)],['Remover',()=>{clipBank.splice(i,1);renderClipBank();}]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>Promise.resolve(fn()).catch(e=>editStatus(e.message));actions.append(b);}card.append(title,meta,reason,actions);root.append(card);}}
$('saveCurrentClip').onclick=()=>{try{const r=range();clipBank.push({...r,manual:true,title:`Corte ${clipBank.length+1}`});renderClipBank();}catch(e){$('highlightStatus').textContent=e.message;}};
$('findHighlights').onclick=async()=>{if(isBusy()||!rawBlob)return;const length=Number($('clipLength').value),count=Number($('clipCount').value);if(!Number.isFinite(length)||length<3||length>3600||!Number.isInteger(count)||count<1||count>20){$('highlightStatus').textContent='Escolha duração de 3 a 3.600 segundos e quantidade de 1 a 20.';return;}
 if($('platformPreset').value==='shorts'&&length>180){$('highlightStatus').textContent='Para Shorts, escolha até 180 segundos ou mude para Personalizado.';return;}
 if(clipBank.length&&!confirm('Substituir a lista atual por novas sugestões?'))return;
 video.pause();highlightCancelled=false;highlightRunning=true;aiLock(true);$('stopHighlights').hidden=false;$('stopHighlights').disabled=false;$('highlightProgress').hidden=false;$('highlightStatus').textContent='Lendo o áudio em blocos, sem carregar a live inteira…';
 try{const module=await import('./vendor/media-analysis.js');if(!activityCache)activityCache=await module.analyzeActivity(rawBlob,duration,p=>{$('highlightProgress').value=p;$('highlightStatus').textContent=`Analisando atividade do áudio · ${Math.floor(p)}%`;$('aiStatus').textContent=$('highlightStatus').textContent;},()=>highlightCancelled);if(highlightCancelled)throw Error('Cancelado');clipBank=module.suggestClips(activityCache,duration,length,count);renderClipBank();$('highlightStatus').textContent=clipBank.length?`${clipBank.length} sugestões prontas. Ouça cada trecho e abra no Shorts para enquadrar. A seleção considera áudio, não compreensão do assunto.`:'Não encontrei atividade de áudio suficiente. Marque trechos manualmente.';
 }catch(e){$('highlightStatus').textContent=highlightCancelled?'Busca cancelada; a lista anterior foi mantida.':e.message;}finally{highlightRunning=false;aiLock(false);$('stopHighlights').hidden=true;$('highlightProgress').hidden=true;}
};
$('stopHighlights').onclick=()=>{highlightCancelled=true;$('highlightStatus').textContent='Cancelando análise…';};const priorCancelAI=$('cancelAI').onclick;$('cancelAI').onclick=()=>{if(highlightRunning)$('stopHighlights').click();else priorCancelAI();};
video.addEventListener('loadedmetadata',()=>{document.querySelector('.clipDesk').open=true;clipBank=[];activityCache=null;cameraMasks={};lastMaskRequest=-Infinity;$('removeCameraBg').checked=false;renderClipBank();$('sourceFileInfo').textContent=`${rawBlob?.name||'Gravação'} · ${((rawBlob?.size||0)/1e9).toFixed(2)} GB`;$('highlightStatus').textContent='Escolha a duração e encontre sugestões, ou marque um corte manualmente.';});
updatePlatform();
