'use strict';
const ClipComposition={
 defaults(){return {orientation:'wide',background:'#202020',backgroundCrop:{x:0,y:0,w:1,h:1},backgroundTransform:{fit:'cover',zoom:1,x:0,y:0},divider:{enabled:false,x:.34,width:3,color:'#ffffff'},layers:{content:{from:{x:.36,y:.19,w:.62,h:.62},to:{x:.36,y:0,w:.62,h:.62},hold:0,move:8,fit:'contain',motion:'bounce',down:6,up:10,topHold:5},cam1:{from:{x:.02,y:.25,w:.30,h:.5},to:{x:.02,y:.25,w:.30,h:.5},hold:0,move:0,fit:'cover',motion:'still',down:6,up:10,topHold:5}}};},
 rect(layer,time){
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  if(layer.motion==='still')return {...layer.from};
  if(layer.motion==='bounce'){
   const r={...layer.from},bottom=1-r.h,down=Math.max(.1,layer.down||6),up=Math.max(.1,layer.up||10),hold=Math.max(0,layer.topHold??5);let t=Math.max(0,time);
   if(t<down){r.y=layer.from.y+(bottom-layer.from.y)*smooth(t/down);return r;}
   t-=down;if(t<up){r.y=bottom*(1-smooth(t/up));return r;}
   t-=up;if(t<hold){r.y=0;return r;}
   t=(t-hold)%(down+up+hold);
   r.y=t<down?bottom*smooth(t/down):t<down+up?bottom*(1-smooth((t-down)/up)):0;return r;
  }
  const q=layer.move<=0?(time>=layer.hold?1:0):Math.max(0,Math.min(1,(time-layer.hold)/layer.move));const t=smooth(q),r={};for(const k of ['x','y','w','h'])r[k]=layer.from[k]+(layer.to[k]-layer.from[k])*t;return r;
 },
 validate(data){
  if(!data||data.type!=='clipa-composition'||![1,2].includes(data.version))throw Error('Escolha um modelo .json exportado pelo Clipa.');
  const n=(v,lo,hi)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error('Modelo com valores inválidos.');return v;};
  const rect=r=>{if(!r)throw Error('Modelo incompleto.');const o={};for(const k of ['x','y','w','h'])o[k]=n(r[k],k==='w'||k==='h'?.01:0,1);if(o.x+o.w>1.001||o.y+o.h>1.001)throw Error('Uma área do modelo ultrapassa a tela.');return o;};
  const color=v=>{if(!/^#[0-9a-f]{6}$/i.test(v))throw Error('Cor inválida.');return v;};
  const d=this.defaults(),s=data.composition;if(!s)throw Error('Modelo incompleto.');d.orientation=s.orientation==='vertical'?'vertical':'wide';d.background=color(s.background);d.backgroundCrop=rect(s.backgroundCrop);
  for(const key of ['content','cam1']){const l=s.layers?.[key];if(!l)throw Error('Camada ausente.');d.layers[key]={from:rect(l.from),to:rect(l.to),hold:n(l.hold,0,3600),move:n(l.move,0,3600),fit:l.fit==='cover'?'cover':'contain',motion:data.version===1?'once':(['still','once','bounce'].includes(l.motion)?l.motion:'once'),down:n(l.down??6,.1,3600),up:n(l.up??10,.1,3600),topHold:n(l.topHold??5,0,3600)};}
  if(data.version===2){const b=s.backgroundTransform||{},v=s.divider||{};d.backgroundTransform={fit:['cover','contain','stretch'].includes(b.fit)?b.fit:'cover',zoom:n(b.zoom??1,.25,4),x:n(b.x??0,-1,1),y:n(b.y??0,-1,1)};d.divider={enabled:v.enabled===true,x:n(v.x??.34,0,1),width:n(v.width??3,1,20),color:color(v.color||'#ffffff')};}else d.divider.enabled=false;
  const crops={};for(const k of ['content','cam1'])crops[k]=rect(data.crops?.[k]);return {composition:d,crops};
 }
};
