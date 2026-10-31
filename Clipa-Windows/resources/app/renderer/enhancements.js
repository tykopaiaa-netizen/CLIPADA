'use strict';
let cutEffects=[],translationBackup=null,translationWorker=null,translationToken=0,rejectTranslation=null;
function drawTransformedBackground(ctx,w,h){
 const t=composition.backgroundTransform||{fit:'cover',zoom:1,x:0,y:0},r=composition.backgroundCrop;
 const sx=r.x*backgroundImage.width,sy=r.y*backgroundImage.height,sw=r.w*backgroundImage.width,sh=r.h*backgroundImage.height;
 let dw=w,dh=h;if(t.fit!=='stretch'){const scale=t.fit==='contain'?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh);dw=sw*scale;dh=sh*scale;}
 dw*=t.zoom;dh*=t.zoom;ctx.drawImage(backgroundImage,sx,sy,sw,sh,(w-dw)/2+t.x*w,(h-dh)/2+t.y*h,dw,dh);
}
function syncEnhancements(){
 const l=composition.layers[regionKey];if(l){$('layerMotion').value=l.motion||'once';$('bounceDown').value=l.down??6;$('bounceUp').value=l.up??10;$('bounceHold').value=l.topHold??5;$('bounceControls').hidden=l.motion!=='bounce';$('layerPhase').disabled=l.motion==='bounce'||l.motion==='still';}
 const t=composition.backgroundTransform,d=composition.divider;
 $('backgroundFit').value=t.fit;$('backgroundZoom').value=t.zoom;$('backgroundPanX').value=t.x;$('backgroundPanY').value=t.y;
 $('dividerEnabled').checked=d.enabled;$('dividerX').value=d.x*100;$('dividerWidth').value=d.width;$('dividerColor').value=d.color;
 const size=outputSize();$('backgroundPixels').textContent=`Fundo recomendado para esta saída: ${size.w} × ${size.h} px. Qualquer proporção pode ser ajustada abaixo.`;
}
const baseSyncLayerControls=syncLayerControls;
syncLayerControls=function(){if(composition.layers[regionKey]?.motion!=='once')$('layerPhase').value='from';baseSyncLayerControls();syncEnhancements();};
for(const id of ['layerMotion','bounceDown','bounceUp','bounceHold'])$(id).oninput=()=>{if(isBusy())return;const l=composition.layers[regionKey];l.motion=$('layerMotion').value;l.down=ClipGeometry.clamp(Number($('bounceDown').value)||.1,.1,3600);l.up=ClipGeometry.clamp(Number($('bounceUp').value)||.1,.1,3600);l.topHold=ClipGeometry.clamp(Number($('bounceHold').value)||0,0,3600);if(l.motion!=='once')$('layerPhase').value='from';syncLayerControls();drawPreview();};
for(const id of ['backgroundFit','backgroundZoom','backgroundPanX','backgroundPanY'])$(id).oninput=()=>{if(isBusy())return;composition.backgroundTransform={fit:$('backgroundFit').value,zoom:Number($('backgroundZoom').value),x:Number($('backgroundPanX').value),y:Number($('backgroundPanY').value)};drawPreview();};
$('resetBackgroundTransform').onclick=()=>{composition.backgroundCrop={x:0,y:0,w:1,h:1};for(const [id,v] of [['bgX',0],['bgY',0],['bgW',100],['bgH',100]])$(id).value=v;composition.backgroundTransform={fit:'cover',zoom:1,x:0,y:0};syncEnhancements();drawPreview();};
for(const id of ['dividerEnabled','dividerX','dividerWidth','dividerColor'])$(id).oninput=()=>{composition.divider={enabled:$('dividerEnabled').checked,x:Number($('dividerX').value)/100,width:ClipGeometry.clamp(Number($('dividerWidth').value)||1,1,20),color:$('dividerColor').value};drawPreview();};
$('reactPreset').onclick=()=>{
 if(isBusy())return;const defaults=ClipComposition.defaults();composition.orientation='wide';composition.layers=defaults.layers;composition.divider=defaults.divider;
 if($('cameraSide').value==='right'){for(const l of Object.values(composition.layers)){for(const key of ['from','to'])l[key].x=1-l[key].x-l[key].w;}composition.divider.x=1-composition.divider.x;}
 $('compositionOrientation').value='wide';$('layerPhase').value='from';$('editor').classList.remove('short-mode');syncLayerControls();updateFraming();drawPreview();$('compositionStatus').textContent='Layout aplicado. Selecione 1 · Vídeo e 2 · Câmera no original; adicione 3 · Fundo. O vídeo desce, sobe e pausa 5 segundos no topo.';
};
$('resolution').addEventListener('change',syncEnhancements);$('compositionOrientation').addEventListener('change',syncEnhancements);
const baseSelectComposition=selectComposition;selectComposition=function(key){baseSelectComposition(key);$('stage').inert=key==='background';if(key==='background'){$('regionBadge').textContent='Fundo · ajuste no painel';$('sourceHint').textContent='O fundo vem da imagem adicionada. Use zoom e posição no painel para transformá-lo.';}else $('sourceHint').textContent='Marque esta área no original. Use as alças para ajustar.';syncEnhancements();};
function visualFilterCSS(){const v=Number($('filterStrength').value),f=$('visualFilter').value;return f==='cinema'?`contrast(${1+.15*v}) saturate(${1-.15*v})`:f==='warm'?`sepia(${.28*v}) saturate(${1+.18*v})`:f==='cool'?`hue-rotate(${15*v}deg) saturate(${1+.12*v})`:f==='mono'?`grayscale(${v})`:f==='vivid'?`saturate(${1+.55*v}) contrast(${1+.1*v})`:'none';}
let transitionCanvas;
function drawTransitions(ctx,w,h,time){
 const start=Number($('start').value),end=Number($('end').value),duration=Math.min(Number($('transitionDuration').value)||.4,Math.max(.01,(end-start)/2));
 const overlay=(color,alpha)=>{if(alpha<=0)return;ctx.save();ctx.globalAlpha=Math.min(1,alpha);ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.restore();};
 if(time>=start&&time<=end&&$('edgeTransition').value!=='none')overlay($('edgeTransition').value==='white'?'#fff':'#000',Math.max(0,1-(time-start)/duration,1-(end-time)/duration));
 for(const effect of cutEffects){if(effect.time<start||effect.time>end)continue;const a=Math.max(0,1-Math.abs(time-effect.time)/(effect.duration/2));if(!a)continue;
  if(effect.type==='zoom'){transitionCanvas??=document.createElement('canvas');if(transitionCanvas.width!==w)transitionCanvas.width=w;if(transitionCanvas.height!==h)transitionCanvas.height=h;const c=transitionCanvas.getContext('2d');c.drawImage(ctx.canvas,0,0);const scale=1+a*.12;ctx.drawImage(transitionCanvas,(w-w*scale)/2,(h-h*scale)/2,w*scale,h*scale);}else overlay(effect.type==='white'?'#fff':'#000',a);
 }
}
function renderCutEffects(){const root=$('cutEffectsList');root.replaceChildren();for(const [i,e] of cutEffects.entries()){const row=document.createElement('div');row.className='effectRow';const show=document.createElement('button');show.textContent=`${e.time.toFixed(2)} s · ${{black:'Preto',white:'Flash',zoom:'Zoom'}[e.type]}`;show.onclick=()=>{video.pause();seekTo(e.time);};const remove=document.createElement('button');remove.textContent='Remover';remove.onclick=()=>{cutEffects.splice(i,1);renderCutEffects();drawPreview();};row.append(show,remove);root.append(row);}}
$('addCutEffect').onclick=()=>{if(cutEffects.length>=100)return;cutEffects.push({time:video.currentTime,type:$('cutEffect').value,duration:ClipGeometry.clamp(Number($('transitionDuration').value)||.4,.1,3)});cutEffects.sort((a,b)=>a.time-b.time);renderCutEffects();drawPreview();};
for(const id of ['visualFilter','filterStrength','edgeTransition','transitionDuration'])$(id).oninput=drawPreview;
function resetEnhancements(){$('stage').inert=false;$('layerPhase').value='from';cutEffects=[];translationBackup=null;$('undoTranslation').disabled=true;$('visualFilter').value='none';$('edgeTransition').value='none';renderCutEffects();syncEnhancements();}
$('translateCaptions').onclick=async()=>{
 if(isBusy())return;const from=$('translateFrom').value,to=$('translateTo').value,original=cues.map(c=>({...c}));
 if(!original.length){$('aiStatus').textContent='Transcreva ou importe legendas antes de traduzir.';return;}if(from===to){$('aiStatus').textContent='Escolha idiomas diferentes.';return;}
 if(original.length>3000){$('aiStatus').textContent='Traduza um trecho menor (até 3.000 legendas).';return;}
 video.pause();aiCancel=false;const token=++translationToken;aiLock(true);$('aiStatus').textContent='Preparando tradução local…';
 try{
  // Free the ASR model before allocating the translation model.
  aiWorker?.terminate();aiWorker=null;translationWorker?.terminate();translationWorker=new Worker(new URL('vendor/translation-worker.js',location.href),{type:'module'});
  const translated=await new Promise((resolve,reject)=>{rejectTranslation=reject;translationWorker.onerror=e=>reject(Error(e.message||'Falha ao iniciar a tradução.'));translationWorker.onmessage=({data})=>{if(token!==translationToken)return;if(data.type==='progress')$('aiStatus').textContent=data.text;if(data.type==='done')resolve(data.texts);if(data.type==='error')reject(Error(data.message));};translationWorker.postMessage({texts:original.map(c=>c.text),from,to});});
  if(token!==translationToken)return;if(!Array.isArray(translated)||translated.length!==original.length)throw Error('Resposta de tradução incompleta.');
  translationBackup=original;cues=original.map((c,i)=>({...c,text:translated[i]||c.text}));renderCaptions();drawPreview();$('aiStatus').textContent='Tradução concluída. Tempos preservados; revise o texto antes de exportar.';
 }catch(e){if(token===translationToken)$('aiStatus').textContent='Tradução não concluída: '+e.message+' Suas legendas foram preservadas.';}
 finally{if(token===translationToken){rejectTranslation=null;translationWorker?.terminate();translationWorker=null;aiLock(false);$('undoTranslation').disabled=!translationBackup;}}
};
$('undoTranslation').onclick=()=>{if(!translationBackup)return;cues=translationBackup;translationBackup=null;renderCaptions();drawPreview();$('undoTranslation').disabled=true;$('aiStatus').textContent='Texto anterior restaurado.';};
const baseCancelAI=$('cancelAI').onclick;
$('cancelAI').onclick=()=>{if(translationWorker){translationToken++;rejectTranslation?.(Error('Cancelado'));rejectTranslation=null;translationWorker.terminate();translationWorker=null;aiLock(false);$('aiStatus').textContent='Tradução cancelada. Legendas preservadas.';}else baseCancelAI();};
// Settings are shared across export and preview, rendered using video timestamps.
syncEnhancements();

for(const id of ['wideTab','shortTab'])$(id).addEventListener('click',()=>{$('stage').inert=false;});
