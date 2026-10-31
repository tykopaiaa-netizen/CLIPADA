'use strict';
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.ClipaLayoutCore = api;
})(globalThis, () => {
  const clamp = (n, lo, hi, fallback = lo) => Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : fallback));
  function normalize(value) {
    const v = value?.vertical || {}, top = clamp(v.top ?? .28, .08, .82);
    const bottom = clamp(v.bottom ?? .28, .08, .9 - top);
    return {version:1, vertical:{top, bottom, fits:Object.fromEntries(['cam1','content','cam2'].map(k => [k, ['contain','cover'].includes(v.fits?.[k]) ? v.fits[k] : k === 'content' ? 'cover' : 'contain']))}, locks:{wide:value?.locks?.wide !== false, composition:value?.locks?.composition !== false, media:value?.locks?.media !== false}};
  }
  function slots(w, h, count, value) {
    const v = normalize(value).vertical, top = h * v.top, bottom = h * v.bottom;
    if (!count) return [{key:'content',x:0,y:0,w,h}];
    if (count === 1) return [{key:'cam1',x:0,y:0,w,h:top},{key:'content',x:0,y:top,w,h:h-top}];
    return [{key:'cam1',x:0,y:0,w,h:top},{key:'content',x:0,y:top,w,h:h-top-bottom},{key:'cam2',x:0,y:h-bottom,w,h:bottom}];
  }
  // Deltas are normalized to the output canvas; preserve the box's pixel aspect.
  function resize(r, dx, dy, corner = 'se', locked = true, bounded = true) {
    const east = corner.includes('e'), south = corner.includes('s');
    let w = Math.max(.02, r.w + dx * (east ? 1 : -1)), h = Math.max(.02, r.h + dy * (south ? 1 : -1));
    if (locked) {
      const scale = Math.abs(dx / r.w) >= Math.abs(dy / r.h) ? w / r.w : h / r.h;
      w = r.w * scale; h = r.h * scale;
    }
    const maxW = bounded ? east ? 1 - r.x : r.x + r.w : 4;
    const maxH = bounded ? south ? 1 - r.y : r.y + r.h : 4;
    if (locked) { const scale = Math.min(1, maxW / w, maxH / h); w *= scale; h *= scale; }
    else { w = Math.min(w,maxW); h = Math.min(h,maxH); }
    return {x:east?r.x:r.x+r.w-w,y:south?r.y:r.y+r.h-h,w,h};
  }
  function aspectRect(r, sourceAspect, outputAspect) {
    const ratio = sourceAspect / outputAspect;
    let w = clamp(r.w,.02,1), h = w / ratio;
    if (h > 1) { h = 1; w = ratio; }
    return {x:clamp(r.x,0,1-w),y:clamp(r.y,0,1-h),w,h};
  }
  return {clamp, normalize, slots, resize, aspectRect};
});
