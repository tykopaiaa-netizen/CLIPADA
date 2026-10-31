'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.ClipaStudioCore=api;})(globalThis,()=>{
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(x))?Number(x):a));
 function snap(t,{duration,fps=30,anchors=[],threshold=0,enabled=true}){
  t=clamp(t,0,duration);const frame=Math.round(t*fps)/fps;
  if(!enabled)return t;
  let best=clamp(frame,0,duration),distance=threshold;
  for(const p of anchors)if(Number.isFinite(p)&&p>=0&&p<=duration&&Math.abs(p-t)<=distance){best=p;distance=Math.abs(p-t);}
  return best;
 }
 function trim(start,end,t,edge,duration){const gap=Math.min(.1,duration);return edge==='start'?{start:clamp(t,0,end-gap),end}:{start,end:clamp(t,start+gap,duration)};}
 function shift(start,end,delta,duration){const length=Math.min(end-start,duration),a=clamp(start+delta,0,duration-length);return {start:a,end:a+length};}
 function rectangle(r,aspect,sw,sh){let w=clamp(r.w,.002,1),h=clamp(r.h,.002,1);if(aspect>0){const ratio=aspect*sh/sw;h=w/ratio;if(h>1){h=1;w=ratio;}}return {x:clamp(r.x,0,1-w),y:clamp(r.y,0,1-h),w,h};}
 function canvasSize(w,h,limit){const scale=Math.min(1,limit/Math.max(w,h));return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale))};}
 function eta(elapsed,progress){return elapsed>=3&&progress>=2&&progress<99?Math.max(0,elapsed*(100-progress)/progress):null;}
 function micOptions(device,profile='raw',channel='auto',fallback=false){const audio=device?{deviceId:{exact:device}}:{};if(!fallback){audio.channelCount={ideal:channel.startsWith('input')?clamp(Number(channel.slice(5)),2,8):2};audio.sampleRate={ideal:48000};audio.echoCancellation=profile==='speaker';audio.noiseSuppression=profile!=='raw';audio.autoGainControl=false;}return {video:false,audio:Object.keys(audio).length?audio:true};}
 function safetyWarnings({w,h,sourceW,sourceH,fps,sourceFps,seconds,mb}){const out=[];if(w>sourceW*1.05||h>sourceH*1.05)out.push('A saída amplia a fonte. Mais pixels não recuperam detalhes ausentes.');if(sourceFps&&fps>sourceFps*1.1)out.push('FPS acima da fonte repete quadros; não cria movimentos novos.');if(mb>450)out.push('Saída grande: prefira exportar em trechos para reduzir o uso de memória.');if(w*h>=3840*2160)out.push('4K exige mais memória e tempo de processamento.');return out;}
 return {clamp,snap,trim,shift,rectangle,canvasSize,eta,micOptions,safetyWarnings};
});
