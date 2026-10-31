import {Input,ALL_FORMATS,BlobSource,AudioSampleSink} from 'mediabunny';
import {LocalWorker} from './local-worker.js';
import '../workbench-core.js';
import '../audio-studio-core.js';
import '../media-core314.js';
const AudioCore=globalThis.ClipaAudioCore;
const duckAt=globalThis.ClipaWorkbenchCore.duckAt;
const RATE=48000;
const check=cancelled=>{if(cancelled())throw Error('Cancelado');};
export function pcmWav(data){
 const out=new ArrayBuffer(44+data.length*2),v=new DataView(out),str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 str(0,'RIFF');v.setUint32(4,out.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,RATE,true);v.setUint32(28,RATE*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,data.length*2,true);
 for(let i=0;i<data.length;i++)v.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(data[i]*32767))),true);
 return out;
}
function readPcm(buffer){const v=new DataView(buffer);let offset=12,channels=2,rate=RATE,bits=16,format=1;while(offset+8<=v.byteLength){const name=String.fromCharCode(...new Uint8Array(buffer,offset,4)),n=v.getUint32(offset+4,true);if(offset+8+n>v.byteLength)throw Error('Áudio processado incompleto.');if(name==='fmt '){format=v.getUint16(offset+8,true);channels=v.getUint16(offset+10,true);rate=v.getUint32(offset+12,true);bits=v.getUint16(offset+22,true);}if(name==='data'){if(format!==1||channels!==2||rate!==RATE||bits!==16)throw Error('Formato de áudio processado incompatível.');const out=new Float32Array(n/2);for(let i=0;i<out.length;i++)out[i]=v.getInt16(offset+8+i*2,true)/32768;return out;}offset+=8+n+(n%2);}throw Error('Áudio sem dados.');}
export async function readStereo(blob,start,end,cancelled=()=>false){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>600)throw Error('Use até 10 minutos por intervalo de áudio.');
 const input=new Input({formats:ALL_FORMATS,source:new BlobSource(blob,{useStreamReader:false})});
 try{const track=await input.getPrimaryAudioTrack();if(!track)return null;
  if(!await track.canDecode()){
   if(blob.size>256*1024*1024)throw Error('Áudio não decodificável. Converta para AAC/WAV ou use um arquivo até 256 MB.');
   const local=new LocalWorker(cancelled);try{await local.call({type:'init'});const buffer=await blob.arrayBuffer();await local.call({type:'prepare',buffer},[buffer]);const r=await local.call({type:'audioWav',start,duration:end-start});return readPcm(r.buffer);}finally{local.close();}
  }
  const frames=Math.ceil((end-start)*RATE),out=new Float32Array(frames*2);let count=0;
  for await(const sample of new AudioSampleSink(track).samples(Math.max(0,start-.1),end)){try{check(cancelled);const planes=[];for(let c=0;c<Math.min(2,sample.numberOfChannels);c++){const p=new Float32Array(sample.numberOfFrames);sample.copyTo(p,{planeIndex:c,format:'f32-planar'});planes.push(p);}const lo=Math.max(0,Math.ceil((sample.timestamp-start)*RATE-1e-6)),hi=Math.min(frames,Math.ceil((sample.timestamp+sample.numberOfFrames/sample.sampleRate-start)*RATE-1e-6));for(let j=lo;j<hi;j++){const x=(start+j/RATE-sample.timestamp)*sample.sampleRate,k=Math.max(0,Math.floor(x)),f=Math.max(0,Math.min(1,x-k));for(let c=0;c<2;c++){const p=planes[Math.min(c,planes.length-1)];out[2*j+c]=(p[k]||0)*(1-f)+(p[Math.min(k+1,p.length-1)]||0)*f;}}}finally{sample.close();}if(++count%100===0)await new Promise(r=>setTimeout(r,0));}
  return out;
 }finally{input.dispose();}
}
async function stretch(data,speed,length,cancelled){
 const target=Math.ceil(length*RATE)*2;if(Math.abs(speed-1)<1e-6){const out=new Float32Array(target);out.set(data.subarray(0,target));return out;}
 const worker=new LocalWorker(cancelled);try{await worker.call({type:'init'});const buffer=pcmWav(data);const r=await worker.call({type:'processAudio',buffer,speed,duration:length},[buffer]);const out=new Float32Array(target);out.set(readPcm(r.buffer).subarray(0,target));return out;}finally{worker.close();}
}
export async function prepareMixedAudio({blob,start,end,speed=1,audioEdit={},cancelled=()=>false,progress=()=>{}}){
 const length=(end-start)/speed;if(end-start>600||length>600)throw Error('Velocidade, fades e narração: limite de 10 minutos na fonte e na saída. Exporte em partes.');
 progress(0,'Preparando áudio e velocidade…');const original=await readStereo(audioEdit.blob||blob,start,end,cancelled);let out;const studio=audioEdit.studio;
 if(original&&studio){
  for(const group of studio.groups||[]){if(group.enabled===false)continue;const a=Math.max(start,group.start),b=Math.min(end,group.end);if(b<=a)continue;check(cancelled);progress(2,'Misturando voz e instrumental…');const voice=await readStereo(group.voice,a-group.start,b-group.start,cancelled),music=await readStereo(group.music,a-group.start,b-group.start,cancelled);if(!voice||!music)throw Error('Faixa separada ausente. Refaça a separação.');const offset=Math.round((a-start)*RATE);for(let i=0;i<Math.min(voice.length,music.length)/2&&offset+i<original.length/2;i++){const t=a+i/RATE,vg=AudioCore.gainAt(group.voiceClips,t),mg=AudioCore.gainAt(group.musicClips,t);for(let c=0;c<2;c++)original[(offset+i)*2+c]=voice[2*i+c]*vg+music[2*i+c]*mg;}await new Promise(r=>setTimeout(r,0));
  }
  if(studio.extracted)for(let i=0;i<original.length/2;i++){const g=studio.muted?0:AudioCore.gainAt(studio.clips,start+i/RATE);original[i*2]*=g;original[i*2+1]*=g;}
 }

 if(original){for(let i=0;i<original.length/2;i++){const t=start+i/RATE,muted=audioEdit.mutes?.some(r=>t>=r.start&&t<r.end),fx=audioEdit.effects?.find(r=>t>=r.start&&t<r.end);const gain=muted?0:(audioEdit.gain??1)*duckAt(t,audioEdit)*(fx?1-fx.depth/2+fx.depth/2*Math.sin(2*Math.PI*fx.frequency*t):1);original[i*2]*=gain;original[i*2+1]*=gain;}out=await stretch(original,speed,length,cancelled);}else out=new Float32Array(Math.ceil(length*RATE)*2);
 const n=audioEdit.narration;let hasNarration=false;
 if(n?.enabled&&n.blob){const a=Math.max(start,n.start),b=Math.min(end,n.end);if(b>a){progress(3,'Misturando a narração…');const data=await readStereo(n.blob,(a-n.start)/n.rate,(b-n.start)/n.rate,cancelled);if(data){const voice=await stretch(data,speed/n.rate,(b-a)/speed,cancelled),offset=Math.round((a-start)/speed*RATE)*2;for(let i=0;i<voice.length&&offset+i<out.length;i++)out[offset+i]+=voice[i]*(n.gain??1);hasNarration=true;}}}
 let hasMedia=false;
 for(const item of audioEdit.media||[]){if(item.kind!=='sound'||item.muted)continue;const a=Math.max(start,item.start),b=Math.min(end,item.end);if(b<=a)continue;check(cancelled);progress(3,'Misturando som: '+item.name);const data=await readStereo(item.blob,item.offset+a-item.start,item.offset+b-item.start,cancelled);if(!data)throw Error('Som sem áudio: '+item.name);for(let i=0;i<data.length/2;i++){const gain=globalThis.ClipaMediaCore.gainAt(item,a+i/RATE);data[i*2]*=gain;data[i*2+1]*=gain;}const layer=await stretch(data,speed,(b-a)/speed,cancelled),offset=Math.round((a-start)/speed*RATE)*2;for(let i=0;i<layer.length&&offset+i<out.length;i++)out[offset+i]+=layer[i];hasMedia=true;}
 if(!original&&!hasNarration&&!hasMedia)return null;check(cancelled);
 const fadeIn=Math.min(length,Math.max(0,audioEdit.fadeIn||0)),fadeOut=Math.min(length,Math.max(0,audioEdit.fadeOut||0));let peak=0;
 for(let i=0;i<out.length/2;i++){const t=i/RATE,g=Math.min(1,fadeIn?t/fadeIn:1,fadeOut?(length-t)/fadeOut:1);out[i*2]*=g;out[i*2+1]*=g;peak=Math.max(peak,Math.abs(out[i*2]),Math.abs(out[i*2+1]));}
 if(!studio&&peak>.98){const gain=.98/peak;for(let i=0;i<out.length;i++)out[i]*=gain;}
 check(cancelled);out=await AudioCore.master(out,studio?.master);check(cancelled);return {data:out,sampleRate:RATE,channels:2};
}
export async function assembleNarration({scenes,start,end,speed=1,cancelled=()=>false,progress=()=>{}}){
 const length=(end-start)/speed;if(!(length>0)||length>600||end-start>600)throw Error('Monte até 10 minutos por vez.');const out=new Float32Array(Math.ceil(length*RATE)*2),timings=[];
 for(let i=0;i<scenes.length;i++){const s=scenes[i];check(cancelled);if(!s.audio)throw Error('Gere ou importe a voz de todas as cenas.');const input=new Input({formats:ALL_FORMATS,source:new BlobSource(s.audio,{useStreamReader:false})});let seconds;try{seconds=await input.computeDuration();}finally{input.dispose();}if(!Number.isFinite(seconds)||seconds<=0||seconds>120)throw Error('Voz inválida ou maior que 120 segundos na cena '+(i+1));const slot=(s.end-s.start)/speed,factor=Math.max(1,seconds/slot);if(factor>2.001)throw Error('Cena '+(i+1)+': a voz não cabe. Encurte o texto ou aumente o intervalo e gere novamente.');const data=await readStereo(s.audio,0,seconds,cancelled);if(!data)throw Error('Cena '+(i+1)+' sem áudio.');const used=Math.min(slot,seconds),voice=await stretch(data,factor,used,cancelled),offset=Math.round((s.start-start)/speed*RATE)*2;
  for(let j=0;j<voice.length&&offset+j<out.length;j++){const t=Math.floor(j/2)/RATE,edge=Math.max(0,Math.min(1,t/.005,(used-t)/.005));if(offset+j>=0)out[offset+j]+=voice[j]*edge;}
  timings.push({start:s.start,end:Math.min(s.end,s.start+used*speed),text:s.text});progress((i+1)/scenes.length*100,'Montando voz '+(i+1)+'/'+scenes.length);await new Promise(r=>setTimeout(r,0));
 }
 return {blob:new Blob([pcmWav(out)],{type:'audio/wav'}),timings};
}

