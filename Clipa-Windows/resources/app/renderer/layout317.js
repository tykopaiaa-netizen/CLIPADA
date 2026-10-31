'use strict';
(() => {
  const C = ClipaLayoutCore, grid = document.querySelector('.editorgrid'), frame = $('frameStage');
  const make = (tag, cls, html) => {const e=document.createElement(tag);e.className=cls;if(html)e.innerHTML=html;return e;};
  let settings=C.normalize(), viewScale=1, viewPan={x:0,y:0}, fitting=false;
  const panel=make('section','layoutPanel317',`
    <div class="sectionTitle317"><span>ENQUADRAMENTO</span><b id="areaName317">Vídeo principal</b></div>
    <label id="areaLabel317">Área no resultado<select id="area317"></select></label>
    <button id="markSource317">Marcar no original</button><div class="fitChoice317"><button id="contain317">Encaixar</button><button id="cover317">Preencher</button></div>
    <p id="fitHelp317" class="micro317"></p>
    <div id="cameraHeightRow317"><label>Altura da câmera <output id="heightValue317"></output></label><input id="height317" type="range" min="8" max="82" step=".5"></div>
    <button id="natural317" class="natural317">Ajustar à proporção da seleção</button>
    <div id="transformRow317"><label class="lock317"><input id="lock317" type="checkbox" checked> Manter proporção</label><div class="sizeFields317"><label>Largura (%)<input id="width317" type="number" min="2" max="100" step=".5"></label><label>Altura (%)<input id="boxHeight317" type="number" min="2" max="100" step=".5"></label></div><div class="fitChoice317"><button id="center317">Centralizar</button><button id="resetArea317">Restaurar área</button></div></div>
    <p id="areaSize317" class="micro317"></p><p id="layoutHint317" class="micro317">Selecione a área no Original. Ajuste o tamanho no Resultado.</p>
  `);
  $('tool-layout').prepend(panel);
  // Older controls remain wired for compatibility, but no longer compete with the active-area controls.
  $('cameraHeight').closest('label').hidden=true;
  $('contentContain').closest('label').hidden=true;
  document.querySelector('.primaryTransform316').hidden=true;
  const fitActions=document.querySelector('.previewFitActions');if(fitActions)fitActions.hidden=true;
  const zoomBar=make('div','viewZoom317','<span>Prévia</span><button id="viewOut317" aria-label="Diminuir a prévia">−</button><button id="viewFit317">Ajustar</button><button id="viewIn317" aria-label="Ampliar a prévia">+</button>');
  document.querySelector('.dockBar').insertBefore(zoomBar,$('focusPreview'));
  const boundary=make('div','boundaries317');frame.append(boundary);
  const handles=['cam1','cam2'].map(key=>{const b=make('button','boundary317','<span>↕</span>');b.dataset.area=key;b.setAttribute('aria-label','Ajustar altura da '+(key==='cam1'?'câmera superior':'câmera inferior'));b.title='Arraste para mudar a altura. Setas ↑ e ↓ ajustam 1%. Esta alça não aparece no MP4.';boundary.append(b);return b;});
  const outline=make('div','layoutOutline317','<button class="move317" aria-label="Mover a área no resultado">✥ <span></span></button>'+['nw','ne','sw','se'].map(c=>'<i data-corner="'+c+'"></i>').join(''));frame.append(outline);
  const assetLock=make('label','lock317','<input id="assetAspect317" type="checkbox" checked> Manter proporção ao arrastar');$('imageFields314').prepend(assetLock);
  const fit = key => settings.vertical.fits[key] || 'cover';
  const activeKey = () => formatMode==='wide'?'content':regionKey;
  const layer = () => formatMode==='composition'?composition.layers[regionKey]:null;
  const phase = () => $('layerPhase').value==='to'?'to':'from';
  const dest = () => formatMode==='wide'?clipaMedia.serialize().primary:layer()?.[phase()];
  const activeFit = () => formatMode==='short'?fit(activeKey()):formatMode==='composition'?layer()?.fit||'contain':$('fit').value;
  const lockKey = () => formatMode==='wide'?'wide':'composition';
  function checkpoint(){window.clipaTimeline?.checkpoint();}
  function setDest(r){if(formatMode==='wide')clipaMedia.serialize().primary=r;else if(layer())layer()[phase()]=r;}
  function sourceAspect(){const r=formatMode==='wide'?selectedRect():regionRect(activeKey());return Math.max(.001,r.w*(video.videoWidth||16)/Math.max(1,r.h*(video.videoHeight||9)));}
  function setFit(value){if(formatMode==='short'){settings.vertical.fits[activeKey()]=value;$('contentContain').checked=fit('content')==='contain';}else if(formatMode==='composition'){if(layer())layer().fit=value;$('layerFit').value=value;}else $('fit').value=value;}
  function changed(){settings=C.normalize(settings);$('cameraHeight').value=settings.vertical.top*100;$('cameraHeightValue').textContent=Math.round(settings.vertical.top*100)+'%';if(formatMode==='composition')syncLayerControls();updateFraming();refreshReady();}
  function adjustHeight(key,value){const field=key==='cam2'?'bottom':'top',other=field==='top'?'bottom':'top',count=+$('cameraCount').value;settings.vertical[field]=C.clamp(value,.08,count===2?.9-settings.vertical[other]:.82);if(count===1&&settings.vertical.top+settings.vertical.bottom>.9)settings.vertical.bottom=.9-settings.vertical.top;changed();}
  $('markSource317').onclick=()=>{if(isBusy())return;setSelectionTool('select');document.querySelector('.previewDock').classList.remove('resultOnly');document.querySelector('.previewDock').classList.add('mobileSource316');fitViewers();$('stage').focus();};
  $('resetArea317').onclick=()=>{if(isBusy())return;checkpoint();setDest(formatMode==='wide'?{x:0,y:0,w:1,h:1}:ClipComposition.defaults().layers[regionKey][phase()]);changed();};
  $('area317').onchange=()=>{if(isBusy())return;formatMode==='composition'?selectComposition($('area317').value):chooseRegion($('area317').value);};
  for(const value of ['contain','cover'])$(value+'317').onclick=()=>{if(isBusy())return;checkpoint();setFit(value);changed();};
  $('height317').onpointerdown=()=>{if(!isBusy())checkpoint();};$('height317').onkeydown=e=>{if(!isBusy()&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key))checkpoint();};
  $('height317').oninput=()=>{if(!isBusy())adjustHeight(activeKey(),+$('height317').value/100);};
  $('natural317').onclick=()=>{
    if(isBusy())return;
    if(formatMode!=='wide'&&!regionAssigned[activeKey()]){editStatus('Primeiro marque '+regionLabel(activeKey())+' no Original.');setSelectionTool('select');return;}
    checkpoint();const s=outputSize(),ratio=sourceAspect();setFit('contain');
    if(formatMode==='short'){
      if(activeKey()==='content'){changed();return;}
      adjustHeight(activeKey(),s.w/s.h/ratio);
    }else {setDest(C.aspectRect(dest(),ratio,s.w/s.h));changed();}
  };
  $('lock317').onchange=()=>{if(!isBusy())settings.locks[lockKey()]=$('lock317').checked;};
  $('assetAspect317').onchange=()=>{settings.locks.media=$('assetAspect317').checked;};
  function sizeInput(key,value){if(isBusy()||!dest())return;checkpoint();const r={...dest()},n=C.clamp(value/100,.02,1);setDest(C.resize(r,key==='w'?n-r.w:0,key==='h'?n-r.h:0,'se',settings.locks[lockKey()]));changed();}
  $('width317').onchange=()=>sizeInput('w',+$('width317').value);$('boxHeight317').onchange=()=>sizeInput('h',+$('boxHeight317').value);
  $('center317').onclick=()=>{if(isBusy()||!dest())return;checkpoint();const r=dest();setDest({...r,x:(1-r.w)/2,y:(1-r.h)/2});changed();};
  // Keep the original inspector inputs consistent with the lock, including saved projects.
  for(const [id,key] of [['primaryw316','w'],['primaryh316','h'],['layerW','w'],['layerH','h']]){ $(id).oninput=null;$(id).onchange=()=>sizeInput(key,+$(id).value); }
  for(const b of handles){
    b.onpointerdown=e=>{
      if(isBusy()||e.button!==0)return;e.preventDefault();e.stopPropagation();video.pause();checkpoint();chooseRegion(b.dataset.area);
      const y=e.clientY,base=structuredClone(settings),h=$('framing').getBoundingClientRect().height,key=b.dataset.area,initial=key==='cam1'?settings.vertical.top:settings.vertical.bottom;b.setPointerCapture(e.pointerId);
      b.onpointermove=m=>{if(isBusy())return;adjustHeight(key,initial+(m.clientY-y)/h*(key==='cam1'?1:-1));};
      b.onpointerup=b.onpointercancel=m=>{b.onpointermove=null;if(m.type==='pointercancel')settings=base;changed();};
    };
    b.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||isBusy())return;e.preventDefault();checkpoint();chooseRegion(b.dataset.area);const key=b.dataset.area,value=key==='cam1'?settings.vertical.top:settings.vertical.bottom;adjustHeight(key,value+(e.key==='ArrowDown'?.01:-.01)*(key==='cam1'?1:-1));};
  }
  outline.onpointerdown=e=>{
    const hit=e.target.closest('[data-corner],.move317');if(!hit||isBusy()||e.button!==0)return;e.preventDefault();e.stopPropagation();video.pause();previewing=false;
    if(formatMode==='composition'){video.currentTime=range().start;$('layerPhase').value='from';$('moveLayer').checked=false;}
    if(!dest())return;checkpoint();const r={...dest()},b=$('framing').getBoundingClientRect(),x=e.clientX,y=e.clientY,corner=hit.dataset.corner;
    outline.setPointerCapture(e.pointerId);outline.onpointermove=m=>{if(isBusy())return;const dx=(m.clientX-x)/b.width,dy=(m.clientY-y)/b.height;setDest(corner?C.resize(r,dx,dy,corner,settings.locks[lockKey()]):{...r,x:C.clamp(r.x+dx,0,Math.max(0,1-r.w)),y:C.clamp(r.y+dy,0,Math.max(0,1-r.h))});if(formatMode==='composition')syncLayerControls();drawPreview();};
    outline.onpointerup=outline.onpointercancel=m=>{outline.onpointermove=null;if(m.type==='pointercancel')setDest(r);changed();};
  };
  function fitViewers(){
    if(fitting)return;fitting=true;
    try {for(const [selector,target,w,h,scale] of [['#sourcePane .canvasWell',$('stage'),video.videoWidth||16,video.videoHeight||9,1],['#previewPane .canvasWell',frame,outputSize().w,outputSize().h,viewScale]]){
      const well=document.querySelector(selector);if(!well||well.clientWidth<1||well.clientHeight<1)continue;
      const width=Math.max(1,Math.min(well.clientWidth-24,(well.clientHeight-24)*w/h));target.style.width=width+'px';target.style.height=width*h/w+'px';
      target.style.transform=target===frame?`translate(${viewPan.x}px,${viewPan.y}px) scale(${scale})`:'';
    }}finally{fitting=false;}
  }
  function zoomView(n){viewScale=C.clamp(n,.5,2);if(viewScale<=1)viewPan={x:0,y:0};$('viewFit317').textContent=viewScale===1?'Ajustar':Math.round(viewScale*100)+'%';fitViewers();}
  $('viewIn317').onclick=()=>zoomView(viewScale+.25);$('viewOut317').onclick=()=>zoomView(viewScale-.25);$('viewFit317').onclick=()=>{viewPan={x:0,y:0};zoomView(1);};
  for(const id of ['viewIn317','viewOut317','viewFit317'])$(id).title='Só amplia a visualização. A resolução e o enquadramento do MP4 não mudam. Arraste com o botão do meio para navegar quando ampliado.';
  const well=document.querySelector('#previewPane .canvasWell');well.addEventListener('pointerdown',e=>{if(e.button!==1||viewScale<=1)return;e.preventDefault();e.stopPropagation();const x=e.clientX,y=e.clientY,p={...viewPan};well.setPointerCapture(e.pointerId);well.onpointermove=m=>{viewPan={x:C.clamp(p.x+m.clientX-x,-well.clientWidth,well.clientWidth),y:C.clamp(p.y+m.clientY-y,-well.clientHeight,well.clientHeight)};fitViewers();};well.onpointerup=well.onpointercancel=()=>well.onpointermove=null;},true);
  well.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();e.stopImmediatePropagation();zoomView(viewScale+(e.deltaY<0?.25:-.25));}},{capture:true,passive:false});
  let syncStamp='';
  function sync(){
    const s=outputSize(),key=activeKey(),short=formatMode==='short',cam=short&&key!=='content',r=short?shortSlots(1,1).find(x=>x.key===key):dest(),name=formatMode==='wide'?'Vídeo principal':regionLabel(key),f=activeFit();
    const keys=formatMode==='wide'?['content']:shortSlots(1,1).map(x=>x.key),stamp=formatMode+keys.join();
    if(syncStamp!==stamp){$('area317').replaceChildren(...keys.map(k=>new Option(formatMode==='wide'?'Vídeo principal':regionLabel(k),k)));syncStamp=stamp;}
    $('area317').value=key;$('areaName317').textContent=name;$('areaLabel317').hidden=formatMode==='wide';
    $('contain317').setAttribute('aria-pressed',String(f==='contain'));$('cover317').setAttribute('aria-pressed',String(f==='cover'));
    $('fitHelp317').textContent=f==='contain'?'Mostra toda a seleção, sem esticar. Pode sobrar espaço.':'Ocupa a área sem esticar. As bordas excedentes são cortadas.';
    $('cameraHeightRow317').hidden=!cam;$('transformRow317').hidden=short;$('natural317').hidden=short&&!cam;
    if(cam){const n=key==='cam2'?settings.vertical.bottom:settings.vertical.top;$('height317').max=String((+$('cameraCount').value===2?.9-settings.vertical[key==='cam2'?'top':'bottom']:.82)*100);$('height317').value=n*100;$('heightValue317').textContent=Math.round(n*100)+'%';}
    $('lock317').checked=settings.locks[lockKey()];$('assetAspect317').checked=settings.locks.media;
    if(r){for(const [id,k]of [['width317','w'],['boxHeight317','h']])if(document.activeElement!==$(id))$(id).value=(r[k]*100).toFixed(1);$('areaSize317').textContent='Área: '+Math.round(r.w*s.w)+' × '+Math.round(r.h*s.h)+' px · Saída: '+s.w+' × '+s.h;}
    $('layoutHint317').textContent=short?'Marque cada área no Original. Arraste ↕ no Resultado para ajustar a divisão.':'Arraste as alças no Resultado para redimensionar. ✥ move a área.';
    const active=grid.dataset.tool==='layout'&&!isBusy()&&!placingCaption,clean=$('cleanOriginal').getAttribute('aria-pressed')==='true';
    boundary.hidden=!active||!short||clean;
    for(const b of handles){const enabled=+$('cameraCount').value>=(b.dataset.area==='cam1'?1:2);b.hidden=!enabled;const y=b.dataset.area==='cam1'?settings.vertical.top:1-settings.vertical.bottom;b.style.top=y*100+'%';}
    outline.hidden=!active||short||!r||clean||!video.paused||(formatMode==='composition'&&compositionSelection==='background');
    if(!outline.hidden){const visual=formatMode==='composition'?ClipComposition.rect(layer(),Math.max(0,video.currentTime-Number($('start').value))):r;Object.assign(outline.style,{left:visual.x*100+'%',top:visual.y*100+'%',width:visual.w*100+'%',height:visual.h*100+'%'});outline.querySelector('span').textContent=name;outline.classList.toggle('compact317',visual.w*$('framing').getBoundingClientRect().width<140);outline.querySelector('.move317').title='Mover '+name;}
    document.querySelector('.primaryTransform316').hidden=true;
    $('focusPreview').textContent=document.querySelector('.previewDock').classList.contains('resultOnly')?'Original + resultado':'Só resultado';const mobileSource=document.querySelector('.previewDock').classList.contains('mobileSource316');document.querySelectorAll('.mobileView316 button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===0?mobileSource:!mobileSource)));
  }
  function restore(value,legacy){
    if(value)settings=C.normalize(value);
    else if(legacy){const n=C.clamp(Number(legacy.cameraHeight||28)/100,.08,.45);settings=C.normalize({vertical:{top:n,bottom:n,fits:{cam1:'cover',cam2:'cover',content:legacy.contentContain?'contain':'cover'}}});}
    else settings=C.normalize();
  }
  const snapshot=()=>({settings:structuredClone(settings),composition:structuredClone(composition),fit:$('fit').value});
  const restoreSnapshot=s=>{restore(s.settings);composition=structuredClone(s.composition);$('fit').value=s.fit;changed();};
  window.clipaLayout317={serialize:()=>structuredClone(settings),restore,snapshot,restoreSnapshot,fit,fitViewers,sync,zoomView,get viewScale(){return viewScale;}};
  const stamp=projectStamp;projectStamp=()=>JSON.stringify({base:stamp(),layout317:settings});
  const draw=drawPreview;drawPreview=(...args)=>{fitViewers();draw(...args);sync();};
  const open=openEditor;openEditor=async(...args)=>{restore();viewPan={x:0,y:0};zoomView(1);await open(...args);changed();};
  const select=clipaSelectPanel;clipaSelectPanel=(...args)=>{select(...args);sync();fitViewers();};
  const format=setFormat;setFormat=(...args)=>{format(...args);viewPan={x:0,y:0};zoomView(1);sync();};
  const clean=$('cleanOriginal').onclick;$('cleanOriginal').onclick=()=>{clean();drawPreview();};
  const oldHeight=$('cameraHeight').oninput;$('cameraHeight').oninput=()=>{settings.vertical.top=settings.vertical.bottom=C.clamp(+$('cameraHeight').value/100,.08,.45);oldHeight();changed();};
  $('contentContain').onchange=()=>{settings.vertical.fits.content=$('contentContain').checked?'contain':'cover';drawPreview();};
  for(const [id,tip]of Object.entries({natural317:'Usa a proporção real da área marcada no original. No vertical, a altura é limitada para reservar espaço ao vídeo.',lock317:'Preserva a relação entre largura e altura ao usar as alças ou campos de tamanho.',height317:'Muda a altura desta câmera no vídeo exportado. A outra câmera mantém sua própria altura.',contain317:'Mostra toda a área selecionada com a proporção original, sem distorção.',cover317:'Preenche a área com a proporção original, cortando o excesso.'})){$(id).title=tip;$(id).dataset.help=tip;}
  document.body.classList.add('app317');document.querySelector('.homeBrand small').textContent='STUDIO / 3.17';document.querySelector('.footerBrand').textContent='CLIPA 3.17 · LOCAL';
  new ResizeObserver(()=>{fitViewers();}).observe(document.querySelector('.previewDock'));
  sync();
})();
