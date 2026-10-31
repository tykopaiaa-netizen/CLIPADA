'use strict';
let desktopSelecting=false;
window.clipaCaptureLog=[];
function captureLog(stage,result,error){
 const item={time:new Date().toISOString(),stage,result};
 if(error){item.code=error.name||'Error';item.message=error.message||String(error);}
 window.clipaCaptureLog.push(item);if(window.clipaCaptureLog.length>40)window.clipaCaptureLog.shift();
}
function releaseCapture(stream){
 try{stream?.clipaCleanup?.();}catch{}
 for(const track of stream?.getTracks?.()||[])try{track.stop();}catch{}
}
// Revoking a pending browser request is not supported. Stop any stream arriving after cancellation.
function captureStep(promise,stage,signal,timeout=20000,dispose=()=>{}){
 captureLog(stage,'starting');
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(error,value)=>{
   if(settled){if(!error)dispose(value);return;}
   settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
   captureLog(stage,error?'error':'ready',error);error?reject(error):resolve(value);
  };
  const abort=()=>finish(new DOMException('Preparação da gravação cancelada.','AbortError'));
  const timer=setTimeout(()=>finish(new DOMException(stage+' não respondeu em '+Math.round(timeout/1000)+' segundos.','TimeoutError')),timeout);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error));
 });
}
function captureErrorMessage(error,stage){
 let help='Tente novamente. Se continuar, salve o diagnóstico abaixo.';
 if(stage==='Microfone')help='Confira o microfone escolhido e a permissão para aplicativos de desktop em Configurações do Windows → Privacidade e segurança → Microfone. Para gravar sem sua voz, desmarque “Meu microfone” e tente novamente.';
 else if(stage==='Áudio do computador')help='Selecione a tela inteira e confira se o som do seu amigo sai pelo dispositivo de reprodução padrão do Windows. Para gravar sem esse som, desmarque “Áudio do computador” e tente novamente.';
 else if(stage==='Captura da tela')help='Clique em “Atualizar telas” e escolha a tela inteira. Se a janela foi fechada, selecione outra.';
 if(['NotReadableError','TrackStartError'].includes(error.name))help='O dispositivo está ocupado ou o driver não respondeu. Feche outros gravadores, reconecte o microfone e teste novamente. Nenhuma outra entrada será escolhida sem você selecionar.';
 if(error.name==='NotFoundError')help='O dispositivo escolhido não está disponível. Atualize os microfones e selecione uma entrada conectada.';
 if(error.name==='InvalidStateError')help='Clique novamente na tela desejada para renovar a autorização de captura.';
 return 'Não foi possível iniciar · '+stage+'. '+help+' Detalhe: '+(error.name||'Error')+' — '+(error.message||'Falha sem detalhes do sistema.');
}
async function desktopCaptureStream(fps){
 if(desktopSelecting)throw Error('A seleção de tela já está aberta.');desktopSelecting=true;
 window.clipaCaptureLog=[];
 const modal=document.createElement('dialog');modal.className='desktopPicker';modal.setAttribute('aria-labelledby','capturePickerTitle');
 const el=(tag,text,parent)=>{const node=document.createElement(tag);if(text)node.textContent=text;(parent||modal).append(node);return node;};
 const body=el('div');body.className='desktopPickerBody';
 el('h2','Escolha a tela e comece a gravar',body).id='capturePickerTitle';
 el('p','Ao clicar na miniatura, o Clipa conecta o áudio e inicia a gravação. Use fones para evitar eco. Para encerrar, clique em Parar ou aperte Ctrl + Shift + 9.',body);
 const audioBox=el('div',null,body);audioBox.className='desktopAudioOptions';
 const checkbox=(text,id)=>{const label=el('label',null,audioBox);label.className='check';const input=el('input',null,label);input.type='checkbox';input.checked=true;input.id=id;label.append(document.createTextNode(text));return input;};
 const system=checkbox('Áudio do computador / seu amigo','captureSystemAudio');
 const microphone=checkbox('Meu microfone','captureMicrophone');
 const deviceLabel=el('label','Microfone para sua voz',audioBox);
 const device=el('select',null,deviceLabel);device.id='captureMicrophoneDevice';device.setAttribute('aria-label','Microfone para sua voz');
 const def=el('option','Microfone padrão do Windows',device);def.value='';
 let prefs={};try{prefs=JSON.parse(localStorage.getItem('clipa-mic')||'{}');}catch{}
 const channelLabel=el('label','Entrada da interface de áudio',audioBox),channel=el('select',null,channelLabel);channel.id='captureMicrophoneChannel';
 for(const [value,text]of [['auto','Automática · entrada com sinal'],['left','Entrada 1 / esquerda'],['right','Entrada 2 / direita'],['both','Misturar entradas 1 e 2']]){const o=el('option',text,channel);o.value=value;}channel.value=prefs.channel||'auto';
 const testBox=el('div',null,audioBox);testBox.className='micTestBox';
 const test=el('button','Testar meu microfone',testBox);test.id='testMicrophone';
 const level=el('meter',null,testBox);level.min=0;level.max=1;level.value=0;level.setAttribute('aria-label','Nível do teste do microfone');
 const listen=el('button','Ouvir teste de 4 segundos',testBox);listen.disabled=true;
 const micStatus=el('p','Teste sua voz antes de gravar: a barra deve se mover. Use fones para evitar eco.',testBox);micStatus.id='microphoneTestStatus';
 let testEpoch=0;
 const profileLabel=el('label','Tratamento do microfone',audioBox),micProfile=el('select',null,profileLabel);micProfile.id='captureMicProfile';
 for(const [value,text]of [['raw','Fiel · sem redução de ruído'],['voice','Fala · reduzir ruído'],['speaker','Caixas de som · reduzir eco']]){const option=el('option',text,micProfile);option.value=value;}micProfile.value=['raw','voice','speaker'].includes(prefs.profile)?prefs.profile:'raw';
 for(let i=3;i<=8;i++){const option=el('option','Entrada '+i+' · interface multicanal',channel);option.value='input'+i;}channel.value=prefs.channel||'auto';
 const refreshMic=el('button','Atualizar microfones',audioBox);refreshMic.id='refreshMicrophones';
 const micDetails=el('p','O teste grava quatro segundos e libera o microfone ao terminar.',audioBox);micDetails.className='microphoneDetails';micDetails.id='microphoneDetails';
 let preparedMic=null,testMix=null,testClock=null,testRecorder=null,testBlob=null,testURL=null,lease=null,testTimer=null,testController=null,testBusy=false,testAudio=null;
 const startLease=()=>{window.clipaDesktop.microphone(true).catch(()=>{});clearInterval(lease);lease=setInterval(()=>window.clipaDesktop.microphone(true).catch(()=>{}),30000);};
 function stopTest(){testEpoch++;testController?.abort();testController=null;clearInterval(testClock);clearTimeout(testTimer);testClock=null;testAudio?.pause();testAudio=null;if(testRecorder?.state==='recording')testRecorder.stop();releaseCapture(testMix);testMix=null;releaseCapture(preparedMic);preparedMic=null;clearInterval(lease);lease=null;window.clipaDesktop.microphone(false).catch(()=>{});level.value=0;}
 async function listMicrophones(signal){const wanted=device.value||prefs.device||'';const devices=await captureStep(navigator.mediaDevices.enumerateDevices(),'Listar microfones',signal,3000);if(closed||signal?.aborted)return;device.replaceChildren(def);for(const item of devices.filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications')){const o=el('option',item.label||'Microfone '+device.options.length,device);o.value=item.deviceId;}if([...device.options].some(o=>o.value===wanted))device.value=wanted;else if(wanted){const missing=el('option','Microfone anterior desconectado · selecione outra entrada',device);missing.value=wanted;missing.disabled=true;missing.selected=true;micStatus.textContent='O dispositivo anterior não está disponível. Escolha um microfone e teste antes de gravar.';}}
 async function openMic(signal){
  startLease();await window.clipaDesktop.microphone(true);
  const selectedDevice=device.value;let stream;
  try{stream=await captureStep(navigator.mediaDevices.getUserMedia(ClipaStudioCore.micOptions(selectedDevice,micProfile.value,channel.value)),'Microfone',signal,15000,releaseCapture);}
  catch(error){if(signal?.aborted||!['OverconstrainedError','ConstraintNotSatisfiedError'].includes(error.name))throw error;captureLog('Compatibilidade do microfone','retry');stream=await captureStep(navigator.mediaDevices.getUserMedia(ClipaStudioCore.micOptions(selectedDevice,micProfile.value,channel.value,true)),'Microfone compatível',signal,15000,releaseCapture);}
  const settings=stream.getAudioTracks()[0]?.getSettings()||{};micDetails.textContent=(stream.getAudioTracks()[0]?.label||'Microfone conectado')+' · '+(settings.sampleRate?Math.round(settings.sampleRate/1000)+' kHz':'taxa definida pelo sistema')+' · '+(settings.channelCount||'?')+' canal(is). A mistura final usa 48 kHz.';
  try{await listMicrophones(signal);}catch{}
  if(signal?.aborted){releaseCapture(stream);throw new DOMException('Preparação cancelada.','AbortError');}
  try{localStorage.setItem('clipa-mic',JSON.stringify({device:device.value,channel:channel.value,gain:volumes.mic.value,profile:micProfile.value}));}catch{}
  return stream;
 }
 test.onclick=async()=>{
  if(working||closed||testBusy)return;stopTest();const epoch=testEpoch;testBlob=null;testBusy=true;test.disabled=true;device.disabled=channel.disabled=micProfile.disabled=true;grid.inert=true;listen.disabled=true;micStatus.textContent='Conectando microfone…';testController=new AbortController();const signal=testController.signal;
  try{preparedMic=await openMic(signal);if(closed||signal.aborted||epoch!==testEpoch){stopTest();return;}
   testMix=await createCaptureMix(new MediaStream(),preparedMic,{mic:Number(volumes.mic.value)/100,micChannel:channel.value},signal);
   const pieces=[],localRecorder=new MediaRecorder(testMix);testRecorder=localRecorder;let heard=false;
   localRecorder.ondataavailable=e=>{if(e.data.size)pieces.push(e.data);};
   localRecorder.onstop=()=>{if(closed||working||epoch!==testEpoch)return;testBlob=new Blob(pieces,{type:localRecorder.mimeType});stopTest();listen.disabled=!testBlob.size;micStatus.textContent=heard?'Teste concluído. Microfone liberado. Clique em Ouvir para conferir sua voz.':'Teste sem sinal: confira a entrada, o ganho físico e o microfone escolhido.';};
   localRecorder.onerror=e=>{if(epoch!==testEpoch)return;stopTest();micStatus.textContent='O teste falhou: '+(e.error?.message||'erro de gravação');};
   localRecorder.start();testTimer=setTimeout(()=>{if(localRecorder.state==='recording')localRecorder.stop();},4000);
   testClock=setInterval(()=>{const value=testMix?.clipaLevels().mic||0;level.value=value;if(value>.005)heard=true;micStatus.textContent=heard?'Sinal recebido. Gravando o teste de quatro segundos…':'Fale por alguns segundos…';},100);
  }catch(e){stopTest();if(!closed)micStatus.textContent=captureErrorMessage(e,'Microfone');}finally{testBusy=false;if(!closed){test.disabled=false;device.disabled=channel.disabled=micProfile.disabled=false;grid.inert=false;}}
 };
 listen.onclick=()=>{if(!testBlob)return;testAudio?.pause();if(testURL)URL.revokeObjectURL(testURL);testURL=URL.createObjectURL(testBlob);testAudio=new Audio(testURL);testAudio.play().catch(e=>micStatus.textContent=e.message);};
 for(const node of [device,channel,micProfile])node.onchange=()=>{stopTest();listen.disabled=true;micStatus.textContent='Dispositivo alterado. Clique em Testar meu microfone.';};
 const volumes={};
 for(const [name,label] of [['system','Volume do computador'],['mic','Volume do microfone']]){
  const row=el('label',label+' ',audioBox),input=el('input',null,row);input.type='range';input.min=0;input.max=200;input.value=100;input.setAttribute('aria-label',label);
  const out=el('output','100%',row);if(name==='mic')input.value=ClipaStudioCore.clamp(prefs.gain??100,0,200);out.textContent=input.value+'%';input.oninput=()=>{out.textContent=input.value+'%';testMix?.clipaGain(name,Number(input.value)/100);};volumes[name]=input;
 }
 const grid=el('div',null,body);grid.className='desktopSources';grid.setAttribute('aria-label','Telas e janelas disponíveis');
 const footer=el('div');footer.className='desktopPickerFooter';
 const message=el('p','Buscando telas e janelas…',footer);message.id='captureSetupStatus';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const actions=el('div',null,footer);actions.className='desktopPickerActions';
 const refresh=el('button','Atualizar telas',actions),retry=el('button','Tentar iniciar novamente',actions),cancel=el('button','Cancelar',actions),diagnostic=el('button','Salvar diagnóstico',actions);
 cancel.id='captureSetupCancel';retry.hidden=true;retry.className='primary';diagnostic.hidden=true;
 let closed=false,working=false,chosen=null,controller=null,activeStreams=[],listSerial=0;
 let resolveDone,rejectDone;
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
 const revoke=()=>{window.clipaDesktop.cancelCapture?.().catch(()=>{});};
 const clean=()=>{activeStreams.forEach(releaseCapture);activeStreams=[];};
 const lock=value=>{grid.inert=value;for(const node of audioBox.querySelectorAll('input,select,button'))node.disabled=value;refresh.disabled=value;retry.disabled=value;};
 const abort=()=>{
  if(closed)return;closed=true;controller?.abort();stopTest();clean();revoke();
  rejectDone(new DOMException('Preparação da gravação cancelada.','AbortError'));
 };
 cancel.onclick=abort;modal.oncancel=event=>{event.preventDefault();abort();};window.clipaCancelCaptureSetup=abort;
 diagnostic.onclick=()=>{
  const blob=new Blob([JSON.stringify({version:'3.12.0',capture:window.clipaCaptureLog},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Clipa-diagnostico-gravacao.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 async function connect(){
  if(working||closed||testBusy||!chosen)return;
  stopTest();working=true;lock(true);retry.hidden=true;diagnostic.hidden=true;message.classList.remove('captureError');
  controller=new AbortController();const signal=controller.signal;let stage='Autorizar tela';
  try{
   message.textContent='1 de 3 · Conectando a tela…';
   await captureStep(window.clipaDesktop.select({id:chosen,audio:system.checked}),stage,signal,8000);
   stage='Captura da tela';
   // Request display while the screen click is still the active user gesture. Never wait for the microphone first.
   const display=await captureStep(navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:fps,max:fps}},audio:system.checked?{echoCancellation:false,noiseSuppression:false,autoGainControl:false}:false,systemAudio:system.checked?'include':'exclude'}),stage,signal,20000,releaseCapture);
   activeStreams.push(display);
   if(!display.getVideoTracks().some(t=>t.readyState==='live'))throw Error('A tela selecionada não forneceu uma faixa de vídeo ativa.');
   if(system.checked&&!display.getAudioTracks().some(t=>t.readyState==='live')){stage='Áudio do computador';throw Error('O Windows não forneceu áudio do computador.');}
   let mic=null;
   if(microphone.checked){
    stage='Microfone';message.textContent='2 de 3 · Conectando seu microfone…';
    mic=await openMic(signal);activeStreams.push(mic);
    if(!mic.getAudioTracks().some(t=>t.readyState==='live'))throw Error('O microfone não forneceu áudio.');
   }
   stage='Mistura de áudio';message.textContent='3 de 3 · Preparando gravação'+(microphone.checked&&system.checked?' com as duas fontes de áudio':'')+'…';
   const mixed=await captureStep(createCaptureMix(display,mic,{system:Number(volumes.system.value)/100,mic:Number(volumes.mic.value)/100,micChannel:channel.value},signal),stage,signal,10000,releaseCapture);
   activeStreams.push(mixed);
   if(signal.aborted||closed){clean();return;}
   if(!mixed.getVideoTracks().some(t=>t.readyState==='live'))throw Error('A tela foi desconectada antes de iniciar. Selecione-a novamente.');
   const originalCleanup=mixed.clipaCleanup;mixed.clipaCleanup=()=>{originalCleanup();clearInterval(lease);lease=null;window.clipaDesktop.microphone(false).catch(()=>{});};
   mixed.clipaSourceId=chosen;mixed.clipaSources={system:!!display.getAudioTracks().length,microphone:!!mic?.getAudioTracks().length};
   mixed.addEventListener('clipa-audio-ended',()=>{const status=document.getElementById('status');if(status)status.textContent='Uma fonte de áudio foi desconectada. Pare a gravação e reconecte o dispositivo.';});
   closed=true;activeStreams=[];resolveDone(mixed);
  }catch(error){
   controller.abort();clean();stopTest();revoke();
   if(!closed){message.textContent=captureErrorMessage(error,stage);message.classList.add('captureError');retry.hidden=false;diagnostic.hidden=false;}
  }finally{working=false;if(!closed)lock(false);}
 }
 async function loadSources(){
  if(working||closed)return;const serial=++listSerial;refresh.disabled=true;chosen=null;retry.hidden=true;grid.replaceChildren();message.textContent='Buscando telas e janelas…';
  try{
   const sources=await captureStep(window.clipaDesktop.sources(),'Listar telas',null,15000);
   if(closed||serial!==listSerial)return;
   if(!sources.length)throw Error('Nenhuma tela disponível. Confira se o Windows está em uma sessão de desktop ativa.');
   for(const source of sources){
    const button=el('button',null,grid);button.className='desktopSource';button.title='Clique para gravar '+source.name;
    const img=el('img',null,button);img.src=source.thumbnail;img.alt='';el('span',source.name,button);el('small','Clique para iniciar',button);
    button.onclick=()=>{chosen=source.id;connect();};
   }
   message.classList.remove('captureError');message.textContent='Tudo pronto para escolher. Clique na tela ou janela que deseja gravar.';
  }catch(error){if(!closed){message.textContent=captureErrorMessage(error,'Listar telas');message.classList.add('captureError');diagnostic.hidden=false;}}
  finally{if(!closed&&serial===listSerial)refresh.disabled=false;}
 }
 refresh.onclick=loadSources;retry.onclick=connect;
 const devicesChanged=()=>{if(closed||working||testBusy)return;stopTest();testBlob=null;listen.disabled=true;listMicrophones().catch(e=>micStatus.textContent=e.message);micStatus.textContent='Dispositivos alterados. Confira a entrada e teste novamente.';};
 refreshMic.onclick=devicesChanged;navigator.mediaDevices.addEventListener('devicechange',devicesChanged);
 microphone.onchange=()=>{if(!microphone.checked){stopTest();listen.disabled=true;}};
 try{
  document.body.append(modal);modal.showModal();loadSources();
  listMicrophones().catch(()=>{});
  return await done;
 }finally{navigator.mediaDevices.removeEventListener('devicechange',devicesChanged);testAudio?.pause();if(testURL)URL.revokeObjectURL(testURL);modal.remove();desktopSelecting=false;window.clipaCancelCaptureSetup=null;}
}