export async function prepareEditedAudio({blob,plan,speed=1,audioEdit={},cancelled=()=>false,progress=()=>{}}){
 if(plan.duration>600||plan.spans.reduce((n,s)=>n+s.end-s.start,0)>600)throw Error('Montagem com áudio: exporte até 10 minutos por vez.');
 const out=new Float32Array(Math.ceil(plan.duration*RATE)*2);let found=false;const neutral={...audioEdit,fadeIn:0,fadeOut:0,studio:audioEdit.studio?{...audioEdit.studio,master:{...audioEdit.studio.master,enabled:false}}:undefined};
 for(let index=0;index<plan.spans.length;index++){const s=plan.spans[index];check(cancelled);progress(2,'Áudio · trecho '+(index+1)+'/'+plan.spans.length);const part=await prepareMixedAudio({blob,start:s.start,end:s.end,speed,audioEdit:neutral,cancelled,progress:()=>{}});if(!part)continue;found=true;const offset=Math.round(s.at*RATE)*2,length=part.data.length/2;
 for(let i=0;i<length&&offset+2*i+1<out.length;i++){const t=(offset/2+i)/RATE,fade=Math.min(1,audioEdit.fadeIn?t/audioEdit.fadeIn:1,audioEdit.fadeOut?(plan.duration-t)/audioEdit.fadeOut:1),edge=Math.min(1,index?i/(RATE*.003):1,index<plan.spans.length-1?(length-1-i)/(RATE*.003):1);out[offset+2*i]=part.data[2*i]*Math.max(0,fade*edge);out[offset+2*i+1]=part.data[2*i+1]*Math.max(0,fade*edge);}}
 if(!found)return null;check(cancelled);const data=await AudioCore.master(out,audioEdit.studio?.master);check(cancelled);return {data,sampleRate:RATE,channels:2};}
