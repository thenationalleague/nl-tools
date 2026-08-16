import{f as m,a as h,e as a}from"./cms.BqjdAT1J.js";const g="/site-demo".replace(/\/?$/,"/");document.querySelectorAll("[data-news-grid]").forEach(async s=>{const r=parseInt(s.getAttribute("data-count")||"8",10),o=s.getAttribute("data-with-hero")==="1";try{const c=await m(o?r+1:r),t=o?c.shift():null;if(t){const e=document.querySelector("[data-hero]");if(e){const n=e.querySelector(".hero__media");n&&t.image&&(n.style.backgroundImage=`url("${t.image}")`);const i=e.querySelector("[data-hero-kicker]");i&&t.category&&(i.textContent=t.category);const l=e.querySelector("[data-hero-title]");l&&(l.textContent=t.title);const d=e.querySelector("[data-hero-sub]");d&&(d.textContent=t.description||h(t.published));const u=e.querySelector("[data-hero-link]");u&&(u.href=g+"news/article/?slug="+encodeURIComponent(t.slug))}}s.innerHTML=c.slice(0,r).map(e=>`
        <a class="news-card" href="${g}news/article/?slug=${encodeURIComponent(e.slug)}">
          ${e.image?`<img class="news-card__img" src="${a(e.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:'<div class="news-card__img"></div>'}
          <div class="news-card__body">
            ${e.category?`<span class="news-card__cat">${a(e.category)}</span>`:""}
            <h3 class="news-card__title">${a(e.title)}</h3>
            <span class="news-card__date">${a(h(e.published))}</span>
          </div>
        </a>`).join("")}catch{s.outerHTML='<div class="news-fallback">Couldn’t reach the news service just now — refresh to try again.</div>'}});
