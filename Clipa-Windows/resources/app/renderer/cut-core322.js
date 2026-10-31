'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.ClipaCutCore322=api;})(globalThis,()=>{
 const clone=x=>structuredClone(x),clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
 const themes={humor:'Humor',impact:'Surpresa',insight:'Ideia forte',story:'História',tutorial:'Dica prática',general:'Conversa'};
 const queries={humor:'Uma piada engraçada, uma situação hilária, ironia, alguém ri de algo inesperado e entrega uma conclusão divertida.',impact:'Uma surpresa, uma reação intensa, um momento impressionante ou inesperado que muda a situação.',insight:'Uma opinião interessante, uma descoberta importante ou uma explicação clara com uma conclusão útil.',story:'Uma história envolvente, conflito, suspense e uma conclusão que faz sentido por si só.',tutorial:'Uma dica prática, passo a passo, solução para um problema ou algo que a pessoa pode aprender.'};
 function candidates(cues,start,end,length,max=2400){
  const rows=(cues||[]).filter(c=>c.enabled!==false&&!c.flagged&&typeof c.text==='string'&&c.text.trim()&&c.end>start&&c.start<end&&Number.isFinite(c.start)&&Number.isFinite(c.end)).sort((a,b)=>a.start-b.start);const out=[];let last=-Infinity;
  for(let i=0;i<rows.length;i++){const a=Math.max(start,rows[i].start-.12);if(a-last<Math.max(2,length/3))continue;const target=Math.min(end,a+length),within=[];for(let j=i;j<rows.length&&rows[j].start<target;j++)within.push(rows[j]);if(!within.length)continue;
   const sentence=within.filter(c=>c.end>=a+length*.6&&/[.!?…]$/.test(c.text.trim())).at(-1),tail=sentence||within.at(-1);const b=Math.min(end,Math.max(a+.1,tail.end+.12),target+1.5);if(b-a<Math.min(3,end-start)||b-a<Math.min(8,length*.35))continue;const contained=within.filter(c=>c.start<b),text=contained.map(c=>c.text.trim()).join(' ').slice(0,10000);if(text.split(/\s+/).length<4)continue;
   const speech=contained.reduce((v,c)=>v+Math.max(0,Math.min(b,c.end)-Math.max(a,c.start)),0);out.push({id:'candidate-'+out.length,start:a,end:b,text,coverage:clamp(speech/(b-a),0,1),boundary:i===0||rows[i].start-rows[i-1].end>.35||/[.!?]$/.test(rows[i-1].text)?1:0});last=a;
  }
  return out.length<=max?out:Array.from({length:max},(_,i)=>out[Math.round(i*(out.length-1)/(max-1))]);
 }
 function titleOf(text,fallback){const phrases=String(text).split(/[.!?…]+\s*/).map(s=>s.trim()).filter(Boolean);const chosen=phrases.find(s=>s.length>=18&&s.split(/\s+/).length>=4)||text||fallback;const words=chosen.trim().split(/\s+/);let result='';for(const word of words){if((result+' '+word).trim().length>86)break;result+=(result?' ':'')+word;}return result||fallback;}
 function rank(items,signals={},focus='mix',count=8){const rows=items.map((x,i)=>{const s=signals[x.id]||{},vector=s.scores||{},best=Object.entries(vector).sort((a,b)=>b[1]-a[1])[0],kind=themes[s.kind]?s.kind:best?.[0]||'general',similarity=focus!=='mix'&&vector[focus]!=null?vector[focus]:best?.[1];const variety=new Set(x.text.toLowerCase().split(/\s+/)).size/Math.max(1,x.text.split(/\s+/).length),opening=/[?!]|\b(olha|como|por que|consegui|descobri|acredita|watch|why|how)\b/i.test(x.text.slice(0,160))?1:0;
   const quality=Number.isFinite(s.quality)?clamp(s.quality/100,0,1):Number.isFinite(similarity)?clamp((similarity+.05)/.7,0,1):variety*.6+opening*.4;
   return {...x,kind,title:String(s.title||titleOf(x.text,'Corte '+(i+1))).slice(0,90),reason:String(s.reason||(s.scores?'O texto se aproxima de '+(themes[kind]||'uma conversa relevante').toLowerCase()+'. Confira o começo e a conclusão.':'Fala contínua, limites de frase e variedade de palavras. Revise o contexto.')).slice(0,400),score:clamp(quality*.7+x.coverage*.15+x.boundary*.1+opening*.05,0,1),engine:s.engine||'fala',keep:s.keep!==false};}).filter(x=>x.keep).sort((a,b)=>b.score-a.score||a.start-b.start);
  const chosen=[];for(const r of rows){if(chosen.every(p=>Math.max(0,Math.min(p.end,r.end)-Math.max(p.start,r.start))<Math.min(p.end-p.start,r.end-r.start)*.2)){chosen.push(r);if(chosen.length>=count)break;}}return chosen;
 }
 function interval(c,a,b){const start=Math.max(a,c.start),end=Math.min(b,c.end);return end>start?{...clone(c),start,end,words:c.words?.filter(w=>w.end>start&&w.start<end)}:null;}
 function cleanEdit(value){const s=clone(value);delete s.cutBoard322;return s;}
 function remap(items,from,to,{extend=false,media=false}={}){return (items||[]).flatMap(item=>{const c=interval(item,from.start,from.end);if(!c)return [];const all=c.start<=from.start+.05&&c.end>=from.end-.05;let start=to.start+c.start-from.start,end=extend&&all?to.end:to.start+c.end-from.start;if(start>=to.end)return [];end=Math.min(to.end,end);const out={...c,start,end};if(media&&['sound','video'].includes(item.kind)){out.offset=(item.offset||0)+c.start-item.start;out.end=Math.min(out.end,out.start+Math.max(0,(item.sourceDuration||Infinity)-out.offset));}return out.end-out.start>=.02?[out]:[];});}
 function forCard(base,card,cues){const s=cleanEdit(base);s.clipBank=[];s.values={...s.values,start:card.start,end:card.end,seek:card.start};s.cues=(cues||s.cues||[]).map(c=>interval(c,card.start,card.end)).filter(Boolean);s.timeline={...(s.timeline||{}),removed:[],splits:[]};s.pro={history:[]};return s;}
 function applyStyle(source,target,from,to,options={}){
  const s=cleanEdit(target),v=s.values||{};s.values=v;const copy=k=>{if(source[k]!==undefined)s[k]=clone(source[k]);};
  if(options.layout!==false){for(const k of ['layouts321','camera319','layout317','formatMode','crop','cropCenter','regionKey','regionStates','regionAssigned','wideState','modeRegions','modeSettings','composition'])copy(k);s.tracking={};if(options.captions===false){for(const [mode,settings]of Object.entries(s.modeSettings||{}))for(const key of Object.keys(settings))if(key.startsWith('caption')&&target.modeSettings?.[mode]?.[key]!==undefined)settings[key]=clone(target.modeSettings[mode][key]);}for(const sc of Object.values(s.layouts321?.modes||{}))for(const l of sc.layers)l.clips=remap(l.clips,from,to,{extend:true});}
  for(const [id,value]of Object.entries(source.values||{})){
   if(options.layout!==false&&/^(resolution|fps|quality|fit|aspect|cameraCount|cameraHeight|contentContain|zoom|crop|removeCameraBg|segmentQuality|mask|layer|composition|scene)/.test(id))v[id]=clone(value);
   if(options.captions!==false&&/^(caption(X|Y|Size|Style|Color|Outline|Highlight|BoxColor)|captionsEnabled)$/.test(id))v[id]=clone(value);
   if(options.look!==false&&/^(grade|visualFilter|filterStrength|videoFade|edgeTransition|transition|effect)/.test(id))v[id]=clone(value);
  }
  if(options.look!==false){s.cutEffects=(source.cutEffects||[]).filter(e=>e.time>=from.start&&e.time<from.end&&e.time-from.start<to.end-to.start).map(e=>({...clone(e),time:to.start+e.time-from.start}));}
  if(options.audio){s.gain=source.gain;s.audioStudio={...(s.audioStudio||{}),master:clone(source.audioStudio?.master||{})};}
  if(options.media){s.media=clone(source.media||s.media||{});s.media.items=remap(s.media.items,from,to,{media:true,extend:true});}
  // Spoken text, destructive cuts and narration are specific to each destination clip.
  v.start=to.start;v.end=to.end;v.seek=to.start;s.cues=clone(target.cues||[]);return s;
 }
 return {themes,queries,candidates,rank,cleanEdit,interval,remap,forCard,applyStyle,clamp};
});
