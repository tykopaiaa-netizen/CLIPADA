'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.ClipaMaskRefine=api;})(globalThis,()=>{
 // Remove only tiny, disconnected alpha components; keep the person's main contour.
 function clean(data,width,height){
  const n=width*height,minimum=Math.max(4,Math.min(48,Math.floor(n*.00015))),seen=new Uint8Array(n),queue=new Int32Array(n);
  for(let start=0;start<n;start++){
   if(seen[start]||data[start*4+3]<16)continue;
   let head=0,tail=1;queue[0]=start;seen[start]=1;
   while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const next=ny*width+nx;
     if(!seen[next]&&data[next*4+3]>=16){seen[next]=1;queue[tail++]=next;}
    }
   }
   if(tail<minimum)for(let i=0;i<tail;i++)data[queue[i]*4+3]=0;
  }
  return data;
 }
 return {clean};
});
