/* 物件照片對照表（2026-09-18）
 *
 * 為什麼照片不是 Worker 給的：Ragic 那個「照片」欄位裝的是業務本人的大頭照，不是房子
 * （同一位業務名下三間不同的房子，照片欄都是同一張臉），所以 Worker 的 hasPhoto 永遠回 false。
 * 真正的房屋照片是業務自己拍、自己上傳到 591 的，本檔讀的是一張由 Mac Mini 每天重建的
 * 對照表：哪一筆物件配哪幾張圖。
 *
 * 為什麼只存網址不存圖：Joan 核准這件事時的條件是「別占用 ragic 空間」。整套設計因此
 * 一張圖都不落地——Ragic 不放、這個 repo 不放、Mac Mini 也不放，只保管網址，
 * 對照表本身只有幾十 KB。
 *
 * 591 圖床網址一定要接縮圖參數才讀得到（裸網址回 403）：
 *   !750x.jpg           列表縮圖
 *   !1000x.jpg          大圖，沒有 591 浮水印
 *   !1000x.water2.jpg   大圖，蓋 591 浮水印（只當退路）
 */
window.ListingPhotos = (function () {
  const SRC = 'data/listing-photos.json';
  let map = {};
  let thumb = '!750x.jpg';
  let full = '!1000x.jpg';
  let fallback = '!1000x.water2.jpg';
  let generatedAt = '';
  let loaded = null;

  function load() {
    // 同一頁可能有多處要用，只真的抓一次
    if (loaded) return loaded;
    loaded = fetch(SRC, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        map = d.listings || {};
        thumb = d.variantThumb || thumb;
        full = d.variantFull || full;
        fallback = d.variantFallback || fallback;
        generatedAt = d.generatedAt || '';
      })
      .catch(() => {
        // 對照表拿不到就維持「尚無照片」的樣子，不要讓整頁掛在這裡
      });
    return loaded;
  }

  function of(id) { return map[String(id)] || []; }

  // 給 <img> 用：主網址 + onerror 退路，兩者都要接參數
  function imgTag(base, variant, attrs) {
    return '<img src="' + base + variant + '" ' +
      'onerror="this.onerror=null;this.src=\'' + base + fallback + '\'" ' +
      (attrs || '') + '>';
  }

  return {
    load: load,
    of: of,
    has: function (id) { return of(id).length > 0; },
    count: function (id) { return of(id).length; },
    thumbTag: function (base, attrs) { return imgTag(base, thumb, attrs); },
    fullTag: function (base, attrs) { return imgTag(base, full, attrs); },
    generatedAt: function () { return generatedAt; }
  };
})();
