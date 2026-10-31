/* Clipa local CPU renderer. Uses the bundled FFmpeg core; no network code. */
importScripts('./ffmpeg/ffmpeg-core.js');
let core;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){const root=new URL('./ffmpeg/',self.location.href);const manifestResponse=await fetch(new URL('parts.json',root));if(!manifestResponse.ok)throw Error('Não foi possível carregar o motor CPU.');const manifest=await manifestResponse.json();const bytes=new Uint8Array(manifest.bytes);let offset=0;for(const part of manifest.parts){const response=await fetch(new URL(part.file,root));if(!response.ok)throw Error('Falha ao baixar motor CPU. Verifique sua conexão.');const chunk=new Uint8Array(await response.arrayBuffer());if(chunk.length!==part.bytes)throw Error('Motor CPU incompleto. Recarregue a página.');bytes.set(chunk,offset);offset+=chunk.length;}const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==manifest.sha256)throw Error('Motor CPU inválido. Recarregue a página.');core=await createFFmpegCore({wasmBinary:bytes});self.postMessage({id:data.id});return;}
  if(!core)throw Error('Renderizador não inicializado.');
  if(data.type==='prepareAudio'){core.FS.writeFile('external-audio',new Uint8Array(data.buffer));self.postMessage({id:data.id});return;}
  if(data.type==='prepare'){core.FS.writeFile('original',new Uint8Array(data.buffer));self.postMessage({id:data.id});return;}
  if(data.type==='processAudio'||data.type==='audioWav'){
   let log='';core.setLogger(({message})=>{log=(log+'\n'+message).slice(-1500);});
   const args=['-hide_banner','-loglevel','error'];
   if(data.type==='processAudio'){
    if(!Number.isFinite(data.speed)||data.speed<.0625||data.speed>16||!Number.isFinite(data.duration)||data.duration<=0||data.duration>600)throw Error('Velocidade ou duração inválida.');
    core.FS.writeFile('audio-in.wav',new Uint8Array(data.buffer));args.push('-i','audio-in.wav');let speed=data.speed;const filters=[];
    while(speed>2){filters.push('atempo=2');speed/=2;}while(speed<.5){filters.push('atempo=0.5');speed/=.5;}filters.push('atempo='+speed,'apad');args.push('-af',filters.join(','));
   }else args.push('-ss',String(data.start),'-i','original');
   args.push('-t',String(data.duration),'-vn','-c:a','pcm_s16le','-ar','48000','-ac','2','-threads','1','-y','audio-out.wav');
   const code=core.exec(...args);try{if(code!==0)throw Error('Falha ao ajustar áudio: '+log);const result=core.FS.readFile('audio-out.wav').slice();self.postMessage({id:data.id,buffer:result.buffer},[result.buffer]);}finally{for(const f of ['audio-in.wav','audio-out.wav'])try{core.FS.unlink(f);}catch{}core.reset();}return;
  }
  if(data.type==='audio'||data.type==='frames'){
   let log='';core.setLogger(({message})=>{log=(log+'\n'+message).slice(-1500);});
   const args=['-hide_banner','-loglevel','error','-ss',String(data.start),'-i',data.type==='audio'&&data.useExternal?'external-audio':'original'];
   if(data.type==='audio'){const filters=['volume='+Math.max(0,Math.min(1,Number(data.gain??1)))];for(const r of (data.mutes||[])){const a=Math.max(0,r.start-data.start),b=Math.min(data.duration,r.end-data.start);if(Number.isFinite(a)&&Number.isFinite(b)&&b>a)filters.push(`volume=0:enable='between(t,${a},${b})'`);}for(const r of (data.effects||[])){const a=Math.max(0,r.start-data.start),b=Math.min(data.duration,r.end-data.start),depth=Math.max(.1,Math.min(.7,Number(r.depth)||.35)),frequency=Math.max(1,Math.min(20,Number(r.frequency)||8));if(b>a)filters.push(`tremolo=f=${frequency}:d=${depth}:enable='between(t,${a},${b})'`);}args.push('-af',filters.join(','));}
   if(data.type==='audio')args.push('-t',String(data.duration),'-vn','-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-threads','1','-y','audio.mp4');
   else args.push('-an','-vf',`fps=${data.fps},scale=${data.width}:${data.height}`,'-frames:v',String(data.count),'-pix_fmt','rgba','-threads','1','-f','rawvideo','-y','decoded.rgba');
   const code=core.exec(...args);if(code!==0)throw Error('Falha ao ler a mídia: '+log);
   const file=data.type==='audio'?'audio.mp4':'decoded.rgba',result=core.FS.readFile(file).slice();core.FS.unlink(file);core.reset();self.postMessage({id:data.id,buffer:result.buffer},[result.buffer]);return;
  }
  if(data.type!=='encode')throw Error('Operação inválida.');
  core.FS.writeFile('frames.rgba',new Uint8Array(data.buffer));
  let log='';core.setLogger(({message})=>{log=(log+'\n'+message).slice(-2000);});
  const code=core.exec('-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size',`${data.width}x${data.height}`,'-framerate',String(data.fps),'-i','frames.rgba','-an','-c:v','libx264','-preset','veryfast','-b:v',String(data.bitrate),'-pix_fmt','yuv420p','-bf','0','-threads','1','-y','part.mp4');
  if(code!==0)throw Error('Falha no codificador CPU: '+log);
  const output=core.FS.readFile('part.mp4').slice();core.FS.unlink('frames.rgba');core.FS.unlink('part.mp4');core.reset();self.postMessage({id:data.id,buffer:output.buffer},[output.buffer]);
 }catch(e){self.postMessage({id:data.id,error:e.message||String(e)});}
};
