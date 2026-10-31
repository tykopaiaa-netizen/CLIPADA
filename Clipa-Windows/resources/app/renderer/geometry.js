'use strict';
const ClipGeometry = {
  output(choice, sourceW, sourceH) {
    if(choice==='original') return {w:Math.max(2,Math.floor(sourceW/2)*2),h:Math.max(2,Math.floor(sourceH/2)*2)};
    return choice==='1080'?{w:1920,h:1080}:{w:1280,h:720};
  },
  clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n));},
  effective(base, zoom, center){
    const w=base.w/zoom,h=base.h/zoom;
    return {x:this.clamp(center.x-w/2,base.x,base.x+base.w-w),y:this.clamp(center.y-h/2,base.y,base.y+base.h-h),w,h};
  },
  layout(rect,sourceW,sourceH,outW,outH,fit){
    const sx=rect.x*sourceW,sy=rect.y*sourceH,sw=rect.w*sourceW,sh=rect.h*sourceH;
    const scale=(fit==='cover'?Math.max:Math.min)(outW/sw,outH/sh);
    const dw=sw*scale,dh=sh*scale;
    return {sx,sy,sw,sh,dx:(outW-dw)/2,dy:(outH-dh)/2,dw,dh};
  },
  selection(a,b,sourceW,sourceH,lock){
    let w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);const dx=b.x>=a.x?1:-1,dy=b.y>=a.y?1:-1;
    if(lock&&lock!=='free'){const aspect=lock==='9:16'?9/16:lock==='source'?sourceW/sourceH:16/9;const ratio=aspect*sourceH/sourceW;if(w/h>ratio)w=h*ratio;else h=w/ratio;}
    return {x:dx>0?a.x:a.x-w,y:dy>0?a.y:a.y-h,w,h};
  }
};
