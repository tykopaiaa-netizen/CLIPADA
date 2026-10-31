import {Input,ALL_FORMATS,BlobSource,VideoSampleSink} from 'mediabunny';
import {prepareMixedAudio} from './audio-timeline.js';

// Decode source frames sequentially; backpressure permits only one RGBA frame in flight.
// PCM is mixed in eight-second windows. Encoding and muxing run outside the renderer.
export async function exportDesktop(o){
 const {blob,width,height,fps,bitrate,start,end,render,progress,cancelled,speed=1,audioEdit={},removed=[]}=o;
 const io=window.clipaDesktop.io,plan=globalThis.ClipaEditCore.plan(start,end,removed,speed);
 if(plan.duration<1/fps)throw Error('Mantenha pelo menos um quadro.');
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(blob,{useStreamReader:false})});let job=null,completed=false,sourceAsset=null,decoder=null;
 const check=()=>{if(cancelled())throw Error('Cancelado');};
 try{
  const track=await input.getPrimaryVideoTrack();if(!track)throw Error('Este vídeo não pôde ser decodificado. Importe MP4 H.264 ou WebM VP8/VP9.');
  const opened=await io({action:'begin',width,height,fps,bitrate,duration:plan.duration,codec:o.codec||'avc',encoder:document.getElementById('nativeEncoder316')?.value||'auto',preset:document.getElementById('nativePreset316')?.value||'fast',destination:window.clipaQueueDestination320||undefined});if(opened.cancelled)throw Error('Destino não escolhido. Nenhum arquivo foi alterado.');job=opened.id;window.clipaNativeJob=job;
  const neutral={...audioEdit,fadeIn:0,fadeOut:0,studio:{...(audioEdit.studio||{}),master:{enabled:false}}};
  let audioSeq=0,audioSeconds=0;const totalSource=plan.spans.reduce((n,s)=>n+s.end-s.start,0);
  for(let index=0;index<plan.spans.length;index++){
   const span=plan.spans[index];
   for(let a=span.start;a<span.end-1e-7;){check();const b=Math.min(span.end,a+8);progress(audioSeconds/totalSource*15,'Mixando áudio em blocos · '+Math.round(audioSeconds)+' / '+Math.round(totalSource)+' s');
    const part=await prepareMixedAudio({blob,start:a,end:b,speed:1,audioEdit:neutral,cancelled,progress:()=>{}});check();const data=part?.data||new Float32Array(Math.round((b-a)*48000)*2),frames=data.length/2;
    // Short ramps at montage seams; no fades on internal processing boundaries.
    if(index>0&&a===span.start)for(let i=0;i<Math.min(frames,144);i++){data[i*2]*=i/144;data[i*2+1]*=i/144;}
    if(index<plan.spans.length-1&&b===span.end)for(let i=0;i<Math.min(frames,144);i++){data[(frames-1-i)*2]*=i/144;data[(frames-1-i)*2+1]*=i/144;}
    await io({action:'audio',id:job,seq:audioSeq++,bytes:data.buffer});audioSeconds+=b-a;a=b;
   }
  }
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});const source=document.createElement('canvas'),sc=source.getContext('2d',{alpha:false});
  const count=Math.ceil(plan.duration*fps-1e-7);let decodedFrames=0,heldFrames=0,changedFrames=0,lastHash=null;
  const origin=document.getElementById('video'),sw=origin.videoWidth,sh=origin.videoHeight;
  if(!sw||!sh)throw Error('Aguarde os metadados do vídeo.');source.width=sw;source.height=sh;
  progress(15,'Preparando leitura nativa · copiando a fonte para o disco temporário');
  sourceAsset=window.clipaSourceAssets319?.get(blob)||null;let temporary=false;
  if(!sourceAsset){const writing=await io({action:'upload-begin',ext:'mp4'});let seq=0;try{for(let i=0;i<blob.size;i+=4*1024*1024){check();await io({action:'append',id:writing.id,seq:seq++,bytes:await blob.slice(i,i+4*1024*1024).arrayBuffer()});}sourceAsset=await io({action:'upload-end',id:writing.id,type:blob.type});temporary=true;}catch(e){await io({action:'upload-cancel',id:writing.id}).catch(()=>{});throw e;}}
  const renderBegan=performance.now();let spanIndex=-1,lastFrame=null,frameMissing=0;
  try{for(let i=0;i<count;i++){check();const t=i/fps,at=globalThis.ClipaEditCore.sourceAt(plan,t,speed),next=plan.spans.findIndex(s=>t<s.until-1e-9);
    if(next!==spanIndex){if(decoder)await io({action:'decode-cancel',id:decoder.id});spanIndex=next;const span=plan.spans[next],endIndex=Math.min(count,Math.ceil(span.until*fps-1e-7));decoder=await io({action:'decode-begin',asset:sourceAsset.id,start:at,width:sw,height:sh,fps,speed,frames:endIndex-i});window.clipaNativeDecode=decoder.id;lastFrame=null;frameMissing=0;}
    const data=await io({action:'decode-next',id:decoder.id});check();
    if(data.done){if(!lastFrame||++frameMissing>2)throw Error('A fonte terminou antes do esperado. Selecione um fim de corte anterior.');heldFrames++;}else{lastFrame=new Uint8ClampedArray(data.bytes);decodedFrames++;}
    sc.putImageData(new ImageData(lastFrame,sw,sh),0,0);
    let hash=2166136261;for(let j=0;j<lastFrame.length;j+=Math.max(4,Math.floor(lastFrame.length/2048/4)*4))hash=Math.imul(hash^lastFrame[j],16777619);if(hash!==lastHash)changedFrames++;lastHash=hash;
    await window.clipaMedia?.prepareFrame?.(at);await render(ctx,width,height,source,at);check();const frame=ctx.getImageData(0,0,width,height);
    await io({action:'frame',id:job,index:i,bytes:frame.data.buffer});if(i%8===0||i===count-1){const rate=(i+1)/Math.max(.001,(performance.now()-renderBegan)/1000),remaining=(count-i-1)/Math.max(.01,rate);progress(15+83*(i+1)/count,`Arquivo: ${fps} fps · ${i+1}/${count} quadros · processamento: ${rate.toFixed(1)} q/s · faltam ~${Math.ceil(remaining)} s`);await new Promise(r=>setTimeout(r,0));}
   }}finally{if(decoder)await io({action:'decode-cancel',id:decoder.id}).catch(()=>{});decoder=null;window.clipaNativeDecode=null;if(temporary&&sourceAsset)await io({action:'release',id:sourceAsset.id}).catch(()=>{});sourceAsset=null;}
  window.clipaRenderStats319={fps,frames:count,changedFrames,decodedFrames,heldFrames,seconds:(performance.now()-renderBegan)/1000,decoder:'FFmpeg sequencial'};
  check();progress(99,'Finalizando MP4 H.264 + AAC no disco…');const result=await io({action:'finish',id:job,speed,fadeIn:audioEdit.fadeIn||0,fadeOut:audioEdit.fadeOut||0,master:audioEdit.studio?.master||{}});completed=true;window.clipaNativeResult=result;
  // Chromium's Blob storage can spool to disk; never materialize the MP4 in an ArrayBuffer.
  const saved=await fetch(result.url);if(!saved.ok)throw Error('O MP4 foi salvo, mas a prévia não pôde ser aberta.');const resultBlob=await saved.blob();
  return {blob:resultBlob,nativeFile:result,engine:result.engine||'CPU nativa · disco',audioCodec:'aac',frames:count,heldFrames,decodedFrames,duration:plan.duration};
 }finally{if(decoder)await io({action:'decode-cancel',id:decoder.id}).catch(()=>{});window.clipaNativeDecode=null;input.dispose();window.clipaNativeJob=null;if(job&&!completed)await io({action:'cancel',id:job}).catch(()=>{});}
}
