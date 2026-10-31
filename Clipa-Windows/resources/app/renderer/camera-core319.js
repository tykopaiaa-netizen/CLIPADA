'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.ClipaCameraCore=api;})(globalThis,()=>{
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(+n)?+n:a));
 function rect(r){if(!r||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0)return null;const w=clamp(r.w,.002,1),h=clamp(r.h,.002,1);return {x:clamp(r.x,0,1-w),y:clamp(r.y,0,1-h),w,h};}
 function strokes(list){let count=0;return (Array.isArray(list)?list:[]).slice(-200).map(s=>({mode:s?.mode==='restore'?'restore':'erase',size:clamp(s?.size,.005,.3),points:(Array.isArray(s?.points)?s.points:[]).slice(0,Math.max(0,12000-count)).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>{count++;return {x:clamp(p.x,0,1),y:clamp(p.y,0,1)};})})).filter(s=>s.points.length);}
 function normalize(value){const modes={};for(const mode of ['wide','short','composition']){modes[mode]={};for(const key of ['inline','cam1','cam2']){const r=value?.modes?.[mode]?.[key];modes[mode][key]={enabled:!!r?.enabled,rect:rect(r?.rect),chair:clamp(r?.chair??.65,0,1),strokes:strokes(r?.strokes)};}}return {version:1,modes};}
 function alpha(mask,threshold,soft,strength){const n=mask.values.length,out=new Uint8ClampedArray(n),s=clamp(strength,0,1);for(let i=0;i<n;i++){const base=clamp(mask.values[i],0,1),strict=mask.strict?.length===n?clamp(mask.strict[i],0,1):base,v=base*(1-s)+Math.min(base,strict)*s,a=clamp((v-threshold+soft)/(2*soft),0,1);out[i]=Math.round(a*a*(3-2*a)*255);}return out;}
 function destination(r,g,sw,sh,x=0,y=0){return {x:x+g.dx+(r.x*sw-g.sx)*g.dw/g.sw,y:y+g.dy+(r.y*sh-g.sy)*g.dh/g.sh,w:r.w*sw*g.dw/g.sw,h:r.h*sh*g.dh/g.sh};}
 return {clamp,rect,strokes,normalize,alpha,destination};
});
