/* Deterministic, timestamp-based face tracking shared by preview and export. */
(function(root){
 'use strict';
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 function validRect(r){return r&&['x','y','w','h'].every(k=>Number.isFinite(r[k]))&&r.w>0&&r.h>0&&r.x>=0&&r.y>=0&&r.x+r.w<=1.00001&&r.y+r.h<=1.00001;}
 function signature(r){return ['x','y','w','h'].map(k=>Number(r[k]).toFixed(4)).join(':');}
 function choose(faces,last,bounds,dt){
  const candidates=faces.filter(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)&&f.score>=.6&&f.x>=bounds.x&&f.x<=bounds.x+bounds.w&&f.y>=bounds.y&&f.y<=bounds.y+bounds.h);
  const target=last||{x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2};
  candidates.sort((a,b)=>Math.hypot((a.x-target.x)/bounds.w,(a.y-target.y)/bounds.h)-Math.hypot((b.x-target.x)/bounds.w,(b.y-target.y)/bounds.h));
  const f=candidates[0];if(!f)return null;
  if(last&&Math.hypot((f.x-last.x)/bounds.w,(f.y-last.y)/bounds.h)>Math.min(.8,.22+dt*.4))return null;
  return f;
 }
 function sample(track,t,base){
  if(!track?.enabled||!validRect(base)||track.signature!==signature(base)||!Array.isArray(track.points)||track.points.length<2||t<track.start||t>track.end)return base;
  const p=track.points;let low=0,high=p.length-1;
  while(low+1<high){const mid=(low+high)>>1;if(p[mid].t<=t)low=mid;else high=mid;}
  const a=p[low],b=p[high],u=clamp((t-a.t)/(b.t-a.t||1),0,1),smooth=u*u*(3-2*u);
  const x=a.x+(b.x-a.x)*smooth,y=a.y+(b.y-a.y)*smooth;
  const limit=track.bounds||{x:0,y:0,w:1,h:1};
  return {...base,x:clamp(x-base.w/2,limit.x,limit.x+limit.w-base.w),y:clamp(y-base.h/2,limit.y,limit.y+limit.h-base.h)};
 }
 function validate(state){const out={};for(const [key,t]of Object.entries(state||{})){
  if(!/^(wide|short|composition):(content|cam1|cam2)$/.test(key)||!validRect(t.base)||!validRect(t.bounds)||!Array.isArray(t.points)||t.points.length>18001)continue;
  if(!Number.isFinite(t.start)||!Number.isFinite(t.end)||t.end<=t.start)continue;
  if(t.points.some((p,i)=>!Number.isFinite(p.t)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1||(i&&p.t<=t.points[i-1].t)))continue;
  out[key]={...t,enabled:!!t.enabled};
 }return out;}
 const api={clamp,validRect,signature,choose,sample,validate};root.ClipTracking=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
