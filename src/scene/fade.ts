/** 換地點的轉場:畫面短暫淡成深色再淡回來。刻意做得很溫和,不閃、不碎 */
export function createFadeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.id = 'fade';
  document.body.appendChild(c);
  return c;
}

export function dissolve(el: HTMLElement, ms: number, mode: 'in' | 'out'): Promise<void> {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduce || typeof el.animate !== 'function') {
    el.style.display = mode === 'in' ? 'block' : 'none';
    el.style.background = '#10141c';
    el.style.opacity = mode === 'in' ? '1' : '0';
    return Promise.resolve();
  }
  el.style.display = 'block';
  el.style.background = '#10141c';
  const frames = mode === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
  const anim = el.animate(frames, { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
  return anim.finished.then(
    () => {
      if (mode === 'out') {
        el.style.display = 'none';
        el.getAnimations().forEach((a) => a.cancel());
      }
    },
    () => { /* 被打斷就算了 */ },
  );
}
