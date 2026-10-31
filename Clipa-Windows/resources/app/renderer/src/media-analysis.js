import {Input,ALL_FORMATS,BlobSource,AudioSampleSink} from 'mediabunny';
const inputFor=blob=>new Input({formats:ALL_FORMATS,source:new BlobSource(blob,{useStreamReader:false})});
export async function walkAudio(blob,start,end,onBlock,cancelled=()=>false){
 const input=inputFor(blob);try{const track=await input.getPrimaryAudioTrack();if(!track||!await track.canDecode())throw Error('Este arquivo não tem áudio decodificável.');let count=0;
 for await(const sample of new AudioSampleSink(track).samples(start,end)){
  try{if(cancelled())throw Error('Cancelado');const channels=Math.min(sample.numberOfChannels,2),mono=new Float32Array(sample.numberOfFrames),planes=[];let strongest=0,channelEnergy=0,monoEnergy=0;
   for(let c=0;c<channels;c++){const plane=new Float32Array(sample.numberOfFrames);sample.copyTo(plane,{planeIndex:c,format:'f32-planar'});planes.push(plane);let energy=0;for(let i=0;i<mono.length;i++){mono[i]+=plane[i]/channels;energy+=plane[i]**2;}if(energy>channelEnergy){channelEnergy=energy;strongest=c;}}
   for(const value of mono)monoEnergy+=value*value;
   if(channelEnergy>0&&monoEnergy<channelEnergy*.025)mono.set(planes[strongest]);
   await onBlock(mono,sample.sampleRate,sample.timestamp);
  }finally{sample.close();}
  if(++count%100===0)await new Promise(r=>setTimeout(r,0));
 }
  if(!count)throw Error('Nenhum quadro de áudio foi decodificado neste intervalo. Confira a faixa ou importe um WAV.');
 }finally{input.dispose();}
}
export async function extractAudio(blob,start,end,cancelled=()=>false){
 if(end<=start||end-start>600)throw Error('Para legendar, selecione um trecho de até 10 minutos. O arquivo original pode ser maior.');
 const out=new Float32Array(Math.ceil((end-start)*16000));
 await walkAudio(blob,start,end,(data,rate,time)=>{const lo=Math.max(0,Math.ceil((time-start)*16000)),hi=Math.min(out.length,Math.ceil((time+data.length/rate-start)*16000));for(let j=lo;j<hi;j++){const p=(start+j/16000-time)*rate,k=Math.max(0,Math.floor(p)),a=Math.max(0,Math.min(1,p-k));out[j]=(data[k]||0)*(1-a)+(data[Math.min(k+1,data.length-1)]||0)*a;}},cancelled);return out;
}
export async function analyzeActivity(blob,duration,progress,cancelled=()=>false){
 if(!Number.isFinite(duration)||duration<=0||duration>172800)throw Error('Análise disponível para vídeos de até 48 horas.');
 const energy=new Float64Array(Math.ceil(duration)),counts=new Uint32Array(energy.length),peaks=new Float32Array(energy.length);let last=-1;
 await walkAudio(blob,0,duration,(data,rate,time)=>{const stride=Math.max(1,Math.floor(rate/4000));for(let i=0;i<data.length;i+=stride){const s=Math.floor(time+i/rate);if(s<0||s>=energy.length)continue;const v=data[i];energy[s]+=v*v;counts[s]++;peaks[s]=Math.max(peaks[s],Math.abs(v));}const sec=Math.floor(time);if(sec!==last){last=sec;progress(Math.min(99,time/duration*100));}},cancelled);
 return {rms:Array.from(energy,(v,i)=>Math.sqrt(v/Math.max(1,counts[i]))),peaks:Array.from(peaks)};
}
export function suggestClips(activity,duration,length,count=8){
 length=Math.min(length,duration);if(!(length>0))return [];
 const rms=activity.rms,peak=Math.max(0,...activity.peaks.slice(0,10000));if(!rms.some(v=>v>.001)&&peak<.01)return [];
 const positive=rms.filter(v=>v>.001).sort((a,b)=>a-b),median=positive[Math.floor(positive.length/2)]||.001;
 const values=rms.map((v,i)=>Math.log1p(v/median)+Math.abs(v-(rms[i-1]||v))/median*.35),prefix=[0];for(const v of values)prefix.push(prefix[prefix.length-1]+v);
 const candidates=[],step=Math.max(1,Math.floor(length/4));
 for(let start=0;start<=duration-length;start+=step){const a=Math.floor(start),b=Math.min(values.length,Math.ceil(start+length)),score=(prefix[b]-prefix[a])/Math.max(1,b-a);candidates.push({start,end:start+length,score});}
 if(!candidates.length)candidates.push({start:0,end:duration,score:1});
 const selected=[];for(const c of candidates.sort((a,b)=>b.score-a.score)){if(selected.every(s=>Math.max(0,Math.min(s.end,c.end)-Math.max(s.start,c.start))<length*.2)){selected.push(c);if(selected.length>=count)break;}}return selected;
}

export async function extractStereoWav(blob,start,end,cancelled=()=>false){
 if(!(end>start)||end-start>120)throw Error('Extraia até 120 segundos por vez para limitar o uso de memória.');
 const rate=48000,frames=Math.ceil((end-start)*rate),data=new Float32Array(frames*2),input=inputFor(blob);
 try{const track=await input.getPrimaryAudioTrack();if(!track)throw Error('O arquivo não contém faixa de áudio. Extrair não recupera um som que não foi gravado.');if(!await track.canDecode())throw Error('Áudio não decodificável neste navegador. Use o app Windows ou importe uma faixa WAV.');
 for await(const sample of new AudioSampleSink(track).samples(start,end)){try{if(cancelled())throw Error('Cancelado');const planes=[];for(let c=0;c<Math.min(2,sample.numberOfChannels);c++){const a=new Float32Array(sample.numberOfFrames);sample.copyTo(a,{format:'f32-planar',planeIndex:c});planes.push(a);}const lo=Math.max(0,Math.ceil((sample.timestamp-start)*rate)),hi=Math.min(frames,Math.ceil((sample.timestamp+sample.numberOfFrames/sample.sampleRate-start)*rate));for(let j=lo;j<hi;j++){const pos=(start+j/rate-sample.timestamp)*sample.sampleRate,k=Math.max(0,Math.floor(pos)),f=Math.max(0,pos-k);for(let c=0;c<2;c++){const a=planes[Math.min(c,planes.length-1)];data[j*2+c]=(a[k]||0)*(1-f)+(a[Math.min(k+1,a.length-1)]||0)*f;}}}finally{sample.close();}}
 }finally{input.dispose();}
 const out=new ArrayBuffer(44+data.length*2),v=new DataView(out);const str=(offset,s)=>[...s].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,out.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,data.length*2,true);for(let i=0;i<data.length;i++)v.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(data[i]*32767))),true);return new Blob([out],{type:'audio/wav'});
}

export async function waveformPeaks(blob,start,end,bins=1400,cancelled=()=>false){if(!(end>start)||end-start>172800)throw Error('Intervalo de áudio inválido.');const peaks=new Float32Array(Math.min(8000,Math.max(100,bins)));await walkAudio(blob,start,end,(pcm,rate,time)=>{for(let i=0;i<pcm.length;i+=4){const x=Math.floor((time+i/rate-start)/(end-start)*peaks.length);if(x>=0&&x<peaks.length)peaks[x]=Math.max(peaks[x],Math.abs(pcm[i]));}},cancelled);return peaks;}
