import Masonry from 'masonry-layout';

export function mountGameWaterfalls(root: ParentNode): () => void {
  const cleanups: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>('.game-grid').forEach(container => {
    const masonry = new Masonry(container, {
      itemSelector: '.game-card',
      columnWidth: '.game-sizer',
      gutter: '.gutter-sizer',
      percentPosition: true,
      horizontalOrder: true,
      transitionDuration: 0,
    });
    container.dataset.layout = 'masonry';
    let raf = 0;
    const layout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => masonry.layout?.()); };
    const observer = new ResizeObserver(layout);
    container.querySelectorAll('.game-card').forEach(card => observer.observe(card));
    container.querySelectorAll('img').forEach(image => { image.addEventListener('load', layout); image.addEventListener('error', layout); });
    layout();
    cleanups.push(() => {
      cancelAnimationFrame(raf); observer.disconnect();
      container.querySelectorAll('img').forEach(image => { image.removeEventListener('load', layout); image.removeEventListener('error', layout); });
      masonry.destroy?.();
    });
  });
  return () => cleanups.forEach(cleanup => cleanup());
}
