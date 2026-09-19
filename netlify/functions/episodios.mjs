/**
 * Netlify Function: /api/episodios
 * ---------------------------------------------------------------------------
 * Lee el RSS publico de RSC Radio Internacional, se queda con los episodios
 * de VINCULANDONOS y devuelve los ultimos 8 en JSON, cacheados una hora.
 *
 * Donde va este archivo:
 *   tu-repo/
 *     netlify.toml
 *     public/index.html
 *     netlify/functions/episodios.mjs  <- este archivo
 *
 * La extension .mjs importa: le dice a Netlify que el archivo usa sintaxis
 * de modulos ES (el "export default" de abajo). Con .js hay que declararlo
 * aparte en un package.json, asi es una cosa menos.
 *
 * La redireccion de /api/episodios a esta funcion esta en netlify.toml.
 * ---------------------------------------------------------------------------
 */

const FEED = 'https://anchor.fm/s/640c21dc/podcast/rss';
const FILTRO = /vincul/i;
const MAXIMO = 8;
const CACHE_SEGUNDOS = 3600;

export default async function handler() {
  let episodios = [];
  let error = null;

  try {
    const r = await fetch(FEED, {
      headers: { 'user-agent': 'noeliapadin.com/1.0 (+https://noeliapadin.com)' }
    });
    if (!r.ok) throw new Error('El feed respondio ' + r.status);
    episodios = parsear(await r.text());
  } catch (e) {
    error = String(e && e.message ? e.message : e);
  }

  return new Response(
    JSON.stringify({
      programa: 'VINCULANDONOS',
      actualizado: new Date().toISOString(),
      error,
      episodios
    }),
    {
      status: error && !episodios.length ? 502 : 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=600',
        'netlify-cdn-cache-control': 'public, s-maxage=' + CACHE_SEGUNDOS + ', stale-while-revalidate=86400',
        'access-control-allow-origin': '*'
      }
    }
  );
}

/* -------------------------------------------------------------------------- */

function parsear(xml) {
  const salida = [];
  let desde = 0;

  while (salida.length < MAXIMO) {
    const ini = xml.indexOf('<item>', desde);
    if (ini === -1) break;
    const fin = xml.indexOf('</item>', ini);
    if (fin === -1) break;

    const item = xml.slice(ini, fin);
    desde = fin + 7;

    const titulo = texto(etiqueta(item, 'title'));
    if (!titulo || !FILTRO.test(titulo)) continue;

    const audio = atributo(item, 'enclosure', 'url');
    if (!audio) continue;

    salida.push({
      titulo,
      fecha: texto(etiqueta(item, 'pubDate')),
      duracion: texto(etiqueta(item, 'itunes:duration')),
      audio,
      imagen: atributo(item, 'itunes:image', 'href'),
      enlace: texto(etiqueta(item, 'link'))
    });
  }

  return salida;
}

function etiqueta(item, nombre) {
  const abre = item.indexOf('<' + nombre);
  if (abre === -1) return '';
  const cierraAbre = item.indexOf('>', abre);
  const cierra = item.indexOf('</' + nombre + '>', cierraAbre);
  if (cierraAbre === -1 || cierra === -1) return '';
  return item.slice(cierraAbre + 1, cierra);
}

function atributo(item, nombre, attr) {
  const abre = item.indexOf('<' + nombre);
  if (abre === -1) return '';
  const cierra = item.indexOf('>', abre);
  const trozo = item.slice(abre, cierra);
  const m = new RegExp(attr + '\\s*=\\s*"([^"]*)"').exec(trozo);
  return m ? desescapar(m[1]) : '';
}

function texto(bruto) {
  return desescapar(
    String(bruto).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '')
  ).trim();
}

function desescapar(t) {
  return String(t)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
