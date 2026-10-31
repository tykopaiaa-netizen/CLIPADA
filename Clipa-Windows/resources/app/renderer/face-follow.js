'use strict';
(() => {
 const C=ClipTracking;let tracks={},running=false,cancel=false,generation=0;
 const panel=document.createElement('details');panel.id='faceFollowPanel';panel.className='nextCard';panel.open=true;
 panel.innerHTML=`<summary>Seguir rosto</summary><p class="hint">Marque a câmera no original. A IA acompanha a pessoa dentro dessa área, sem mudar a resolução de saída.</p><div class="nextRow"><label>Zoom<input id="followZoom" type="range" min="1.1" max="3" step=".1" value="1.5"></label><label>Movimento<select id="followSmooth"><option value=".6">Suave</option><option value=".3">Ágil</option><option value="1">Bem suave</option></select></label></div><div class="nextRow"><button id="followAnalyze">Analisar rosto</button><button id="followStop" hidden>Cancelar</button><button id="followToggle" disabled>Desativar</button><button id="followReset" disabled>Remover</button></div><progress id="followProgress" max="100" value="0" hidden></progress><p id="followStatus" class="hint" role="status">Analisa o intervalo do corte, até 15 minutos por vez. Escolhe o rosto mais próximo do centro da seleção.</p>`;
 $('tool-layout').append(panel);
 const key=()=>`${formatMode}:${formatMode==='wide'?'content':regionKey}`;
 const baseRect=()=>{if(formatMode==='wide')return selectedRect();const s=regionStates[regionKey];return ClipGeometry.effective(s.crop,s.zoom,s.center);};
 function info(){const t=tracks[key()];$('followToggle').disabled=!t;$('followReset').disabled=!t;$('followToggle').textContent=t?.enabled?'Desativar':'Ativar';if(t)$('followStatus').textContent=`${t.enabled?'Ativo':'Desativado'} · ${fmt(t.start)}–${fmt(t.end)} · rosto em ${t.found}/${t.points.length} quadros. ${t.signature!==C.signature(baseRect())?'A área mudou: analise novamente.':''}`;}
 window.clipaTracking={get state(){return tracks;},rect:(mode,region,rect,time)=>C.sample(tracks[`${mode}:${region}`],time,rect),restore:s=>{tracks=C.validate(s);info();drawPreview();},info};
 $('followAnalyze').onclick=async()=>{
  if(isBusy()||running||!rawBlob)return;
  if(formatMode==='composition'&&compositionSelection==='background'){$('followStatus').textContent='Escolha Câmera ou Vídeo antes de analisar.';return;}
  let r;try{r=range();if(r.end-r.start>900)throw Error('Marque até 15 minutos por análise. O restante mantém o enquadramento fixo.');if(formatMode!=='wide'&&!regionAssigned[regionKey])throw Error('Marque a câmera no Original antes de analisar.');}catch(e){$('followStatus').textContent=e.message;return;}
  commitRegion();const token=++generation,trackKey=key(),area={...baseRect()},zoom=Number($('followZoom').value),previous=tracks[trackKey];
  const bounds=previous?.signature===C.signature(area)?{...previous.bounds}:area;
  const base={x:bounds.x+bounds.w*(1-1/zoom)/2,y:bounds.y+bounds.h*(1-1/zoom)/2,w:bounds.w/zoom,h:bounds.h/zoom};
  const sampling=.25,tau=Number($('followSmooth').value),probe=document.createElement('video'),url=URL.createObjectURL(rawBlob),canvas=document.createElement('canvas');
  probe.muted=true;probe.preload='auto';running=true;cancel=false;video.pause();aiLock(true);$('followStop').hidden=false;$('followStop').disabled=false;$('followProgress').hidden=false;$('followStatus').textContent='Preparando detector local…';
  function seek(t){return new Promise((resolve,reject)=>{if(Math.abs(probe.currentTime-t)<.002&&probe.readyState>=2){resolve();return;}const timer=setTimeout(()=>end(Error('Não consegui ler este quadro. Tente um intervalo menor.')),15000);function end(e){clearTimeout(timer);probe.removeEventListener('seeked',ok);probe.removeEventListener('error',bad);e?reject(e):resolve();}const ok=()=>end(),bad=()=>end(Error('Este formato de vídeo não foi decodificado. Converta para MP4 H.264.'));probe.addEventListener('seeked',ok,{once:true});probe.addEventListener('error',bad,{once:true});probe.currentTime=t;});}
  try{
   const ready=once(probe,'loadeddata');probe.src=url;await ready;const {detectFaces}=await import('./vendor/face-ai.js');
   const dimensions=ClipaStudioCore.canvasSize(probe.videoWidth*bounds.w,probe.videoHeight*bounds.h,640);canvas.width=dimensions.w;canvas.height=dimensions.h;
   const ctx=canvas.getContext('2d');let last=null,position={x:base.x+base.w/2,y:base.y+base.h/2},found=0;const points=[];
   const total=Math.ceil((r.end-r.start)/sampling)+1;
   for(let i=0;i<total;i++){
    if(cancel||token!==generation)throw Error('Análise cancelada. O acompanhamento anterior foi preservado.');
    const t=Math.min(r.end,r.start+i*sampling);await seek(Math.min(t,Math.max(0,probe.duration-.025)));
    ctx.drawImage(probe,bounds.x*probe.videoWidth,bounds.y*probe.videoHeight,bounds.w*probe.videoWidth,bounds.h*probe.videoHeight,0,0,canvas.width,canvas.height);
    const faces=(await detectFaces(canvas)).map(({box:b,score})=>({x:bounds.x+(b.originX+b.width/2)/canvas.width*bounds.w,y:bounds.y+(b.originY+b.height/2)/canvas.height*bounds.h,score}));
    const face=C.choose(faces,last,bounds,sampling);if(face){last=face;found++;const a=1-Math.exp(-sampling/tau);position={x:position.x+(face.x-position.x)*a,y:position.y+(face.y+base.h*.12-position.y)*a};}
    points.push({t,x:C.clamp(position.x,bounds.x+base.w/2,bounds.x+bounds.w-base.w/2),y:C.clamp(position.y,bounds.y+base.h/2,bounds.y+bounds.h-base.h/2),seen:!!face});
    $('followProgress').value=(i+1)/total*100;$('followStatus').textContent=`Analisando ${fmt(t-r.start)} / ${fmt(r.end-r.start)} · ${found} rostos detectados`;
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(cancel||token!==generation)throw Error('Análise cancelada.');if(found<2)throw Error('Rosto não encontrado com segurança. Selecione uma área menor, com a pessoa visível, e tente novamente.');
   tracks[trackKey]={enabled:true,base,bounds,signature:C.signature(base),start:r.start,end:r.end,points,found};loadState(stateFor(base));commitRegion();updateFraming();info();drawPreview();
  }catch(e){$('followStatus').textContent=/activeTexture|WebGL|GL context/i.test(e.message)?'O detector precisa de aceleração gráfica disponível. Atualize o driver de vídeo e reinicie o Clipa; o recorte manual continua funcionando.':e.message;}finally{probe.pause();probe.removeAttribute('src');probe.load();URL.revokeObjectURL(url);running=false;const message=$('followStatus').textContent;aiLock(false);info();$('followStatus').textContent=message;$('followStop').hidden=true;$('followProgress').hidden=true;}
 };
 $('followStop').onclick=()=>{cancel=true;$('followStatus').textContent='Cancelando…';};const priorCancel=$('cancelAI').onclick;$('cancelAI').onclick=()=>running?$('followStop').click():priorCancel();
 $('followToggle').onclick=()=>{if(isBusy())return;const t=tracks[key()];if(t)t.enabled=!t.enabled;info();drawPreview();};
 $('followReset').onclick=()=>{if(isBusy())return;const t=tracks[key()];if(t){loadState(stateFor(t.bounds));delete tracks[key()];updateFraming();}info();$('followStatus').textContent='Acompanhamento removido. Área original restaurada.';};
 const open=openEditor;openEditor=async(...args)=>{generation++;cancel=true;tracks={};await open(...args);info();};
 const choose=chooseRegion;chooseRegion=(...args)=>{choose(...args);info();};
 const framing=updateFraming;updateFraming=(...args)=>{framing(...args);if(!running)info();};
 const format=setFormat;setFormat=(...args)=>{format(...args);info();};
 for(const id of ['followAnalyze','followZoom','followSmooth','followToggle','followReset'])$(id).dataset.help={followAnalyze:'Analisa o rosto no intervalo do corte. O movimento é gravado por tempo e aplicado também no MP4.',followZoom:'Aproxima a câmera dentro da área selecionada. Zoom maior recorta mais bordas; não cria detalhes novos.',followSmooth:'Suavização da trajetória do rosto. Altere e analise novamente para aplicar.',followToggle:'Ativa ou desativa o movimento sem apagar a análise.',followReset:'Apaga a análise desta área e restaura o enquadramento anterior.'}[id];
})();
