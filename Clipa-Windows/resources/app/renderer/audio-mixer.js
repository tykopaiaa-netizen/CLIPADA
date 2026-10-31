'use strict';
// One mixed audio track: MediaRecorder does not reliably mux two input tracks.
async function createCaptureMix(display,microphone,levels={system:1,mic:1},signal){
 const streams=[display,microphone].filter(Boolean),nodes=[],channels={};let context,destination,closed=false;
 let micTimer;
 const cleanup=()=>{
  clearInterval(micTimer);
  if(closed)return;closed=true;signal?.removeEventListener('abort',cleanup);
  streams.forEach(s=>s.getTracks().forEach(t=>t.stop()));
  destination?.stream.getTracks().forEach(t=>t.stop());
  nodes.forEach(n=>{try{n.disconnect();}catch{}});
  if(context)context.close().catch(()=>{});
 };
 try{
  if(signal?.aborted)throw new DOMException('Preparação cancelada.','AbortError');
  signal?.addEventListener('abort',cleanup,{once:true});
  const audio=streams.flatMap(s=>s.getAudioTracks());
  if(!audio.length){display.clipaCleanup=cleanup;return display;}
  context=new AudioContext({sampleRate:48000});
  await new Promise((resolve,reject)=>{
   const abort=()=>finish(new DOMException('Preparação cancelada.','AbortError'));
   const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
   const timer=setTimeout(()=>finish(new DOMException('O mixer de áudio não iniciou em 8 segundos.','TimeoutError')),8000);
   signal?.addEventListener('abort',abort,{once:true});
   context.resume().then(()=>finish(),finish);
  });
  if(closed||signal?.aborted)throw new DOMException('Preparação cancelada.','AbortError');
  if(context.state!=='running')throw Error('O dispositivo de áudio não iniciou. Confira a saída de som padrão do Windows.');
  destination=context.createMediaStreamDestination();const limiter=context.createDynamicsCompressor();
  limiter.threshold.value=-3;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.15;limiter.connect(destination);nodes.push(limiter);
  for(const [name,stream] of [['system',display],['mic',microphone]]){
   if(!stream?.getAudioTracks().length)continue;
   const source=context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())),gain=context.createGain(),meter=context.createAnalyser();
   gain.gain.value=Math.min(2,Math.max(0,Number(levels[name]??1)||0));if(name==='mic'){const mode=levels.micChannel||'auto',requested=mode.startsWith('input')?Number(mode.slice(5)):mode==='right'?2:1,available=stream.getAudioTracks()[0].getSettings().channelCount;if(available&&requested>available)throw Error('Entrada '+requested+' não disponível: este dispositivo fornece '+available+' canal(is). Escolha Automática.');}meter.fftSize=512;if(name==='mic'&&stream.getAudioTracks()[0].getSettings().channelCount!==1){
    const count=Math.max(2,Math.min(8,stream.getAudioTracks()[0].getSettings().channelCount||2)),split=context.createChannelSplitter(count),gains=Array.from({length:count},()=>context.createGain()),meters=Array.from({length:count},()=>context.createAnalyser());source.connect(split);
    gains.forEach((g,i)=>{g.gain.value=0;split.connect(g,i);g.connect(gain);split.connect(meters[i],i);meters[i].fftSize=512;});
    const data=new Float32Array(512);let chosen=0;
    const route=()=>{const mode=levels.micChannel||'auto',rms=meters.map(m=>{m.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((s,x)=>s+x*x,0)/data.length);});
     if(mode==='auto'&&Math.max(...rms)>.0001){const next=rms.indexOf(Math.max(...rms));if(rms[next]>rms[chosen]*1.4)chosen=next;}
     const selected=mode.startsWith('input')?Number(mode.slice(5))-1:mode==='right'?1:mode==='left'?0:chosen;
     gains.forEach((g,i)=>g.gain.setTargetAtTime(mode==='both'?(i<2?.5:0):i===selected?1:0,context.currentTime,.02));};
    route();micTimer=setInterval(route,100);nodes.push(split,...gains,...meters);
   }else source.connect(gain);gain.connect(meter);meter.connect(limiter);nodes.push(source,gain,meter);channels[name]={gain,meter};
  }
  const result=new MediaStream([...display.getVideoTracks(),...destination.stream.getAudioTracks()]);
  result.clipaCleanup=cleanup;
  result.clipaGain=(name,value)=>{if(channels[name])channels[name].gain.gain.setTargetAtTime(Math.max(0,Math.min(2,Number(value)||0)),context.currentTime,.015);};
  result.clipaLevels=()=>Object.fromEntries(Object.entries(channels).map(([name,{meter}])=>{const data=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(data);return [name,Math.min(1,Math.sqrt(data.reduce((a,x)=>a+x*x,0)/data.length)*3)];}));
  for(const track of audio)track.addEventListener('ended',()=>result.dispatchEvent(new CustomEvent('clipa-audio-ended',{detail:track.label})),{once:true});
  display.getVideoTracks().forEach(t=>t.addEventListener('ended',result.clipaCleanup,{once:true}));
  return result;
 }catch(e){cleanup();throw e;}
}
