'use strict';
(()=>{
 const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e;};let active=null,switching=false;
 const cutRows=make('div','cutRows315');document.querySelector('.timelineTracks').append(cutRows);
 const fields=[...new Set([...modeFields,'cameraCount','cameraHeight','contentContain','captionX','captionY','captionSize','captionColor','captionOutline','captionHighlight','captionBoxColor','captionStyle','captionsEnabled','layerMotion','removeCameraBg','segmentQuality','maskThreshold','maskSoftness','maskTemporal','maskCleanup318'])];
 function capture(){commitRegion();return structuredClone({layouts321:window.clipaLayouts321?.serialize(),camera319:window.clipaCamera319?.serialize(),layout317:window.clipaLayout317?.serialize(),formatMode,crop,cropCenter,regionKey,regionStates,regionAssigned,wideState,modeRegions,modeSettings,composition,values:Object.fromEntries(fields.filter(id=>$(id)).map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))});}
 function commit(){const c=clipBank.find(c=>c.id315===active);if(c&&!switching){c.variant315=capture();c.start=Number($('start').value);c.end=Number($('end').value);}}
 function apply(v,mode){
  if(!v){setFormat(mode||formatMode);return;}
  setFormat(v.formatMode);
  for(const [id,value]of Object.entries(v.values||{})){const e=$(id);if(e)e.type==='checkbox'?e.checked=value:e.value=value;}
  crop=structuredClone(v.crop);cropCenter=structuredClone(v.cropCenter);regionKey=v.regionKey;regionStates=structuredClone(v.regionStates);regionAssigned=structuredClone(v.regionAssigned);wideState=structuredClone(v.wideState);modeRegions=structuredClone(v.modeRegions);modeSettings=structuredClone(v.modeSettings);composition=structuredClone(v.composition);window.clipaLayouts321?.restore(v.layouts321);window.clipaLayout317?.restore(v.layout317,v.values);window.clipaCamera319?.restore(v.camera319,v.values?.removeCameraBg);
  if(formatMode!=='wide')modeRegions[formatMode]={states:regionStates,assigned:regionAssigned};
  loadState(formatMode==='wide'?wideState:regionStates[regionKey]);
  if(mode&&mode!==formatMode)setFormat(mode);else{refreshRegionButtons();updateFraming();drawPreview();}
 }
 async function load(c,mode){if(isBusy()||switching)return;commit();switching=true;try{video.pause();previewing=false;active=c.id315;apply(c.variant315,mode);$('start').value=c.start.toFixed(3);$('end').value=c.end.toFixed(3);updateTimeline();$('stage').inert=false;clipaTimeline.clear();await seekTo(c.start);updatePlayButton();window.clipaSelectPanel('layout');document.querySelector('.clipDesk').open=true;drawRows();refreshReady();editStatus((c.title||'Corte')+' aberto. Os outros cortes continuam na timeline e em Cortes IA.');}catch(e){editStatus(e.message);}finally{switching=false;}}
 function drawRows(){cutRows.replaceChildren();for(const [i,c]of clipBank.entries()){c.id315||=crypto.randomUUID();const row=make('div','cutRow315'),name=make('button','cutName315',c.title||'Corte '+(i+1)),body=make('div','cutBody315'),clip=make('button','cutBlock315',fmt(c.start)+' → '+fmt(c.end)),wide=make('button','','16:9'),short=make('button','','9:16');row.classList.toggle('active',c.id315===active);name.title='Abrir este corte; renomeie em Cortes IA';name.onclick=()=>load(c);clip.style.left=c.start/duration*100+'%';clip.style.width=Math.max(.4,(c.end-c.start)/duration*100)+'%';clip.onclick=()=>load(c);wide.title='Editar este corte no horizontal';short.title='Editar este corte no vertical';wide.onclick=()=>load(c,'wide');short.onclick=()=>load(c,'short');body.append(clip);row.append(name,body,wide,short);cutRows.append(row);}cutRows.hidden=!clipBank.length;}
 // Preserve existing multi-select, transfer and history controls. Replace only ambiguous load actions.
 const render=renderClipBank;renderClipBank=()=>{render();for(const [i,card]of [...$('highlightList').querySelectorAll('.clipCard')].entries()){const c=clipBank[i];c.id315||=crypto.randomUUID();for(const b of card.querySelectorAll('button')){if(b.textContent==='Ver trecho'){b.textContent='Editar corte';b.onclick=()=>load(c);}else if(b.textContent==='Enviar renderizado ao Shorts'){b.textContent='Editar vertical';b.title='Enquadrar este corte no vertical usando o original. O envio do MP4 renderizado continua disponível abaixo.';b.onclick=()=>load(c,'short');}}const save=make('button','','Guardar projeto deste corte');save.onclick=async()=>{await load(c);await clipaLibrary.saveCopy();};card.append(save);}drawRows();};
 const projectState=clipaProjects.state;clipaProjects.state=()=>{commit();return projectState();};
 $('openCuts').onclick=()=>{window.clipaSelectPanel('ai');document.querySelector('.clipDesk').open=true;document.querySelector('.autoSetup').open=false;$('highlightList').scrollIntoView({block:'nearest'});};
 $('trackCuts').onclick=()=>$('openCuts').click();
 const oldOpen=openEditor;openEditor=async(...args)=>{active=null;switching=false;await oldOpen(...args);drawRows();};
 const after=clipaProjects.open;clipaProjects.open=async record=>{const ok=await after(record);active=null;drawRows();return ok;};
 // Clear source cut state only on an actual source load, never while reviewing a cut.
 const hint=make('p','hint','Cada linha abaixo é um corte independente do mesmo original. Clique em 16:9 ou 9:16 para editar. Guardar projeto deste corte cria uma cópia na biblioteca.');document.querySelector('.clipDesk').prepend(hint);
 window.clipaCuts={load,commit,draw:drawRows,get active(){return active;}};renderClipBank();
})();
