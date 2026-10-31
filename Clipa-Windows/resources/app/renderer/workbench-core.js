'use strict';
// Shared, deterministic geometry and audio automation. No network or DOM dependencies.
(function(root){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
 const rect=r=>{const w=clamp(Number(r?.w),.01,1),h=clamp(Number(r?.h),.01,1);return {x:clamp(Number(r?.x),0,1-w),y:clamp(Number(r?.y),0,1-h),w,h};};
 const ease=(t,kind='smooth')=>{t=clamp(t,0,1);return kind==='linear'?t:kind==='hold'?(t>=1?1:0):t*t*(3-2*t);};
 function keys(items,duration){return (Array.isArray(items)?items:[]).filter(k=>Number.isFinite(k?.time)&&k.time>=0&&k.time<=duration&&k.rect&&['x','y','w','h'].every(x=>Number.isFinite(k.rect[x]))).slice(0,120).map(k=>({time:k.time,rect:rect(k.rect)})).sort((a,b)=>a.time-b.time).filter((k,i,a)=>!i||k.time-a[i-1].time>.001);}
 function at(items,time,kind='smooth'){if(!items.length)return null;if(time<=items[0].time)return {...items[0].rect};for(let i=1;i<items.length;i++){if(time<=items[i].time){const a=items[i-1],b=items[i],q=ease((time-a.time)/(b.time-a.time),kind),r={};for(const p of ['x','y','w','h'])r[p]=a.rect[p]+(b.rect[p]-a.rect[p])*q;return rect(r);}}return {...items[items.length-1].rect};}
 function duckAt(t,edit){const n=edit?.narration;if(!edit?.ducking?.enabled||!n?.enabled||!n?.blob)return 1;const level=10**(-clamp(Number(edit.ducking.db)||12,0,30)/20),attack=.12*(n.rate||1),release=.35*(n.rate||1);let amount=0;for(const s of n.timings||[]){if(t<s.start-attack||t>s.end+release)continue;const v=t<s.start?(t-s.start+attack)/attack:t>s.end?1-(t-s.end)/release:1;amount=Math.max(amount,clamp(v,0,1));}return 1-(1-level)*ease(amount);}
 function markers(items,duration){return (Array.isArray(items)?items:[]).filter(m=>Number.isFinite(m?.start)&&m.start>=0&&m.start<=duration&&(m.end==null||Number.isFinite(m.end)&&m.end>m.start&&m.end<=duration)).slice(0,200).map((m,i)=>({id:typeof m.id==='string'?m.id.slice(0,80):'mark-'+i,start:m.start,end:m.end??null,name:String(m.name||'Marca '+(i+1)).slice(0,80)})).sort((a,b)=>a.start-b.start);}
 const api={clamp,rect,ease,keys,at,duckAt,markers};root.ClipaWorkbenchCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
