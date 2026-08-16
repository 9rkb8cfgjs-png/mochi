// ===== 功能：桌面左右滑动翻页（scroll-snap 原生滚动） =====
// 支持触摸/鼠标横向拖动（原生滚动），指示器圆点点击切换
(function () {
  const pages = document.getElementById('desktop-pages');
  if (!pages) return;
  const slides = pages.querySelectorAll('.page-slide');
  const dots = Array.prototype.slice.call(document.querySelectorAll('#desktop-dots .dot'));
  if (slides.length < 2) return;

  let idx = 0;

  function go(i) {
    idx = Math.max(0, Math.min(slides.length - 1, i));
    // v3.5.132：页面隐藏（display:none）时 clientWidth=0，直接赋值会产生 Infinity 下标
    if (!pages.clientWidth) return;
    // 直接赋值 scrollLeft 立即切换（scroll-snap 会自动吸附），避免 smooth 滚动被 snap 打断
    pages.scrollLeft = idx * pages.clientWidth;
    dots.forEach((d, k) => d.classList.toggle('active', k === idx));
  }

  function sync() {
    // v3.5.132：隐藏时跳过（防抖窗口内切页 → clientWidth=0 → idx 写坏、圆点全灭）
    if (!pages.clientWidth) return;
    const pos = pages.scrollLeft / pages.clientWidth;
    const cur = Math.round(pos);
    if (cur !== idx) {
      idx = cur;
      dots.forEach((d, k) => d.classList.toggle('active', k === idx));
    }
  }

  // 原生滚动结束（含触摸松手、滚轮）后同步圆点
  let scrollTimer = null;
  pages.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(sync, 120);
  }, { passive: true });

  dots.forEach((d, i) => d.addEventListener('click', () => go(i)));

  // v3.5.132：旋转后按新宽度重设 scrollLeft（否则停在 1.x 页位置，圆点与内容不符）
  window.addEventListener('resize', () => {
    if (pages.clientWidth) pages.scrollLeft = idx * pages.clientWidth;
  });

  // v3.6.x：桌面页隐藏时（切到聊天/设置等）旋转，resize 里 clientWidth=0 会跳过——
  // 返回桌面时按新宽度重设一次，避免 scrollLeft 停在两页之间、圆点与内容错位
  const phonePage = document.getElementById('page-phone');
  if (phonePage) {
    const mo = new MutationObserver(() => {
      if (!phonePage.hidden && pages.clientWidth) {
        pages.scrollLeft = idx * pages.clientWidth;
        sync();
      }
    });
    mo.observe(phonePage, { attributes: true, attributeFilter: ['hidden'] });
  }

  sync();
})();
