/* =============================================================================
   App AGP — service worker  (AGP-51 : base locale permanente)
   -----------------------------------------------------------------------------
   Permet d'ouvrir l'application SANS Internet : la page, le SDK Firebase et
   les bibliotheques (Tailwind, jsPDF, Chart.js) sont gardes sur l'appareil.
   - page (index.html) : reseau d'abord, copie de l'appareil si le reseau ne
     repond pas en 3,5 s ou s'il n'y a pas d'Internet ;
   - bibliotheques et polices : copie de l'appareil d'abord ;
   - base de donnees Firebase : jamais interceptee.
   A placer a cote d'index.html. Changer VERSION a chaque livraison.
   ============================================================================= */
var VERSION = 'agp-v53-20261125-decodage-photos';
var COQUILLE = ['./', './index.html', './manifest.json'];
var EXTERNES = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];
var DELAI_RESEAU = 3500;

function garder(c, u){
  var externe = /^https?:/.test(u);
  return fetch(new Request(u, externe ? { mode: 'cors', credentials: 'omit' } : { cache: 'reload' }))
    .then(function(r){ if (r && (r.ok || r.type === 'opaque')) return c.put(u, r); throw new Error('reponse ' + (r && r.status)); })
    .catch(function(){
      if (!externe) return;
      /* serveur sans en-tetes CORS : copie opaque, suffisante pour un <script> */
      return fetch(new Request(u, { mode: 'no-cors' })).then(function(r){ return c.put(u, r); }).catch(function(){});
    });
}
self.addEventListener('install', function(ev){
  ev.waitUntil(caches.open(VERSION).then(function(c){
    return Promise.all(COQUILLE.concat(EXTERNES).map(function(u){ return garder(c, u); }));
  }));
});
self.addEventListener('activate', function(ev){
  ev.waitUntil(caches.keys().then(function(noms){
    return Promise.all(noms.map(function(n){ if (n !== VERSION && /^agp/i.test(n)) return caches.delete(n); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('message', function(ev){
  if (ev.data && ev.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function estBaseDeDonnees(url){
  return /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken/.test(url.hostname);
}
function mettreEnCache(req, rep){
  if (!rep || !(rep.ok || rep.type === 'opaque')) return;
  var copie = rep.clone();
  caches.open(VERSION).then(function(c){ c.put(req, copie); }).catch(function(){});
}
self.addEventListener('fetch', function(ev){
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url;
  try{ url = new URL(req.url); }catch(e){ return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (estBaseDeDonnees(url)) return;
  var memeOrigine = url.origin === self.location.origin;
  var estPage = req.mode === 'navigate' || (memeOrigine && /\/(index\.html)?$/.test(url.pathname));

  if (estPage){
    ev.respondWith(new Promise(function(resoudre){
      var fini = false;
      function depuisCache(){ return caches.match('./index.html').then(function(r){ return r || caches.match(req, { ignoreSearch: true }); }); }
      var minuteur = setTimeout(function(){
        depuisCache().then(function(r){ if (r && !fini){ fini = true; resoudre(r); } });
      }, DELAI_RESEAU);
      fetch(req).then(function(rep){
        clearTimeout(minuteur);
        if (rep && rep.ok){ var c = rep.clone(); caches.open(VERSION).then(function(x){ x.put('./index.html', c); }); }
        if (!fini){ fini = true; resoudre(rep); }
      }).catch(function(){
        clearTimeout(minuteur);
        depuisCache().then(function(r){
          if (fini) return;
          fini = true;
          resoudre(r || new Response('<h3 style="font-family:sans-serif">App AGP : hors ligne et page non encore copiée sur cet appareil. Ouvrez l\'application une fois avec Internet.</h3>',
                                     { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        });
      });
    }));
    return;
  }
  if (/gstatic\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|tailwindcss\.com|fonts\.googleapis\.com/.test(url.hostname)){
    ev.respondWith(caches.match(req, { ignoreVary: true }).then(function(r){
      return r || caches.match(req.url).then(function(r2){
        return r2 || fetch(req).then(function(rep){ mettreEnCache(req, rep); return rep; });
      });
    }));
    return;
  }
  if (memeOrigine){
    ev.respondWith(caches.match(req, { ignoreSearch: true }).then(function(r){
      var reseau = fetch(req).then(function(rep){ mettreEnCache(req, rep); return rep; }).catch(function(){ return r; });
      return r || reseau;
    }));
  }
});
