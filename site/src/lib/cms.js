// Client-side NL CMS access. The CMS API is browser-callable from nl.tools
// (website-archive already does byslug fetches from this origin). All calls
// run in the visitor's browser — nothing is fetched at build time.

const SEARCH_BASE = 'https://news.cms.web.gc.nationalleagueservices.co.uk/v2/search';
const BYSLUG_BASE = 'https://news.cms.web.gc.nationalleagueservices.co.uk/v1/byslug';
const S3_IMAGE_BASE = 'https://s3.eu-west-1.amazonaws.com/gc-media-assets-v2.gc.nationalleagueservices.co.uk/';
const NLS_IMAGE_BASE_SIZED = 'https://images.gc.nationalleagueservices.co.uk/fit-in/';

// The raw S3 bucket answers 403 to anonymous requests; the image service in
// front of it does answer, and serves resized variants.
export function nlsImage(url, size) {
  if (!url) return '';
  const s = String(url);
  const key = s.indexOf(S3_IMAGE_BASE) === 0 ? s.slice(S3_IMAGE_BASE.length) : null;
  if (!key) return s;
  return NLS_IMAGE_BASE_SIZED + (size || '1440x1440') + '/' + key;
}

export function resolveImage(imgData, size) {
  if (!imgData) return '';
  if (typeof imgData === 'string') return nlsImage(imgData, size);
  if (imgData.location) return nlsImage(imgData.location, size);
  if (imgData.key) return nlsImage(S3_IMAGE_BASE + imgData.key, size);
  if (imgData.id) return NLS_IMAGE_BASE_SIZED + (size || '1440x1440') + '/' + imgData.id + '.jpg';
  if (imgData.url) return imgData.url;
  return '';
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T'));
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function fetchLatest(count) {
  const params = new URLSearchParams({
    'page.number': '1',
    'page.size': String(count || 12),
    'sort': 'publishedDateTime:desc'
  });
  const resp = await fetch(SEARCH_BASE + '?' + params, { headers: { accept: '*/*' } });
  if (!resp.ok) throw new Error('search HTTP ' + resp.status);
  const json = await resp.json();
  const list = json.data || [];
  return list.map((a) => {
    const attr = a.attributes || a;
    return {
      id: attr.postID || a.id || '',
      title: attr.postTitle || '',
      description: attr.description || '',
      author: (attr.postAuthor || '').trim(),
      published: attr.publishedDateTime || '',
      category: attr.newsCategory || attr.postCategoryName || '',
      slug: attr.postSlug || '',
      image: resolveImage(attr.imageData, '800x450')
    };
  }).filter((a) => a.title && a.slug);
}

export async function fetchArticle(slug) {
  const resp = await fetch(BYSLUG_BASE + '?postSlug=' + encodeURI(slug), { headers: { accept: '*/*' } });
  if (!resp.ok) throw new Error('byslug HTTP ' + resp.status);
  const json = await resp.json();
  if (!json.success || !json.body) return null;
  return json.body;
}

// Render the CMS row/widget body structure to HTML — widget handling mirrors
// website-archive's proven renderer.
export function renderBody(body) {
  if (!Array.isArray(body) || !body[0]) return '';
  const content = body[0].content;
  if (!Array.isArray(content)) return '';
  let html = '';
  content.forEach((row) => {
    if (!row || !row.rowData) return;
    const widget = row.rowData;
    const data = widget.widgetData;
    if (!data) return;
    if (widget.widgetType === 'TextBlockWidget') {
      if (data.content) html += data.content;
    } else if (widget.widgetType === 'ImageWidget') {
      const url = resolveImage(data.image || data, '1440x1440');
      if (url) {
        html += '<figure><img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'">' +
          (data.image && data.image.description ? '<figcaption>' + esc(data.image.description) + '</figcaption>' : '') +
          '</figure>';
      }
    } else if (widget.widgetType === 'ImageGalleryWidget') {
      (data.gallery || []).forEach((g) => {
        const url = resolveImage(g, '1440x1440');
        if (url) html += '<figure><img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></figure>';
      });
    } else if (widget.widgetType === 'QuoteWidget') {
      html += '<blockquote>' + esc(data.text || '') +
        (data.fullName ? '<footer>' + esc(data.fullName) + (data.jobTitle ? ', ' + esc(data.jobTitle) : '') + '</footer>' : '') +
        '</blockquote>';
    }
  });
  return html;
}

export function articleHero(body) {
  if (!Array.isArray(body) || !body[0]) return '';
  return resolveImage(body[0].imageData, '1440x1440');
}
