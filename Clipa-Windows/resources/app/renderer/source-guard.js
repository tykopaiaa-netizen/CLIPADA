'use strict';
(() => {
 const base=openEditor;let importing=false;
 openEditor=async(blob,...args)=>{
  if(importing||isBusy()||recorder?.state==='recording')throw Error('Aguarde a tarefa atual antes de abrir outro vídeo.');
  if(!(blob instanceof Blob)||!blob.size)throw Error('Arquivo vazio. Escolha um vídeo válido.');
  if(blob.size>100_000_000_000)throw Error('O limite de entrada é 100 GB. Divida o arquivo antes de importar.');
  importing=true;window.clipaImporting=true;const url=URL.createObjectURL(blob),probe=document.createElement('video');probe.muted=true;probe.preload='auto';
  const disabled=[...document.querySelectorAll('main input,main button')].map(el=>[el,el.disabled]);for(const [el]of disabled)el.disabled=true;
  const editorInert=$('editor').inert;$('editor').inert=true;$('modelPicker').inert=true;notifyDesktopState();
  try{const loaded=once(probe,'loadeddata');probe.src=url;probe.load();await loaded;if(!probe.videoWidth||!probe.videoHeight)throw Error('Arquivo sem imagem de vídeo.');await base(blob,...args);}
  catch(e){throw Error(e.message+' Se o formato não abrir, converta para MP4 com vídeo H.264 e áudio AAC.');}
  finally{probe.pause();probe.removeAttribute('src');probe.load();URL.revokeObjectURL(url);importing=false;window.clipaImporting=false;$('editor').inert=editorInert;$('modelPicker').inert=false;for(const [el,value]of disabled)el.disabled=value;notifyDesktopState();}
 };
})();
