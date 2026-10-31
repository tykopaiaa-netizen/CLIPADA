'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const number=(v,a,b,label)=>{if(!Number.isFinite(v)||v<a||v>b)throw Error('Configuração inválida: '+label);return v;};
function captureArgs({rect,width,height,fps,bitrate,encoder,file,input}){
 const source=input||['-f','gdigrab','-draw_mouse','1','-framerate',String(fps),'-offset_x',String(rect.x),'-offset_y',String(rect.y),'-video_size',rect.width+'x'+rect.height,'-i','desktop'];
 const tuning=encoder.key==='nvenc'?['-preset','p4','-tune','ll']:encoder.key==='qsv'?['-preset','veryfast']:encoder.key==='amf'?['-quality','speed']:['-preset','ultrafast'];
 return ['-hide_banner','-loglevel','info','-y',...source,'-an','-vf',`scale=${width}:${height}:flags=fast_bilinear,setsar=1`,'-fps_mode','cfr','-r',String(fps),'-c:v',encoder.codec,...tuning,'-b:v',String(bitrate),'-maxrate',String(bitrate*1.3),'-bufsize',String(bitrate*2),'-pix_fmt','yuv420p','-threads','4','-g',String(fps*2),'-progress','pipe:3',file];
}
function makeCapture({ffmpeg,folder,asset,expose,encoder,getRectangle,platform=process.platform,testInput}){
 const prepared=new Map();let active=null;
 async function call(d){
  if(d.action==='capture-native-prepare'){
   if(platform!=='win32'&&!testInput)throw Error('A captura nativa está disponível no Windows. Selecione Compatibilidade neste sistema.');if(active)throw Error('Uma captura já está em andamento.');
   const rect=getRectangle(d.source),fps=number(d.fps,10,120,'FPS'),bitrate=number(d.bitrate,80000,240000000,'bitrate'),height=number(d.height,144,4320,'altura'),scale=Math.min(1,height/rect.height),w=Math.max(2,Math.round(rect.width*scale/2)*2),h=Math.max(2,Math.round(rect.height*scale/2)*2);
   if(w*h>10*1024*1024)throw Error('Reduza a captura para até 4K.');const enc=await encoder(['auto','cpu','nvenc','qsv','amf'].includes(d.encoder)?d.encoder:'auto');const id=crypto.randomUUID();prepared.clear();prepared.set(id,{rect,width:w,height:h,fps,bitrate,encoder:enc,at:Date.now()});return {id,width:w,height:h,encoder:enc.key};
  }
  if(d.action==='capture-native-start'){
   if(active)throw Error('Uma captura já está em andamento.');const p=prepared.get(d.id);prepared.delete(d.id);if(!p||Date.now()-p.at>60000)throw Error('Escolha a tela novamente para renovar a captura.');
   const dir=folder();await fs.mkdir(dir,{recursive:true});const st=await fs.statfs(dir);if(st.bavail*st.bsize<256*1024*1024)throw Error('Libere pelo menos 256 MB na pasta de gravação.');const id=crypto.randomUUID(),stem=path.join(dir,'Clipa-'+new Date().toISOString().replace(/[:.]/g,'-')),file=stem+'.mkv',j={id,file,stem,...p,startedAt:Date.now(),frames:0,duplicates:0,dropped:0,seconds:0,running:true,error:'',stderr:'',stopping:false};
   const child=spawn(ffmpeg,captureArgs({...p,file,input:testInput}),{windowsHide:true,stdio:['pipe','ignore','pipe','pipe']});j.child=child;active=j;child.stdin.on('error',()=>{});
   let progress='';child.stdio[3].on('data',b=>{progress+=b;let i;while((i=progress.indexOf('\n'))>=0){const line=progress.slice(0,i);progress=progress.slice(i+1);const [k,v]=line.split('=');if(k==='frame')j.frames=+v;if(k==='dup_frames')j.duplicates=+v;if(k==='drop_frames')j.dropped=+v;if(k==='out_time_us')j.seconds=Math.max(0,+v/1e6);}});
   child.stderr.on('data',b=>{j.stderr=(j.stderr+b).slice(-5000);if(!j.firstAt){const m=/start:\s*([\d.]+)/.exec(j.stderr);if(m&&+m[1]>1e9&&+m[1]<Date.now()/1000+10)j.firstAt=+m[1]*1000;}});
   j.done=new Promise(resolve=>{child.once('error',e=>j.error='O gravador nativo não iniciou: '+e.message);child.once('close',code=>{j.running=false;if(code!==0)j.error||='A captura nativa foi interrompida. '+j.stderr.slice(-700);resolve();});});
   return {id,startedAt:j.startedAt,encoder:p.encoder.key,width:p.width,height:p.height};
  }
  const j=active;if(!j||d.id!==j.id)throw Error('Captura não encontrada.');
  if(d.action==='capture-native-status')return {running:j.running,frames:j.frames,duplicates:j.duplicates,dropped:j.dropped,seconds:j.seconds,elapsed:(Date.now()-j.startedAt)/1000,encoder:j.encoder.key,error:j.error};
  if(d.action==='capture-native-stop'){
   if(j.stopping)throw Error('Finalização já em andamento.');j.stopping=true;
   let timer;try{if(j.running){j.child.stdin.end('q\n');await Promise.race([j.done,new Promise(resolve=>{timer=setTimeout(()=>{j.child.kill('SIGKILL');resolve();},15000);})]);}clearTimeout(timer);await j.done;
    if(!j.frames)throw Error(j.error||'Nenhum quadro foi gravado. Use Compatibilidade ou reduza o perfil.');
    const audio=d.audio?asset(d.audio):null,offset=audio?number(((j.firstAt||j.startedAt)-number(d.audioStartedAt,0,Date.now()+10000,'início do áudio'))/1000,-5,60,'sincronização'):0,out=j.stem+'.mp4';
    const args=['-hide_banner','-loglevel','error','-nostdin','-y','-i',j.file];if(audio){if(offset>0)args.push('-ss',String(offset));args.push('-i',audio.file,'-map','0:v:0','-map','1:a:0','-af',(offset<0?'adelay='+Math.round(-offset*1000)+'|'+Math.round(-offset*1000)+',':'')+'aresample=48000:async=1:first_pts=0,apad','-c:a','aac','-b:a','320k','-shortest');}
    args.push('-c:v','copy','-movflags','+faststart',out);const mux=spawn(ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});j.mux=mux;let error='';mux.stderr.on('data',b=>error=(error+b).slice(-3000));await new Promise((resolve,reject)=>{mux.once('error',reject);mux.once('close',c=>c===0?resolve():reject(Error('O vídeo foi preservado em '+path.basename(j.file)+', mas o MP4 não pôde ser finalizado: '+error)));});
    const result=await expose(out,'video/mp4');await fs.rm(j.file,{force:true});return {...result,frames:j.frames,seconds:j.seconds,encoder:j.encoder.key,warning:j.error||null};
   }finally{clearTimeout(timer);active=null;}
  }
  if(d.action==='capture-native-abort'){j.child.kill('SIGKILL');j.mux?.kill('SIGKILL');await j.done;active=null;return true;}
  throw Error('Ação de captura não autorizada.');
 }
 return {call,close(){active?.child.kill('SIGKILL');active?.mux?.kill('SIGKILL');},get busy(){return !!active;}};
}
module.exports={makeCapture,captureArgs};
