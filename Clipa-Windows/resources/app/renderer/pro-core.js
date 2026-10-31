/* Clipa: bounded analysis and deterministic edit helpers. Shared by UI and tests. */
(function(root){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function chunks(start,end,seconds=120,overlap=2){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>172800)throw Error('Selecione um intervalo válido de até 48 horas. A análise usa blocos pequenos.');
  seconds=clamp(Number(seconds)||120,10,600);const jobs=[];
  for(let a=start;a<end-.001;a+=seconds){const b=Math.min(end,a+seconds);jobs.push({start:a,end:b,readStart:Math.max(start,a-overlap),readEnd:Math.min(end,b+overlap)});}return jobs;
 }
 function mergeCues(previous,next,start,end){
  const keep=previous.filter(c=>c.end<=start||c.start>=end);
  // Preserve the outside portion of captions crossing the analysis boundary.
  for(const c of previous){if(c.start<start&&c.end>start)keep.push({...c,end:start});if(c.start<end&&c.end>end)keep.push({...c,start:end});}
  return [...keep,...next.filter(c=>c.end>start&&c.start<end).map(c=>({...c,start:Math.max(start,c.start),end:Math.min(end,c.end)}))].filter(c=>c.end>c.start).sort((a,b)=>a.start-b.start);
 }
 function audible(audio,offset=0,rate=16000){
  const frame=Math.round(rate*.02),rms=[];for(let a=0;a<audio.length;a+=frame){let sum=0;const n=Math.min(frame,audio.length-a);for(let i=0;i<n;i++)sum+=audio[a+i]**2;rms.push(Math.sqrt(sum/Math.max(1,n)));}
  const sorted=rms.slice().sort((a,b)=>a-b),noise=sorted[Math.floor(sorted.length*.15)]||0,peak=sorted[Math.floor(sorted.length*.95)]||0;
  const threshold=clamp(Math.min(noise*2.5,peak*.22),.0006,.008),regions=[];let start=null;
  rms.forEach((v,i)=>{if(v>=threshold){if(start===null)start=i*.02;}else if(start!==null){regions.push({start:offset+Math.max(0,start-.12),end:offset+i*.02+.12});start=null;}});
  if(start!==null)regions.push({start:offset+Math.max(0,start-.12),end:offset+audio.length/rate});
  const merged=[];for(const w of regions){const last=merged.at(-1);if(last&&w.start<=last.end+.12)last.end=w.end;else merged.push(w);}return merged;
 }
 function cleanCues(cues,windows){
  return cues.filter(c=>c.text.trim()&&!/^sua legenda aqui[.!]?$/i.test(c.text.trim())&&!/^[\[(*♪]\s*(?:m[uú]sica|music|aplausos|applause|sil[eê]ncio|silence|risos|laughter|the end)\s*[\])*♪]$/i.test(c.text.trim())&&windows.some(w=>Math.min(w.end,c.end)-Math.max(w.start,c.start)>.03)).map(c=>{
   const words=c.text.toLowerCase().split(/\s+/),unique=new Set(words);return {...c,review:words.length>=5&&unique.size<words.length*.35};
  });
 }
 function candidates(cues,start,end,length,max=80){
  const usable=cues.filter(c=>c.enabled!==false&&c.text?.trim()&&c.end>start&&c.start<end).sort((a,b)=>a.start-b.start),out=[];
  if(!usable.length)return out;length=clamp(Number(length)||30,3,3600);let last=-Infinity;
  for(let i=0;i<usable.length;i++){
   const c=usable[i],a=Math.max(start,c.start-.12);if(a-last<Math.max(2,length/4))continue;
   const target=Math.min(end,a+length),within=usable.slice(i).filter(x=>x.start<target),lastCue=within.at(-1);if(!lastCue)continue;
   const b=Math.min(end,Math.max(a+1,Math.min(target,lastCue.end+.15))),text=within.map(x=>x.text).join(' '),speech=within.reduce((s,x)=>s+Math.max(0,Math.min(b,x.end)-Math.max(a,x.start)),0);
   out.push({start:a,end:b,text,coverage:clamp(speech/(b-a),0,1),boundary:i===0||/[.!?]$/.test(usable[i-1].text)||c.start-usable[i-1].end>.4?1:0});last=a;
  }
  if(out.length<=max)return out;return Array.from({length:max},(_,i)=>out[Math.round(i*(out.length-1)/(max-1))]);
 }
 function selectCandidates(items,scores,count=8){
  const ranked=items.map((c,i)=>({...c,relevance:scores[i]||0,score:(scores[i]||0)*.8+c.coverage*.12+c.boundary*.08})).filter(c=>c.relevance>=.25).sort((a,b)=>b.score-a.score),chosen=[];
  for(const c of ranked){if(chosen.every(x=>Math.max(0,Math.min(x.end,c.end)-Math.max(x.start,c.start))<Math.min(x.end-x.start,c.end-c.start)*.25)){chosen.push(c);if(chosen.length>=count)break;}}return chosen;
 }
 function mergeFlags(flags,next){
  const all=[...flags,...next].sort((a,b)=>a.start-b.start),out=[];
  for(const f of all){const p=out.at(-1);if(p&&!p.manual&&!f.manual&&p.selected===f.selected&&f.start<=p.end+.05){p.end=Math.max(p.end,f.end);p.music=Math.max(p.music,f.music);p.speech=Math.max(p.speech,f.speech);}else out.push({...f});}return out;
 }
 function autoColor(pixels){const lum=[];let sum=0;for(let i=0;i<pixels.length;i+=16){const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];lum.push(l);sum+=l;}lum.sort((a,b)=>a-b);if(!lum.length)return {exposure:0,contrast:1};const mean=sum/lum.length,low=lum[Math.floor(lum.length*.05)],high=lum[Math.floor(lum.length*.95)];return {exposure:Math.round(clamp(Math.log2(118/Math.max(20,mean)),-.6,.6)*100)/100,contrast:Math.round(clamp(210/Math.max(80,high-low),.9,1.25)*100)/100};}
 function windowWords(result,offset,start,end){return {...result,chunks:(result.chunks||[]).filter(w=>{const a=Number(w.timestamp?.[0]),b=Number(w.timestamp?.[1]??a),mid=offset+(a+b)/2;return Number.isFinite(mid)&&mid>=start&&mid<end;})};}
 function translationGroups(cues,start,end,context=true){
  const groups=[];let current=null;
  cues.forEach((cue,index)=>{if(cue.end<=start||cue.start>=end)return;const last=current?.indexes.at(-1);if(!current||!context||cue.start-cues[last].end>.6||/[.!?]$/.test(cues[last].text)||current.text.length+cue.text.length>420||cue.end-current.start>12){current={indexes:[],text:'',start:cue.start};groups.push(current);}current.indexes.push(index);current.text+=(current.text?' ':'')+cue.text;});return groups;
 }
 function applyTranslations(original,groups,texts){
  if(texts.length!==groups.length||texts.some(t=>typeof t!=='string'||!t.trim()))throw Error('Resposta de tradução incompleta.');
  const result=original.map(c=>({...c}));groups.forEach((g,n)=>{const words=texts[n].trim().split(/\s+/),total=g.indexes.reduce((s,i)=>s+Math.max(1,original[i].text.length),0);let consumed=0,weight=0;
   g.indexes.forEach((i,j)=>{weight+=Math.max(1,original[i].text.length);const end=j===g.indexes.length-1?words.length:Math.round(words.length*weight/total);result[i]={...result[i],text:words.slice(consumed,end).join(' ')};delete result[i].words;consumed=end;});});return result;
 }
