import{f as m,a as u,e as o}from"./cms.BqjdAT1J.js";const g="/site-demo".replace(/\/?$/,"/");function y(){document.querySelectorAll("[data-news-grid]").forEach(async a=>{const c=parseInt(a.getAttribute("data-count")||"8",10),n=a.getAttribute("data-with-hero")==="1";try{const r=await m(n?c+1:c),t=n?r.shift():null;if(t){const e=document.querySelector("[data-hero]");if(e){const s=e.querySelector("[data-hero-img]");s&&t.image&&(s.onload=()=>s.classList.add("is-loaded"),s.src=t.image);const i=e.querySelector("[data-hero-kicker]");i&&t.category&&(i.textContent=t.category);const l=e.querySelector("[data-hero-title]");l&&(l.textContent=t.title);const d=e.querySelector("[data-hero-sub]");d&&(d.textContent=t.description||u(t.published));const h=e.querySelector("[data-hero-link]");h&&(h.href=g+"news/article/?slug="+encodeURIComponent(t.slug))}}a.innerHTML=r.slice(0,c).map(e=>`
          <a class="news-card" href="${g}news/article/?slug=${encodeURIComponent(e.slug)}">
            <div class="news-card__media">
              ${e.image?`<img class="news-card__img" src="${o(e.image)}" alt="" loading="lazy" onload="this.classList.add('is-loaded')" onerror="this.style.visibility='hidden'">`:""}
            </div>
            <div class="news-card__body">
              ${e.category?`<span class="news-card__cat">${o(e.category)}</span>`:""}
              <h3 class="news-card__title">${o(e.title)}</h3>
              <span class="news-card__date">${o(u(e.published))}</span>
            </div>
          </a>`).join("")}catch{a.outerHTML='<div class="news-fallback">Couldn’t reach the news service just now — refresh to try again.</div>'}})}document.addEventListener("astro:page-load",y);
