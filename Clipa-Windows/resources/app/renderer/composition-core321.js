'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.ClipaCompositions321=api;})(globalThis,()=>{
 const clamp=(n,a,b,f=a)=>Math.max(a,Math.min(b,Number.isFinite(Number(n))?Number(n):f));
 const keys=['content','cam1','cam2'];
 const names={content:'Vídeo principal',cam1:'Câmera 1',cam2:'Câmera 2'};
 const box=(key,x,y,w,h,extra={})=>({key,name:names[key],rect:{x,y,w,h},fit:'cover',...extra});
 const presets=[
  {id:'full',name:'Tela inteira',hint:'Um quadro. Enquadre livremente.',family:'Essenciais',layers:[box('content',0,0,1,1)]},
  {id:'top',name:'Câmera em cima',hint:'Reação no topo; conteúdo embaixo.',family:'Essenciais',layers:[box('content',0,.32,1,.68),box('cam1',0,0,1,.32)],split:'y'},
  {id:'bottom',name:'Câmera embaixo',hint:'Conteúdo no topo; reação na base.',family:'Essenciais',layers:[box('content',0,0,1,.68),box('cam1',0,.68,1,.32)],split:'y'},
  {id:'three',name:'Duas câmeras',hint:'Câmera, conteúdo e outra câmera.',family:'Multicâmera',layers:[box('content',0,.24,1,.52),box('cam1',0,0,1,.24),box('cam2',0,.76,1,.24)]},
  {id:'left',name:'Câmera à esquerda',hint:'Câmera lateral e conteúdo maior.',family:'Essenciais',layers:[box('content',.3,0,.7,1),box('cam1',0,0,.3,1)],split:'x'},
  {id:'right',name:'Câmera à direita',hint:'Conteúdo ocupa 70% da largura.',family:'Essenciais',layers:[box('content',0,0,.7,1),box('cam1',.7,0,.3,1)],split:'x'},
  {id:'duo',name:'Lado a lado',hint:'Dois recortes com o mesmo espaço.',family:'Multicâmera',layers:[box('content',0,0,.5,1),box('cam1',.5,0,.5,1)],split:'x'},
  {id:'columns',name:'Três colunas',hint:'Duas câmeras nas laterais.',family:'Multicâmera',layers:[box('content',.24,0,.52,1),box('cam1',0,0,.24,1),box('cam2',.76,0,.24,1)]},
  {id:'trio',name:'Conversa em trio',hint:'Três áreas independentes.',family:'Multicâmera',layers:[box('content',0,.5,1,.5),box('cam1',0,0,.5,.5),box('cam2',.5,0,.5,.5)]},
  {id:'pip',name:'Câmera flutuante',hint:'Câmera no canto sobre o vídeo.',family:'Sobreposição',layers:[box('content',0,0,1,1),box('cam1',.68,.65,.29,.3,{radius:.08,border:2})]},
  {id:'circle',name:'Câmera circular',hint:'Mova e ajuste o círculo na prévia.',family:'Sobreposição',circle:true,layers:[box('content',0,0,1,1),box('cam1',.68,.63,.29,.29,{shape:'circle',border:3})]},
  {id:'blur',name:'Fundo desfocado',hint:'Preserva o conteúdo inteiro.',family:'Fundo',blur:true,layers:[box('content',.04,.04,.92,.92,{fit:'contain'})]},
  {id:'banner',name:'Câmera + cenário',hint:'Imagem de fundo, câmera e conteúdo.',family:'Fundo',layers:[box('content',.36,.13,.61,.74,{fit:'contain',radius:.03}),box('cam1',.03,.35,.29,.30,{radius:.04})]},
  {id:'banner-vertical',name:'Cenário vertical',hint:'Duas áreas e espaço para o seu fundo.',family:'Fundo',layers:[box('content',.05,.43,.9,.52,{fit:'contain',radius:.03}),box('cam1',.05,.06,.9,.285,{radius:.04})]},
  {id:'free',name:'Composição livre',hint:'Ponto de partida para suas camadas.',family:'Livre',layers:[box('content',.1,.1,.8,.8,{fit:'contain'})]}
 ];
 const ratios=['auto','16:9','9:16','1:1','4:5','3:4','4:3','21:9','32:9'];
 const rect=r=>({x:clamp(r?.x,-2,2,0),y:clamp(r?.y,-2,2,0),w:clamp(r?.w,.025,3,1),h:clamp(r?.h,.025,3,1)});
 function normalizeScene(s,duration=86400){if(!s||!Array.isArray(s.layers))return null;const seen=new Set();const layers=s.layers.filter(l=>l&&keys.includes(l.key)&&!seen.has(l.key)&&seen.add(l.key)).slice(0,3).map(l=>({key:l.key,name:String(l.name||names[l.key]).slice(0,80),rect:rect(l.rect),fit:['cover','contain'].includes(l.fit)?l.fit:'cover',shape:l.shape==='circle'?'circle':'rect',radius:clamp(l.radius,0,.5,0),rotation:clamp(l.rotation,-180,180,0),opacity:clamp(l.opacity,0,1,1),border:clamp(l.border,0,12,0),borderColor:/^#[a-f\d]{6}$/i.test(l.borderColor)?l.borderColor:'#ffffff',locked:!!l.locked,hidden:!!l.hidden,motion:['still','bounce'].includes(l.motion)?l.motion:'still',down:clamp(l.down,.1,3600,6),up:clamp(l.up,.1,3600,10),hold:clamp(l.hold,0,3600,5),clips:(Array.isArray(l.clips)?l.clips:[{start:0,end:duration}]).slice(0,500).map(c=>({id:String(c.id||'').slice(0,80)||'clip-'+Math.random().toString(36).slice(2),start:clamp(c.start,0,duration,0),end:clamp(c.end,0,duration,duration)})).filter(c=>c.end>c.start)}));return {version:1,preset:String(s.preset||'free').slice(0,100),name:String(s.name||'Composição').slice(0,80),ratio:ratios.includes(s.ratio)?s.ratio:'auto',blur:!!s.blur,color:/^#[a-f\d]{6}$/i.test(s.color)?s.color:'#12151c',split:['x','y'].includes(s.split)?s.split:null,selected:layers.some(l=>l.key===s.selected)?s.selected:layers[0]?.key||'content',layers};}
 function preset(id,duration,aspect=16/9){const p=presets.find(p=>p.id===id);if(!p)throw Error('Modelo desconhecido.');const s=normalizeScene({...p,preset:p.id,ratio:'auto'},duration);if(p.circle){const c=s.layers.find(l=>l.key==='cam1');c.rect.h=Math.min(.7,c.rect.w*aspect);c.rect.y=.96-c.rect.h;}return s;}
 function output(res,ratio){const [a,b]=ratio.split(':').map(Number),n=Math.max(2,Number(res)||1080),r=a/b;let w=r>=1?n*r:n,h=r>=1?n:n/r;const k=Math.min(1,3840/Math.max(w,h));return {w:Math.max(2,Math.round(w*k/2)*2),h:Math.max(2,Math.round(h*k/2)*2)};}
 function invert(s){const a=s.layers.find(l=>l.key==='cam1'),b=s.layers.find(l=>l.key==='content');if(!a||!b)return false;const r=a.rect;a.rect=b.rect;b.rect=r;s.preset='custom';return true;}
 function trim(clips,start,end){return clips.flatMap(c=>{if(end<=c.start||start>=c.end)return [c];const out=[];if(c.start<start)out.push({...c,end:start});if(c.end>end)out.push({...c,id:c.id+'-r',start:end});return out;});}
 return {clamp,keys,names,presets,ratios,rect,normalizeScene,preset,output,invert,trim};
});