function prepareSpeech(audio){let sum=0,peak=0;for(const v of audio){sum+=v*v;peak=Math.max(peak,Math.abs(v));}const rms=Math.sqrt(sum/Math.max(1,audio.length));if(rms>.00003&&peak>.0001){const gain=Math.min(16,.12/rms,.85/peak);if(gain>1)for(let i=0;i<audio.length;i++)audio[i]*=gain;}return {rms,peak};}
 function automaticCuts(cues,start,end,length,count=8){
  const items=candidates(cues,start,end,length,2000);
  const ranked=items.map(c=>{const words=c.text.toLowerCase().split(/\s+/),variety=new Set(words).size/Math.max(1,words.length),opening=/[?!]|\b(como|por que|olha|veja|descobri|consegui|why|how|watch)\b/i.test(c.text.slice(0,130))?1:0;return {...c,score:c.coverage*.45+c.boundary*.25+variety*.2+opening*.1};}).sort((a,b)=>b.score-a.score),picked=[];
  for(const c of ranked){if(picked.every(p=>Math.max(0,Math.min(c.end,p.end)-Math.max(c.start,p.start))<Math.min(c.end-c.start,p.end-p.start)*.15)){picked.push(c);if(picked.length>=count)break;}}return picked;
 }
 const api={prepareSpeech,automaticCuts,chunks,mergeCues,audible,cleanCues,candidates,selectCandidates,mergeFlags,autoColor,translationGroups,applyTranslations,windowWords};root.ClipaPro=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
