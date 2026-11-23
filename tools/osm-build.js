// Construit golfs-gironde.json (format "parcours" de l'app) a partir des donnees OSM brutes.
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, 'osm-raw');
const OUT = process.argv[2];

const GOLFS = [
  {osm: 'way/482575201', files: ['arcachon'], all: true, name: "Golf d'Arcachon", city: 'La Teste-de-Buch'},
  {osm: 'way/113952460', files: ['gujan'], all: true, name: 'Golf de Gujan', city: 'Gujan-Mestras', split: true},
  {osm: 'way/321053318', files: ['aiguilles-vertes'], all: true, name: 'Golf des Aiguilles Vertes', city: 'Lanton'},
  {osm: 'way/1391610280', files: ['lacanau-mejanne', 'ugolf-lacanau'], name: 'Golf de Lacanau La Méjanne', city: 'Lacanau'},
  {osm: 'relation/964503', files: ['lacanau-mejanne', 'ugolf-lacanau'], name: 'UGOLF Lacanau', city: 'Lacanau'},
];

const rad = d => d * Math.PI / 180;
const hav = (a, b) => { const dl = rad(b.lat - a.lat), dg = rad(b.lng - a.lng); const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dg / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const r6 = v => +v.toFixed(6), r7 = v => +v.toFixed(7);
const uid = () => 'osm' + Math.random().toString(36).slice(2, 9);

function load(files) {
  const nodes = new Map(), ways = new Map(), rels = new Map();
  for (const f of files) for (const e of JSON.parse(fs.readFileSync(path.join(RAW, f + '.json'))).elements) {
    if (e.type === 'node') nodes.set(e.id, {lat: e.lat, lng: e.lon});
    else if (e.type === 'way') ways.set(e.id, e);
    else if (e.type === 'relation') rels.set(e.id, e);
  }
  const geom = w => w.nodes.map(id => nodes.get(id)).filter(Boolean);
  return {nodes, ways, rels, geom};
}
// assemble les anneaux d'un multipolygone a partir de segments de ways
function rings(segs) {
  const out = [], pool = segs.map(s => s.slice());
  while (pool.length) {
    let ring = pool.shift();
    let grew = true;
    while (grew && ring[0] !== ring[ring.length - 1]) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i], a = ring[ring.length - 1];
        if (s[0] === a) ring = ring.concat(s.slice(1));
        else if (s[s.length - 1] === a) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    out.push(ring);
  }
  return out;
}
function inPoly(p, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < (b.lng - a.lng) * (p.lat - a.lat) / (b.lat - a.lat) + a.lng) ins = !ins;
  }
  return ins;
}
const simp = g => { const step = Math.max(1, Math.ceil(g.length / 60)); return g.filter((_, i) => i % step === 0 || i === g.length - 1).map(q => [r6(q.lat), r6(q.lng)]); };
const refNum = s => { const m = String(s || '').match(/(\d+)\s*$/); return m ? +m[1] : null; };
const refGroup = s => { const m = String(s || '').match(/^(.*?)[\s\-:]+\d+\s*$/); return m ? m[1].trim() : ''; };
const parFromLen = L => L <= 230 ? 3 : L <= 430 ? 4 : 5;

