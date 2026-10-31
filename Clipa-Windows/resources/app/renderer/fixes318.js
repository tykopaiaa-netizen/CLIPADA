'use strict';
(() => {
 const make=(tag,cls,html)=>{const e=document.createElement(tag);e.className=cls||'';if(html)e.innerHTML=html;return e;};
 const sourceKeys=()=>formatMode==='wide'?['content']:shortSlots(1,1).map(s=>s.key);
 const sourceName=k=>k==='content'?(formatMode==='wide'?'Vídeo principal':'Vídeo'):k==='cam2'?'Câmera inferior':'Câmera';
 const chosen=()=>document.querySelector('.editorgrid').dataset.tool==='media'&&clipaMedia.selected?'media:'+clipaMedia.selected:'source:'+(formatMode==='wide'?'content':regionKey);
 const stacks=[];
 function reorder(id,action){if(isBusy())return;const s=clipaMedia.serialize();const order=ClipaLayers.visible(s,sourceKeys()),at=order.indexOf(id);if(at<0)return;if((action==='back'||action==='down')&&at===0||(action==='front'||action==='up')&&at===order.length-1)return;clipaTimeline.checkpoint();if(ClipaLayers.move(s,sourceKeys(),id,action)){clipaMedia.changed();refreshReady();clipaCameraBg.refreshStatus();}}
 for(const tool of ['layout','media']){
  const box=make('details','sceneStack318','<summary>Ordem no resultado</summary><p>O item de cima aparece na frente. O fundo fixo fica abaixo de todos.</p><div class="stackRows318"></div><div class="stackActions318"><button data-order="back" title="Enviar a camada selecionada para trás de todas as outras">Ao fundo</button><button data-order="down" title="Descer uma camada" aria-label="Descer uma camada">↓</button><button data-order="up" title="Subir uma camada" aria-label="Subir uma camada">↑</button><button data-order="front" title="Trazer a camada selecionada para a frente de todas as outras">À frente</button></div>');
  box.open=tool==='media';if(tool==='layout')document.querySelector('.layoutPanel317').after(box);else $('assetPanel314').before(box);
  box.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>reorder(chosen(),b.dataset.order));stacks.push(box);
 }
 function drawStacks(){
  const s=clipaMedia.serialize(),order=ClipaLayers.visible(s,sourceKeys()),id=chosen();
  const stamp=JSON.stringify([isBusy(),formatMode,order,id,s.items.map(a=>[a.id,a.name,a.hidden]),backgroundImage!=null]);
  for(const box of stacks){if(box.dataset.stamp===stamp)continue;box.dataset.stamp=stamp;const rows=box.querySelector('.stackRows318');rows.replaceChildren();
   for(const key of [...order].reverse()){
    const a=key.startsWith('media:')?s.items.find(a=>a.id===key.slice(6)):null,b=make('button','stackRow318');b.dataset.layer=key;b.setAttribute('aria-pressed',String(key===id));
    const name=make('span'),hint=make('small');name.textContent=a?a.name:sourceName(key.slice(7));hint.textContent=a?(a.hidden?'Oculto':a.kind==='image'?'Imagem':'Vídeo'):'Original';b.append(name,hint);
    b.onclick=()=>{if(isBusy())return;if(a)clipaMedia.select(a.id);else{clipaSelectPanel('layout');if(formatMode!=='wide')formatMode==='composition'?selectComposition(key.slice(7)):chooseRegion(key.slice(7));}drawPreview();};rows.append(b);
   }
   const label=make('div','stackBase318');label.textContent=backgroundImage?'▧ Imagem de fundo fixa':'▧ Cor de fundo';rows.append(label);
   const at=order.indexOf(id);for(const b of box.querySelectorAll('[data-order]'))b.disabled=isBusy()||at<0||(['back','down'].includes(b.dataset.order)?at===0:at===order.length-1);
  }
 }
 const asset=()=>clipaMedia.serialize().items.find(a=>a.id===clipaMedia.selected);
 $('assetBack316').textContent='Ao fundo';$('assetBack316').title='Coloca esta mídia atrás do vídeo e das câmeras.';$('assetBack316').onclick=()=>{const a=asset();if(a)reorder('media:'+a.id,'back');};
 $('assetFront314').textContent='À frente';$('assetFront314').title='Coloca esta mídia acima do vídeo, das câmeras e das outras mídias.';$('assetFront314').onclick=()=>{const a=asset();if(a)reorder('media:'+a.id,'front');};
 const background=make('button','','Usar como fundo');background.id='assetBackground318';background.title='Preenche a saída com esta imagem e coloca a camada atrás do vídeo e das câmeras. Você ainda pode editar sua duração e seu tamanho.';$('imageFields314').append(background);
 background.onclick=()=>{const a=asset();if(!a||isBusy())return;clipaTimeline.checkpoint();a.rect={x:0,y:0,w:1,h:1};a.fit='cover';ClipaLayers.move(clipaMedia.serialize(),sourceKeys(),'media:'+a.id,'back');clipaMedia.changed();clipaMedia.syncPanel();};
 const position=make('p','layerPosition318');$('imageFields314').prepend(position);
 function syncPosition(){const a=asset();if(!a){position.textContent='';return;}const order=ClipaLayers.visible(clipaMedia.serialize(),sourceKeys()),i=order.indexOf('media:'+a.id),base=order.filter(x=>x.startsWith('source:')),n=base.filter(k=>order.indexOf(k)<i).length;position.textContent=n===0?'Atrás do vídeo e das câmeras.':n===base.length?'À frente do vídeo e das câmeras.':'Entre as áreas do vídeo original.';}
 const camera=document.querySelector('.cameraAI');document.querySelector('.aiQuick315').after(camera);camera.querySelector('summary').textContent='Ajustar fundo da câmera';
 const quickBg=make('div','quickBg318','<button id="quickBg318">Remover fundo</button><button id="bgOptions318" title="Ajustar bordas e comparar com o original" aria-label="Ajustar remoção de fundo">⚙</button><p id="quickBgStatus318" class="micro317" role="status"></p>');$('areaLabel317').after(quickBg);
 const controls=make('div','maskActions318','<button id="recalculateBg318">Recalcular quadro</button><button id="restoreBg318">Restaurar fundo</button><button id="compareBg318" title="Segure para ver a câmera sem o filtro">Segurar: original</button><button id="cancelBg318" hidden>Cancelar análise</button>');camera.append(controls);const cleanup=make('label','check','<input id="maskCleanup318" type="checkbox" checked> Limpar pequenos resíduos');cleanup.title='Remove pontos pequenos e isolados do recorte. Desative se sumir algum detalhe fino.';controls.before(cleanup);$('maskCleanup318').onchange=drawPreview;
 $('cameraAIStatus').setAttribute('role','status');$('cameraAIStatus').setAttribute('aria-live','polite');
 $('cameraRemove315').querySelector('small').textContent='Aplica agora nas áreas de câmera marcadas no Original.';
 $('cameraRemove315').onclick=async()=>{if(isBusy())return;clipaSelectPanel('layout');camera.open=true;await clipaCameraBg.enable();};
 $('quickBg318').onclick=()=>clipaCameraBg.enable();$('bgOptions318').onclick=()=>{camera.open=true;camera.scrollIntoView({block:'nearest'});};
 $('recalculateBg318').onclick=()=>clipaCameraBg.enable();$('restoreBg318').onclick=()=>{if(!isBusy())clipaCameraBg.disable();};
 $('cancelBg318').onclick=()=>{clipaCameraBg.disable();maskStatus318('Remoção cancelada. A câmera original foi preservada.');};
 const cancel=$('cancelAI').onclick;$('cancelAI').onclick=()=>{if(clipaCameraBg.busy)$('cancelBg318').click();else cancel();};
 const compare=$('compareBg318');compare.onpointerdown=e=>{if(isBusy()||!$('removeCameraBg').checked)return;e.preventDefault();compare.setPointerCapture(e.pointerId);clipaCameraBg.compare(true);};compare.onpointerup=compare.onpointercancel=()=>clipaCameraBg.compare(false);compare.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();clipaCameraBg.compare(true);}};compare.onkeyup=compare.onblur=()=>clipaCameraBg.compare(false);
 $('segmentQuality').onchange=()=>{if(isBusy())return;clipaCameraBg.invalidate(true);if($('removeCameraBg').checked)clipaCameraBg.enable();};
 // Changing project or crop must never reuse another source's segmentation result.
 const open=openEditor;openEditor=async(...args)=>{clipaCameraBg.invalidate(true);await open(...args);maskStatus318('Marque a câmera no Original e aplique o filtro.');drawStacks();};
 const preview=drawPreview;drawPreview=(...args)=>{preview(...args);drawStacks();syncPosition();clipaCameraBg.refreshStatus();quickBg.hidden=formatMode==='wide'||regionKey==='content';$('quickBg318').textContent=$('removeCameraBg').checked?'Recalcular recorte':'Remover fundo';$('quickBg318').title=$('removeCameraBg').checked?'IA aplicada. Recalcule se ajustar a área da pessoa.':'Aplica a remoção de fundo nas áreas de câmera marcadas.';};
 const select=clipaSelectPanel;clipaSelectPanel=(...args)=>{select(...args);drawStacks();syncPosition();};
 window.clipaLayerUI318={cameraCovered(){const s=clipaMedia.serialize(),order=ClipaLayers.visible(s,sourceKeys());return cameraKeys().some(key=>{const camera=shortSlots(1,1).find(x=>x.key===key);if(!camera)return false;return s.items.some(a=>{if(a.kind==='sound'||a.hidden||a.opacity<.8||video.currentTime<a.start||video.currentTime>=a.end||order.indexOf('media:'+a.id)<order.indexOf('source:'+key))return false;const r=a.rect,area=Math.max(0,Math.min(r.x+r.w,camera.x+camera.w)-Math.max(r.x,camera.x))*Math.max(0,Math.min(r.y+r.h,camera.y+camera.h)-Math.max(r.y,camera.y));return area>camera.w*camera.h*.85;});});},reorder,order:()=>ClipaLayers.visible(clipaMedia.serialize(),sourceKeys()),draw:drawStacks};
 const stamp=projectStamp;projectStamp=()=>stamp()+JSON.stringify({maskCleanup318:$('maskCleanup318').checked});
 document.body.classList.add('app318');document.querySelector('.homeBrand small').textContent='STUDIO / 3.18';document.querySelector('.footerBrand').textContent='CLIPA 3.18 · LOCAL';drawStacks();
})();
