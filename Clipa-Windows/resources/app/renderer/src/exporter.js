import {exportDesktop} from './desktop-export.js';
import '../edit-core315.js';
import {prepareMixedAudio,prepareEditedAudio} from './audio-timeline.js';
import {LocalWorker} from './local-worker.js';
import {registerSoftwareEncoder} from './software-encoder.js';
import {registerAacEncoder} from '@mediabunny/aac-encoder';
let aacRegistered=false;
import {Input,ALL_FORMATS,BlobSource,BufferSource,EncodedAudioPacketSource,EncodedPacketSink,VideoSampleSink,AudioSampleSink,AudioSample,Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioSampleSource,Quality,canEncodeAudio,canEncodeVideo} from 'mediabunny';
const makeInput=blob=>new Input({formats:ALL_FORMATS,source:new BlobSource(blob,{useStreamReader:false})});
export async function inspectAudio(blob){const input=makeInput(blob);try{const track=await input.getPrimaryAudioTrack();return {hasAudio:!!track,duration:await input.computeDuration()};}finally{input.dispose();}}
export async function inspectMedia(blob){const input=makeInput(blob);try{const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('Arquivo sem vídeo.');const stats=await track.computePacketStats(120);return {fps:stats.averagePacketRate,hasAudio:!!await input.getPrimaryAudioTrack(),duration:await track.computeDuration()};}finally{input.dispose();}}
export async function exportClip({blob,width,height,fps,bitrate,start,end,render,progress,cancelled,hardwareAcceleration='no-preference',codec='avc',engine='auto',audioEdit={},speed=1,removed=[]}){
 if(globalThis.clipaDesktop?.io)return exportDesktop({blob,width,height,fps,bitrate,start,end,render,progress,cancelled,hardwareAcceleration,codec,engine,audioEdit,speed,removed});
 if(!Number.isFinite(speed)||speed<.25||speed>4)throw Error('Velocidade deve ser entre 0,25× e 4×.');const editPlan=globalThis.ClipaEditCore.plan(start,end,removed,speed),outputDuration=editPlan.duration,hasCuts=removed.some(r=>r.end>start&&r.start<end);if(outputDuration<1/fps)throw Error('Nenhum quadro mantido. Restaure um trecho.');const sourceTime=t=>globalThis.ClipaEditCore.sourceAt(editPlan,t,speed);const mixedRoute=hasCuts||!!audioEdit.media?.length||globalThis.ClipaAudioCore.changed(audioEdit.studio)||speed!==1||audioEdit.fadeIn>0||audioEdit.fadeOut>0||!!audioEdit.narration?.enabled;
 const input=makeInput(blob);let output,local,audioInput,editInput,mixed;let firefox=engine==='cpu';const check=()=>{if(cancelled())throw new Error('Cancelado');};
 try{
  progress(0,'Verificando vídeo e codecs…');check();registerSoftwareEncoder(false);const nativeTrack=await input.getPrimaryVideoTrack();if(!nativeTrack)throw Error('Arquivo sem vídeo.');editInput=audioEdit.blob?makeInput(audioEdit.blob):null;const audioOwner=editInput||input;const nativeAudio=await audioOwner.getPrimaryAudioTrack();const nativeOK=await canEncodeVideo(codec,{width,height,bitrate,frameRate:fps,hardwareAcceleration})&&await nativeTrack.canDecode()&&(!nativeAudio||await nativeAudio.canDecode());firefox=engine==='cpu'||(engine==='auto'&&!nativeOK);if(engine==='native'&&!nativeOK)throw Error('Preset ou mídia não suportado pelo motor nativo. Escolha CPU compatível ou Automático.');if(Math.max(width,height)>4096&&(firefox||hardwareAcceleration==='prefer-software'))throw Error('Acima de 4K exige codificador nativo compatível. Use motor Nativo e verifique o suporte, ou reduza para 4K/1080p.');if(firefox&&codec!=='avc')throw Error('No Firefox, use H.264 com renderização local por CPU.');
  registerSoftwareEncoder(codec==='avc'&&(firefox||hardwareAcceleration==='prefer-software'),cancelled);
  if(firefox){if(blob.size>256*1024*1024)throw Error('O modo CPU aceita arquivos de até 256 MB. Para lives maiores, use o aplicativo Windows ou um navegador com suporte nativo ao arquivo.');local=new LocalWorker(cancelled);await local.call({type:'init'});check();const buffer=await blob.arrayBuffer();await local.call({type:'prepare',buffer},[buffer]);}
  if(!await canEncodeVideo(codec,{width,height,bitrate,frameRate:fps,hardwareAcceleration}))throw new Error('Este codec/preset não é suportado neste navegador ou equipamento. Use H.264, renderização Automática, 720p e 30 fps.');
  progress(0,"Verificando decodificação do vídeo…");
  const track=await input.getPrimaryVideoTrack();if(!track||(!firefox&&!await track.canDecode()))throw new Error('Este vídeo não pode ser decodificado pelo navegador.');
  const audioTrack=await (editInput||input).getPrimaryAudioTrack();let audioCodec,channels;
  progress(0,"Verificando decodificação do áudio…");
  if(mixedRoute){mixed=await (hasCuts?prepareEditedAudio:prepareMixedAudio)({blob,start,end,speed,audioEdit,cancelled,progress,plan:editPlan});}
  if((audioTrack&&!firefox&&!mixedRoute)||mixed){
   if(!mixed&&!await audioTrack.canDecode())throw new Error('O navegador não consegue decodificar o áudio desta gravação. O original foi preservado.');
   progress(0,'Verificando codificador de áudio…');
   channels=mixed?2:Math.min(2,await audioTrack.getNumberOfChannels());
   audioCodec='aac';
   if(!await canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:channels,bitrate:320000})&&!aacRegistered){registerAacEncoder();aacRegistered=true;}
   if(!await canEncodeAudio(audioCodec,{sampleRate:48000,numberOfChannels:channels,bitrate:320000}))throw new Error('Não há codificador de áudio compatível.');
  }
  if(audioTrack&&firefox&&!mixedRoute){progress(0,'Preparando áudio AAC local…');if(audioEdit.blob){if(audioEdit.blob.size>256*1024*1024)throw Error('Áudio externo excede 256 MB no modo CPU.');const buffer=await audioEdit.blob.arrayBuffer();await local.call({type:'prepareAudio',buffer},[buffer]);}const result=await local.call({type:'audio',start,duration:end-start,useExternal:!!audioEdit.blob,gain:audioEdit.gain??1,mutes:audioEdit.mutes||[],effects:audioEdit.effects||[]});audioInput=new Input({formats:ALL_FORMATS,source:new BufferSource(result.buffer)});audioCodec='aac';}
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const source=document.createElement('canvas'),sourceCtx=source.getContext('2d',{alpha:false}),ctx=canvas.getContext('2d',{alpha:false});
  output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
  const videoSource=new CanvasSource(canvas,{codec,quality:new Quality({bitrate}),keyFrameInterval:2,hardwareAcceleration,latencyMode:'quality'});output.addVideoTrack(videoSource,{frameRate:fps});
  let audioSource;if(mixed){audioSource=new AudioSampleSource({codec:'aac',quality:new Quality({bitrate:320000}),transform:{sampleRate:48000,numberOfChannels:2}});output.addAudioTrack(audioSource);}else if(audioTrack&&firefox&&!mixedRoute){audioSource=new EncodedAudioPacketSource('aac');output.addAudioTrack(audioSource);}else if(audioTrack&&!mixedRoute){audioSource=new AudioSampleSource({codec:audioCodec,quality:new Quality({bitrate:320000}),transform:{sampleRate:48000,numberOfChannels:channels}});output.addAudioTrack(audioSource);}
  progress(0,"Iniciando arquivo…");await output.start();check();
  progress(0,"Decodificando áudio…");
  if(audioSource&&firefox&&!mixedRoute){const at=await audioInput.getPrimaryAudioTrack(),decoderConfig=await at.getDecoderConfig();for await(const packet of new EncodedPacketSink(at).packets()){check();await audioSource.add(packet,{decoderConfig});}audioSource.close();}
  if(audioSource&&!firefox&&!mixedRoute){
   const audioSink=new AudioSampleSink(audioTrack);let batch=0;
   for await(const sample of audioSink.samples(Math.max(0,start-.1),end)){
    try{
     if(batch===0)progress(0,'Codificando primeiro bloco de áudio…');
     check();const from=Math.max(0,Math.ceil((start-sample.timestamp)*sample.sampleRate)),to=Math.min(sample.numberOfFrames,Math.ceil((end-sample.timestamp)*sample.sampleRate));
     if(to>from){const trimmed=sample.trim(from,to);try{const absolute=trimmed.timestamp;trimmed.setTimestamp(Math.max(0,absolute-start));if((audioEdit.gain??1)!==1||audioEdit.mutes?.length||audioEdit.effects?.length){const frames=trimmed.numberOfFrames,n=trimmed.numberOfChannels,data=new Float32Array(frames*n);for(let c=0;c<n;c++){const plane=data.subarray(c*frames,(c+1)*frames);trimmed.copyTo(plane,{planeIndex:c,format:'f32-planar'});for(let j=0;j<frames;j++){const t=absolute+j/trimmed.sampleRate;const mute=audioEdit.mutes?.some(r=>t>=r.start&&t<r.end);const fx=audioEdit.effects?.find(r=>t>=r.start&&t<r.end);const effect=fx?1-fx.depth/2+fx.depth/2*Math.sin(2*Math.PI*fx.frequency*t):1;plane[j]*=mute?0:(audioEdit.gain??1)*effect;}}const adjusted=new AudioSample({data,format:'f32-planar',numberOfChannels:n,sampleRate:trimmed.sampleRate,timestamp:trimmed.timestamp});try{await audioSource.add(adjusted);}finally{adjusted.close();}}else await audioSource.add(trimmed);}finally{trimmed.close();}}
     if(++batch%40===0){progress(Math.min(12,(sample.timestamp-start)/(end-start)*12),'Preparando o áudio sem carregar toda a gravação na memória…');await new Promise(r=>setTimeout(r,0));}
    }finally{sample.close();}
   }
   audioSource.close();
  }
  if(audioSource&&mixed){for(let offset=0;offset<mixed.data.length;offset+=9600){check();const sample=new AudioSample({data:mixed.data.subarray(offset,Math.min(mixed.data.length,offset+9600)),format:'f32',sampleRate:48000,numberOfChannels:2,timestamp:offset/2/48000});try{await audioSource.add(sample);}finally{sample.close();}}audioSource.close();mixed=null;}
  let i=0,heldFrames=0,decodedFrames=0;
  const count=Math.ceil(outputDuration*fps-1e-7);
  if(firefox){
   const sw=await track.getDisplayWidth(),sh=await track.getDisplayHeight();source.width=sw;source.height=sh;
   const batchSize=Math.max(1,Math.min(30,Math.floor(32*1024*1024/(sw*sh*4))));
   while(i<count){check();const span=editPlan.spans.find(s=>i/fps<s.until-1e-9)||editPlan.spans.at(-1),n=Math.max(1,Math.min(batchSize,count-i,Math.ceil((span.until-i/fps)*fps-1e-7)));progress(12+i/count*86,`Lendo quadros ${i+1}–${i+n}/${count} por CPU…`);
    const result=await local.call({type:'frames',start:sourceTime(i/fps),count:n,fps:fps/speed,width:sw,height:sh});const bytes=sw*sh*4,available=result.buffer.byteLength/bytes;
    if(!Number.isInteger(available)||available===0)throw Error('Não foi possível ler os quadros deste trecho.');
    for(let j=0;j<n;j++,i++){check();const pixels=new Uint8ClampedArray(result.buffer,Math.min(j,available-1)*bytes,bytes);sourceCtx.putImageData(new ImageData(pixels,sw,sh),0,0);await render(ctx,width,height,source,sourceTime(i/fps));await videoSource.add(i/fps,Math.min(1/fps,outputDuration-i/fps));decodedFrames++;progress(12+(i+1)/count*86,`Renderizando ${i+1}/${count} quadros · CPU local`);}
   }
  }else{
  check();const sink=new VideoSampleSink(track),firstTimestamp=await track.getFirstTimestamp();
  // Decode kept spans sequentially. Restart at each cut to avoid decoding
  // minutes/hours that the editor explicitly removed.
  let spanIndex=-1,iterator=null,pending=null,current=null;
  let lastTimestamp=-Infinity;
  function paint(sample){if(source.width!==sample.displayWidth||source.height!==sample.displayHeight){source.width=sample.displayWidth;source.height=sample.displayHeight;}sample.draw(sourceCtx,0,0,source.width,source.height);}
  try{
   for(;i<count;i++){
    check();const timestamp=sourceTime(i/fps);
    const nextSpan=editPlan.spans.findIndex(s=>i/fps<s.until-1e-9);
    if(nextSpan!==spanIndex){current?.close();pending?.close();current=pending=null;await iterator?.return?.();spanIndex=nextSpan;const span=editPlan.spans[spanIndex];iterator=sink.samples(Math.max(firstTimestamp,span.start-2),span.end)[Symbol.asyncIterator]();pending=(await iterator.next()).value;lastTimestamp=-Infinity;if(!pending)throw Error('Nenhum quadro decodificável no trecho '+(spanIndex+1)+'.');}
    while(pending&&pending.timestamp<=timestamp+1e-7){
     check();current?.close();current=pending;decodedFrames++;pending=(await iterator.next()).value;
    }
    const selected=current||pending;
    if(!selected)throw new Error('Leitura de quadros interrompida.');
    if(selected.timestamp!==lastTimestamp){paint(selected);lastTimestamp=selected.timestamp;}else heldFrames++;
    await render(ctx,width,height,source,timestamp);
    await videoSource.add(i/fps,Math.min(1/fps,outputDuration-i/fps));
    if(i%8===0||i===count-1){progress(12+(i+1)/count*86,`Renderizando ${i+1}/${count} quadros · ${fps} fps`);await new Promise(r=>setTimeout(r,0));}
   }
  }finally{current?.close();pending?.close();await iterator?.return?.();}
  }
  videoSource.close();check();progress(99,'Finalizando o arquivo MP4…');await output.finalize();
  if(!output.target.buffer?.byteLength)throw new Error('O codificador não retornou um arquivo.');
  return {blob:new Blob([output.target.buffer],{type:'video/mp4'}),engine:firefox?'CPU compatível':'Nativo',audioCodec:audioCodec||'sem áudio',frames:i,heldFrames,decodedFrames,duration:outputDuration};
 }catch(e){if(output&&output.state!=='finalized'&&output.state!=='canceled')await output.cancel().catch(()=>{});throw e;}
 finally{local?.close();audioInput?.dispose();editInput?.dispose();input.dispose();}
}

export async function checkVideoSupport({width,height,fps,bitrate,codec='avc',hardwareAcceleration='no-preference'}){registerSoftwareEncoder(false);return canEncodeVideo(codec,{width,height,bitrate,frameRate:fps,hardwareAcceleration});}

export {waveformPeaks,walkAudio,extractAudio,extractStereoWav,analyzeActivity,suggestClips} from './media-analysis.js';

export {assembleNarration,readStereo,prepareMixedAudio,prepareEditedAudio} from './audio-timeline.js';

