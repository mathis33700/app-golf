// Telecharge les donnees OSM brutes (API principale, map.json) autour de chaque golf.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'osm-raw');
fs.mkdirSync(OUT, {recursive: true});
const GOLFS = [
  {key: 'gujan', bbox: [44.5988, 44.6139, -1.0993, -1.0827]},
  {key: 'arcachon', bbox: [44.6342, 44.6464, -1.1724, -1.1578]},
  {key: 'aiguilles-vertes', center: [44.7344, -1.0433], r: 0.006},
  {key: 'lacanau-mejanne', bbox: [44.9954, 45.0056, -1.1684, -1.1552]},
  {key: 'ugolf-lacanau', bbox: [44.9928, 45.0053, -1.1811, -1.1619]},
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const g of GOLFS) {
    let [s, n, w, e] = g.bbox || [g.center[0] - g.r, g.center[0] + g.r, g.center[1] - g.r * 1.4, g.center[1] + g.r * 1.4];
    const m = 0.003; s -= m; n += m; w -= m * 1.4; e += m * 1.4;
    const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w.toFixed(5)},${s.toFixed(5)},${e.toFixed(5)},${n.toFixed(5)}`;
    try {
      const r = await fetch(url, {headers: {'User-Agent': 'caddie-golf-app/1.0'}});
      const t = await r.text();
      if (!r.ok) { console.log(g.key, r.status, t.slice(0, 120)); continue; }
      fs.writeFileSync(path.join(OUT, g.key + '.json'), t);
      const j = JSON.parse(t);
      const holes = j.elements.filter(x => x.type === 'way' && x.tags && x.tags.golf === 'hole');
      const cnt = t => j.elements.filter(x => x.type === 'way' && x.tags && x.tags.golf === t).length;
      console.log(g.key, 'elements', j.elements.length, 'trous', holes.length, 'refs', [...new Set(holes.map(h => h.tags.ref))].sort((a, b) => a - b).join(','),
        'greens', cnt('green'), 'tees', cnt('tee'), 'fairways', cnt('fairway'), 'bunkers', cnt('bunker'),
        'noms', [...new Set(holes.map(h => h.tags['golf:course:name'] || h.tags['golf:course'] || '-'))].join('/'));
    } catch (err) { console.log(g.key, 'ERR', err.message); }
    await sleep(1500);
  }
})();