const out = [];
for (const G of GOLFS) {
  const D = load(G.files);
  const [type, id] = G.osm.split('/');
  let outer, inner = [];
  if (type === 'way') outer = [D.geom(D.ways.get(+id))];
  else {
    const rel = D.rels.get(+id);
    const seg = role => rel.members.filter(m => m.type === 'way' && (m.role || 'outer') === role).map(m => D.ways.get(m.ref)).filter(Boolean).map(w => w.nodes);
    outer = rings(seg('outer')).map(r => r.map(n => D.nodes.get(n)).filter(Boolean));
    inner = rings(seg('inner')).map(r => r.map(n => D.nodes.get(n)).filter(Boolean));
  }
  const inside = p => outer.some(r => inPoly(p, r)) && !inner.some(r => inPoly(p, r));
  const allWays = [...D.ways.values()].filter(w => w.tags);
  const wInside = w => { const g = D.geom(w); return g.length && inside({lat: mean(g.map(p => p.lat)), lng: mean(g.map(p => p.lng))}); };
  // elements du golf
  const features = [];
  for (const w of allWays) {
    const t = w.tags, gt = t.golf;
    let ty = null;
    if (['green', 'fairway', 'bunker', 'tee', 'rough'].includes(gt)) ty = gt;
    else if (gt === 'water_hazard' || gt === 'lateral_water_hazard' || t.natural === 'water') ty = 'water';
    if (!ty) continue;
    const g = D.geom(w);
    if (g.length < 2) continue;
    if (!G.all && !wInside(w) && !(ty === 'water' && g.some(inside))) continue;
    features.push({t: ty, p: simp(g)});
  }
  const greens = features.filter(f => f.t === 'green').map(f => ({lat: mean(f.p.map(p => p[0])), lng: mean(f.p.map(p => p[1]))}));
  const holesW = allWays.filter(w => w.tags.golf === 'hole' && refNum(w.tags.ref) && (G.all || wInside(w)));
  // groupes (Gujan : "18 trous - 5", "9 trous - 3")
  const groups = {};
  for (const w of holesW) (groups[G.split ? refGroup(w.tags.ref) : ''] ||= []).push(w);
  for (const [gname, ws] of Object.entries(groups)) {
    const maxRef = Math.max(...ws.map(w => refNum(w.tags.ref)));
    const N = maxRef <= 9 ? 9 : 18;
    const holes = Array.from({length: N}, (_, i) => ({n: i + 1, par: null, hcp: null, dist: {}, tee: null, green: null, photo: null, calib: null}));
    let parEst = 0, reversed = 0;
    for (const w of ws) {
      const k = refNum(w.tags.ref) - 1; if (k >= N) continue;
      let g = D.geom(w);
      // sens du trou : la fin doit etre la plus proche d'un green
      if (greens.length >= ws.length / 2) {
        const dg = p => Math.min(...greens.map(c => hav(p, c)));
        if (dg(g[0]) + 5 < dg(g[g.length - 1])) { g = g.slice().reverse(); reversed++; }
      }
      let L = 0; for (let i = 1; i < g.length; i++) L += hav(g[i - 1], g[i]);
      const h = holes[k];
      h.tee = {lat: r7(g[0].lat), lng: r7(g[0].lng)};
      h.green = {lat: r7(g[g.length - 1].lat), lng: r7(g[g.length - 1].lng)};
      h.osmLen = Math.round(L);
      h.par = parseInt(w.tags.par) || null;
      h.hcp = parseInt(w.tags.handicap) || null;
      if (!h.par) { h.par = parFromLen(h.osmLen); h.parEst = true; parEst++; }
      h.dist.Jaune = h.osmLen;
    }
    const missing = holes.filter(h => !h.tee).map(h => h.n);
    holes.forEach(h => { if (!h.par) { h.par = 4; h.parEst = true; parEst++; } });
    const par = holes.reduce((s, h) => s + h.par, 0);
    const first = holes[0].tee || greens[0];
    const name = G.name + (gname ? ', ' + gname : '');
    out.push({
      id: uid(), osmRef: G.osm + (gname ? '#' + gname : ''), name, city: G.city,
      lat: first ? first.lat : null, lng: first ? first.lng : null,
      center: {lat: r6(mean(outer[0].map(p => p.lat))), lng: r6(mean(outer[0].map(p => p.lng)))},
      holes, tees: [{color: 'Jaune', slope: 113, sss: par, par}],
      osm: {features, date: new Date().toISOString()},
      draft: {parEst, missing, hcpMissing: holes.filter(h => !h.hcp).length},
    });
    console.log(name.padEnd(40), N + ' trous', 'par ' + par, 'trous OSM ' + ws.length, 'manquants [' + missing + ']', 'par estimes ' + parEst, 'hcp manquants ' + holes.filter(h => !h.hcp).length, 'inverses ' + reversed, 'elements ' + features.length, 'long. ' + holes.reduce((s, h) => s + (h.osmLen || 0), 0) + ' m');
  }
}
const doc = {v: 1, source: '© contributeurs OpenStreetMap, licence ODbL (openstreetmap.org/copyright)', date: new Date().toISOString().slice(0, 10), courses: out};
fs.writeFileSync(OUT, JSON.stringify(doc));
console.log('ecrit', OUT, Math.round(fs.statSync(OUT).size / 1024) + ' Ko');
