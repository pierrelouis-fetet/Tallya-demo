
const Charts = (() => {

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function ink() {
    return {
      grid:     cssv('--grid'),
      axis:     cssv('--axis'),
      muted:    cssv('--muted'),
      text:     cssv('--text-primary'),
      text2:    cssv('--text-secondary'),
      surface:  cssv('--surface-1'),
    };
  }

  const registry = new Map();     // el -> render fn

  /* Un conteneur absent n'est pas une erreur, c'est une carte que la vue a
     choisi de ne pas rendre. Sans cette garde, chaque graphique lisait
     `el.clientWidth` sur `null` et l'exception remontait jusqu'a `render()` :
     l'ecran restait a moitie peint. Le cas se produit des qu'une vue masque une
     carte selon l'etat — un premier lancement, par exemple, ou aucune des six
     cartes de l'accueil n'a de quoi tracer quoi que ce soit.

     Un montage silencieux plutot qu'un appelant qui verifie : il y a une
     douzaine d'appels, donc douze occasions d'oublier la verification, et l'oubli
     ne se voit qu'a l'ecran blanc. */
  function mount(el, render) {
    if (!el) return;
    registry.set(el, render);
    render();
  }

  let rafId = null;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      for (const [el, fn] of registry) {
        if (el.isConnected) fn(); else registry.delete(el);
      }
    });
  });

  function refreshAll() {
    for (const [el, fn] of registry) { if (el.isConnected) fn(); else registry.delete(el); }
  }

  /* Toutes les infobulles des graphiques, pour pouvoir les refermer d'ailleurs.

     Les six graphiques cachaient la leur sur `mouseleave`. Cet evenement
     n'existe pas au doigt : rien ne « quitte » l'ecran quand on leve le doigt,
     et l'infobulle restait donc collee jusqu'au prochain rendu de la page. Sur
     telephone, elle recouvrait la moitie de la courbe sans aucun moyen de la
     faire partir.

     Un seul ecouteur, pose une fois pour toutes : toucher ailleurs referme.
     C'est le geste qu'on essaie d'instinct, et il vaut pour les six sans que
     chacun ait a s'en occuper. */
  const infobulles = new Set();
  let ecouteFermeture = false;

  function fermerInfobulles(saufDans) {
    for (const tip of infobulles) {
      if (!tip.isConnected) { infobulles.delete(tip); continue; }
      if (saufDans && tip.parentElement && tip.parentElement.contains(saufDans)) continue;
      tip.hidden = true;
      const cur = tip.parentElement && tip.parentElement.querySelector('.cursor');
      if (cur) cur.setAttribute('hidden', '');
      const spark = tip.parentElement && tip.parentElement.querySelector('.spark-curseur');
      if (spark) spark.style.display = 'none';
    }
  }

  /* --- ouvrir une infobulle au doigt sans voler le defilement ---------------

     « Le graphique de l'accueil ouvre son infobulle quand on le touche pour
     faire defiler la page. » Le premier contact posait l'infobulle, et un doigt
     qui passe sur un graphique de 300 px de haut pour atteindre le bas de la
     page en pose forcement un.

     Un appui ne veut donc plus dire « montre-moi ce mois ». Deux signes le
     disent, et il en suffit d'un :

     - **le temps** : le doigt tenu DELAI_APPUI sans bouger. Personne ne
       s'arrete un dixieme de seconde avant de lancer un defilement.
     - **la direction** : un glissement de plus de SEUIL_GLISSE pixels a
       l'horizontale. C'est le geste de parcours de la courbe, et il n'a rien a
       voir avec le defilement, qui est vertical.

     Et un signe l'annule : un glissement vertical franchit le seuil avant l'un
     des deux autres. Le geste est alors declare defilement pour de bon, plus
     rien ne l'armera avant que le doigt ne se leve.

     La souris ne passe pas par la : le survol n'a aucun cout, il ne prend le
     geste de personne.

     Le doigt garde ensuite la main sur toute la hauteur du graphique.
     `setPointerCapture` redirige tous les evenements de ce pointeur vers le
     graphique jusqu'a la levee, ou qu'aille le doigt : sans lui, sortir du
     cadre par le haut ou par le bas emet `pointerleave` et referme, or un doigt
     qui tient une colonne de 300 px en sort tout le temps. Le `try` n'est pas
     decoratif : un navigateur refuse la capture si le pointeur n'est plus
     actif, et l'exception finirait en console.

     `masquer` et non `cacher` en parametre : le second nom est celui de la
     fonction composee juste dessous, et le masquer ici aurait desarme le geste
     sans que rien ne le signale. Meme piege que `aideTexte` et `refus`,
     tous deux notes dans app.js. */
  const SEUIL_GLISSE = 8;    // px
  const DELAI_APPUI = 130;   // ms

  function cablerInfobulle(cible, montrer, masquer) {
    let arme = false, abandonne = false, depart = null, minuteur = null;
    const desarmer = () => {
      clearTimeout(minuteur); minuteur = null;
      arme = false; abandonne = false; depart = null;
    };
    const cacher = () => { desarmer(); masquer(); };

    cible.addEventListener('pointerdown', ev => {
      try { cible.setPointerCapture(ev.pointerId); } catch (e) { /* pointeur deja parti */ }
      desarmer();
      if (ev.pointerType !== 'touch') { arme = true; montrer(ev); return; }
      depart = { x: ev.clientX, y: ev.clientY, ev };
      minuteur = setTimeout(() => { minuteur = null; arme = true; montrer(depart.ev); }, DELAI_APPUI);
    });

    cible.addEventListener('pointermove', ev => {
      if (ev.pointerType !== 'touch') { montrer(ev); return; }
      if (!(ev.buttons || ev.pressure > 0)) return;
      if (arme) { montrer(ev); return; }
      if (abandonne || !depart) return;
      const dx = Math.abs(ev.clientX - depart.x), dy = Math.abs(ev.clientY - depart.y);
      if (dy > SEUIL_GLISSE && dy >= dx) { abandonne = true; clearTimeout(minuteur); minuteur = null; return; }
      if (dx > SEUIL_GLISSE) { clearTimeout(minuteur); minuteur = null; arme = true; montrer(ev); }
    });

    cible.addEventListener('pointerleave', cacher);
    cible.addEventListener('pointerup', cacher);

    /* `pointercancel` ne ferme pas une infobulle deja ouverte.

       Le graphique porte `touch-action: pan-y`, donc le navigateur
       annule le pointeur des qu'il reclame le geste — l'infobulle partait au
       moindre tremblement, alors qu'on tenait le doigt en place pour lire.

       Tant qu'elle n'est pas ouverte, en revanche, l'annulation est le signal
       le plus sur qui existe : le navigateur vient de decider que ce geste est
       un defilement. Le minuteur en attente n'a plus rien a ouvrir. */
    cible.addEventListener('pointercancel', () => { if (!arme) desarmer(); });
  }

  function ensureTip(el) {
    let tip = el.querySelector('.chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.hidden = true;
      el.appendChild(tip);
    }
    infobulles.add(tip);
    if (!ecouteFermeture) {
      ecouteFermeture = true;
      document.addEventListener('pointerdown', ev => fermerInfobulles(ev.target), true);
      window.addEventListener('scroll', () => fermerInfobulles(), { passive: true });
    }
    return tip;
  }

  function niceTicks(max, count = 4) {
    if (max <= 0) return [0];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = 0; v <= max * 1.001; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
  }

  let _ctx = null;
  function fitText(texte, largeurMax, police = '12.5px system-ui, -apple-system, "Segoe UI", sans-serif') {
    if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
    _ctx.font = police;
    if (_ctx.measureText(texte).width <= largeurMax) return texte;
    let court = texte;
    while (court.length > 1 && _ctx.measureText(court + '…').width > largeurMax) {
      court = court.slice(0, -1);
    }
    return court.trimEnd() + '…';
  }

  const kEur = v => {
    if (masqueActif()) return '•••';   // les axes chiffrés trahiraient le total
    const a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 }) + ' k€';
    return Math.round(v).toLocaleString(locale()) + ' €';
  };

  /* Option facultative, nee de la page Projection :
     `guide: { value, label }` est une ligne horizontale en pointille, comme
     celle de barsWithTarget. La cible long terme ne vivait que dans une note
     en texte ; tracee, on voit l'annee ou la courbe la croise sans lire un
     seul chiffre. Elle entre dans l'echelle : une cible hors de portee ecrase
     la courbe, et c'est exactement ce qu'elle doit montrer.
     (Une seconde serie en pointille pour les euros d'aujourd'hui a ete
     essayee puis retiree : deux courbes quasi paralleles, du bruit.) */
  function stackedArea(el, opts) {
    mount(el, () => {
      /* `bande: { min, max }` : deux cles a lire sur chaque point, tracees en
         zone translucide derriere les bandes. Sert aux scenarios de la
         Projection — le meme calcul a deux points de rendement d'ecart. Une
         courbe unique a l'air d'une promesse ; la bande dit l'incertitude
         sans un mot. */
      const { points, series, guide, bande } = opts;
      const c = ink();
      const W = Math.max(el.clientWidth, 320);
      const H = opts.height || 300;
      const m = { t: 14, r: 16, b: 30, l: 54 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      if (!points.length) { el.innerHTML = `<p class="empty">${trad('Pas de données')}</p>`; return; }

      const totals = points.map(p => series.reduce((s, sr) => s + (p[sr.key] || 0), 0));
      const maxV = Math.max(...totals, guide ? guide.value : 0,
        bande ? Math.max(...points.map(p => p[bande.max] || 0)) : 0, 1);
      const ticks = niceTicks(maxV);
      const top = ticks[ticks.length - 1];

      const x = i => m.l + (points.length === 1 ? iw / 2 : i * iw / (points.length - 1));
      const y = v => m.t + ih - (v / top) * ih;

      let cum = points.map(() => 0);
      const areas = [];
      const HAUTEUR_TRAIT = 2.5;
      for (const sr of series) {
        const lower = [...cum];
        cum = cum.map((v, i) => v + (points[i][sr.key] || 0));
        const up = cum.map((v, i) => `${x(i)},${y(v)}`).join(' ');
        const dn = lower.map((v, i) => `${x(i)},${y(v)}`).reverse().join(' ');
        const epaisseur = Math.max(...points.map((p, i) => Math.abs(y(lower[i]) - y(cum[i]))));
        const trait = epaisseur >= HAUTEUR_TRAIT
          ? `<polyline points="${up}" fill="none" stroke="${c.surface}" stroke-width="2"/>`
            + `<polyline points="${up}" fill="none" stroke="${sr.color}" stroke-width="1.75"
                        stroke-linejoin="round" stroke-linecap="round"/>`
          : '';
        areas.push(`<polygon points="${up} ${dn}" fill="${sr.color}" fill-opacity=".28"/>${trait}`);
      }
      const totalLine = totals.map((v, i) => `${x(i)},${y(v)}`).join(' ');

      const every = Math.ceil(points.length / Math.max(3, Math.floor(iw / 78)));
      const xLabels = points.map((p, i) =>
        (i % every === 0 || i === points.length - 1)
          ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="tick">${esc(p.label)}</text>` : ''
      ).join('');

      const clip = 'clip' + Math.random().toString(36).slice(2, 8);
      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${trad('Évolution du patrimoine')}">
          <defs><clipPath id="${clip}"><rect x="${m.l}" y="0" width="${iw}" height="${H}"/></clipPath></defs>
          ${ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${c.grid}" stroke-width="1"/>
            <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" class="tick">${kEur(t)}</text>`).join('')}
          <g clip-path="url(#${clip})">
          ${bande ? (() => {
            const haut = points.map((p, i) => `${x(i)},${y(p[bande.max] || 0)}`).join(' ');
            const bas = points.map((p, i) => `${x(i)},${y(p[bande.min] || 0)}`).reverse().join(' ');
            return `<polygon points="${haut} ${bas}" fill="${c.text}" fill-opacity=".06"/>
              <polyline points="${haut}" fill="none" stroke="${c.text}" stroke-opacity=".28"
                        stroke-width="1" stroke-dasharray="3 4"/>
              <polyline points="${points.map((p, i) => `${x(i)},${y(p[bande.min] || 0)}`).join(' ')}"
                        fill="none" stroke="${c.text}" stroke-opacity=".28"
                        stroke-width="1" stroke-dasharray="3 4"/>`;
          })() : ''}
          <g class="chart-trace">
          ${areas.join('')}
          <polyline points="${totalLine}" fill="none" stroke="${c.text}" stroke-width="1.5"
                    stroke-opacity=".7" stroke-linejoin="round" stroke-linecap="round"/>
          </g>
          </g>
          ${guide ? `
            <line x1="${m.l}" x2="${W - m.r}" y1="${y(guide.value)}" y2="${y(guide.value)}"
                  stroke="${c.text}" stroke-opacity=".6" stroke-width="1" stroke-dasharray="6 4"/>
            <text x="${W - m.r}" y="${y(guide.value) - 6}" text-anchor="end" class="tick tick-strong">
              ${esc(guide.label || 'Cible')} ${kEur(guide.value)}</text>` : ''}
          <line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="${c.axis}" stroke-width="1"/>
          ${xLabels}
          <g class="cursor" hidden>
            <line class="cursor-line" y1="${m.t}" y2="${m.t + ih}" stroke="${c.text}" stroke-width="1" stroke-dasharray="3 3" stroke-opacity=".5"/>
            ${series.map(sr => `<circle r="4.5" fill="${sr.color}" stroke="${c.surface}" stroke-width="2" data-k="${sr.key}"/>`).join('')}
            <circle r="5" fill="none" stroke="${c.text}" stroke-width="2" data-k="__total"/>
          </g>
          <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/>
        </svg>`;

      const tip = ensureTip(el);
      const svg = el.querySelector('svg');
      const cur = el.querySelector('.cursor');
      const line = el.querySelector('.cursor-line');

      let iPrecedent = null;

      function move(ev) {
        const r = svg.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        let i = Math.round((px - m.l) / (iw / Math.max(1, points.length - 1)));
        i = Math.max(0, Math.min(points.length - 1, i));
        /* Un tic au passage de chaque point, et seulement au doigt.

           C'est ce qui distingue un curseur qui suit le doigt d'une courbe qu'on
           parcourt : la main sent les mois defiler sans que l'oeil ait a lire
           les dates. Les applications de courtage le font toutes, et c'est la
           moitie de la sensation.

           Au changement d'index seulement — un tic par image donnerait une
           vibration continue — et jamais a la souris, ou il n'y a rien a sentir
           et ou `navigator.vibrate` ferait trembler un telephone pose a cote. */
        if (i !== iPrecedent) {
          if (iPrecedent !== null && ev.pointerType === 'touch') retourHaptique();
          iPrecedent = i;
        }
        const p = points[i];
        cur.removeAttribute('hidden');
        line.setAttribute('x1', x(i)); line.setAttribute('x2', x(i));
        let acc = 0;
        series.forEach(sr => {
          acc += p[sr.key] || 0;
          const dot = cur.querySelector(`[data-k="${sr.key}"]`);
          dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(acc));
        });
        const tdot = cur.querySelector('[data-k="__total"]');
        tdot.setAttribute('cx', x(i)); tdot.setAttribute('cy', y(totals[i]));

        tip.hidden = false;
        tip.innerHTML = `<div class="tt-head">${esc(p.label)}</div>` +
          /* Une bande a zero sur ce mois-la ne se dit pas. `seriesUtiles()`
             garde une serie des qu'elle porte quelque chose QUELQUE PART, ce
             qui est juste pour la legende : sans cela une poche disparaitrait
             de la pile le mois ou elle se vide. Mais point par point, « Capital
             garanti 0 € » sur douze mois est une ligne qui n'apprend rien et
             qui fait douter — l'infobulle du mois dit ce qu'il y avait ce
             mois-la, et rien n'y etait. */
          series.filter(sr => Math.abs(Number(p[sr.key]) || 0) > 0.005)
            .map(sr => `<div class="tt-row"><span class="sw" style="background:${sr.color}"></span>${esc(sr.label)}<b>${fmtEUR0(p[sr.key] || 0)}</b></div>`).join('') +
          `<div class="tt-row tt-total">Total<b>${fmtEUR0(totals[i])}</b></div>` +
          (p.comment ? `<div class="tt-note">${esc(p.comment)}</div>` : '');
        const left = Math.min(Math.max(x(i) * (r.width / W) - tip.offsetWidth / 2, 4), r.width - tip.offsetWidth - 4);
        tip.style.left = left + 'px';
        tip.style.top = '8px';
      }
      /* Evenements pointeur et non souris : au doigt, `mousemove` est bien
         synthetise a l'appui — l'infobulle apparaissait donc — mais aucun
         `mouseleave` ne suit, et elle ne partait plus. Ici l'appui montre, le
         glissement suit le doigt, et lever la main la referme.

         Le glissement vertical reste possible : sans `touch-action: pan-y`, le
         navigateur reserve le geste au graphique et la page se bloque. */
      const cacher = () => {
        cur.setAttribute('hidden', ''); tip.hidden = true;
        iPrecedent = null;
      };
      el.style.touchAction = 'pan-y';
      /* Le doigt garde la main sur toute la verticale du mois touche, et un
         appui qui commence un defilement n'ouvre rien : tout le geste vit dans
         `cablerInfobulle`, en tete de fichier, avec son raisonnement.

         L'infobulle part avec le doigt, sans delai.

         Elle s'attardait 1 400 ms apres la levee, pour laisser le temps de lire.
         L'intention etait bonne et le raisonnement faux : on lit **pendant** qu'on
         appuie, pas apres. Le repit ne servait donc a rien, et il coutait cher.

         Car ce delai etait un `setTimeout` que rien n'annulait. Deux appuis
         rapproches, et le minuteur du premier fermait l'infobulle du second, en
         plein milieu — d'ou « la plupart du temps », qui est la signature d'un
         minuteur en retard et non d'une regle. Le supprimer regle les deux d'un
         coup : plus de disparition inexpliquee, et le geste devient celui qu'on
         attend — ça s'affiche tant que le doigt est la, ça part quand il se leve.

         Le minuteur d'armement, lui, est annule partout : a la levee, a la
         sortie, a l'annulation du pointeur et au debut du geste suivant. C'est
         la lecon de celui-la. */
      cablerInfobulle(svg, move, cacher);
    });
  }

  function donut(el, opts) {
    mount(el, () => {
      const { items, centerLabel } = opts;
      const c = ink();
      const W = Math.max(el.clientWidth, 220);
      const H = opts.height || 240;
      const R = Math.min(W, H) / 2 - 8;
      const r = R * 0.62;
      const cx = W / 2, cy = H / 2;
      const total = items.reduce((s, i) => s + Math.max(0, i.value), 0) || 1;

      let a0 = -Math.PI / 2;
      const arcs = items.map(it => {
        const frac = Math.max(0, it.value) / total;
        const a1 = a0 + frac * Math.PI * 2;
        const large = frac > 0.5 ? 1 : 0;
        const p = (ang, rad) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
        const d = `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`;
        const mid = (a0 + a1) / 2;
        a0 = a1;
        return { d, it, frac, mid };
      });

      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${trad('Répartition')}">
          ${arcs.map((a, i) => `<path d="${a.d}" fill="${a.it.color}" stroke="${c.surface}" stroke-width="2" class="slice" data-i="${i}"/>`).join('')}
          <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-val">${kEur(opts.centerValue ?? total)}</text>
          <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-lab">${esc(centerLabel || 'Total')}</text>
        </svg>`;

      const tip = ensureTip(el);
      el.querySelectorAll('.slice').forEach(node => {
        node.addEventListener('mouseenter', () => {
          const a = arcs[+node.dataset.i];
          tip.hidden = false;
          tip.innerHTML = `<div class="tt-row"><span class="sw" style="background:${a.it.color}"></span>${esc(a.it.label)}<b>${fmtEUR0(a.it.value)}</b></div>
                           <div class="tt-row tt-total">Part<b>${fmtPct(a.frac * 100, 1)}</b></div>`;
          tip.style.left = Math.max(4, W / 2 - tip.offsetWidth / 2) + 'px';
          tip.style.top = '6px';
        });
        node.addEventListener('mouseleave', () => { tip.hidden = true; });
        /* Au doigt, aucun `mouseleave` ne suit l'appui : l'infobulle restait
           collee. Lever le doigt la referme, apres un instant de repit pour
           laisser lire le chiffre. Toucher ailleurs referme aussi, par
           l'ecouteur pose dans `ensureTip`. */
        node.addEventListener('pointerup', ev => {
          if (ev.pointerType === 'touch') setTimeout(() => { tip.hidden = true; }, 1400);
        });
      });
    });
  }

  function rankedBars(el, opts) {
    mount(el, () => {
      const items = opts.items.filter(i => opts.keepZero || i.value !== 0);
      const c = ink();
      const W = Math.max(el.clientWidth, 320);
      const rowH = opts.rowH || 30;
      const labelW = Math.min(210, Math.max(120, Math.round(W * 0.34)));
      const valueW = 108;
      const H = items.length * rowH + 8;
      const barMax = W - labelW - valueW - 8;
      const max = Math.max(...items.map(i => Math.abs(i.value)), 1);
      const color = opts.color || cssv('--series-1');

      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${trad('Répartition classée')}">
          ${items.map((it, i) => {
            const y = i * rowH + 4;
            const w = Math.max(2, Math.abs(it.value) / max * barMax);
            const neg = it.value < 0;
            return `
              <g class="rb" data-i="${i}">
                <rect x="0" y="${y}" width="${W}" height="${rowH - 2}" fill="transparent"/>
                <text x="0" y="${y + rowH / 2 + 1}" class="rb-label">${esc(fitText(it.label, labelW - 12))}</text>
                <title>${esc(it.label)}</title>
                <rect x="${labelW}" y="${y + 5}" width="${w}" height="${rowH - 14}" rx="4"
                      fill="${neg ? cssv('--critical') : (it.couleur || color)}"
                      fill-opacity="${it.dim ? .45 : 1}"/>
                <text x="${W}" y="${y + rowH / 2 + 1}" text-anchor="end" class="rb-val">${fmtEUR0Texte(it.value)}<tspan class="rb-pct"> · ${fmtPct(it.pct ?? 0, 1)}</tspan></text>
              </g>`;
          }).join('')}
        </svg>`;

      const tip = ensureTip(el);
      el.querySelectorAll('.rb').forEach(node => {
        if (opts.onPick) {
          node.style.cursor = 'pointer';
          node.addEventListener('click', () => opts.onPick(items[+node.dataset.i], +node.dataset.i));
        }
        const montrer = () => {
          const it = items[+node.dataset.i];
          tip.hidden = false;
          const sous = it.sous || [it.etab, it.type].filter(Boolean).join(' · ');
          tip.innerHTML = `<div class="tt-head">${esc(it.label)}</div>
            ${sous ? `<div class="tt-sous">${esc(sous)}</div>` : ''}
            <div class="tt-row">${esc(opts.valueLabel || trad('Montant'))}<b>${fmtEUR(it.value)}</b></div>
            ${it.average != null ? `<div class="tt-row">${trad('Par mois')}<b>${fmtEUR(it.average)}</b></div>` : ''}
            <div class="tt-row">${trad('Part')}<b>${fmtPct(it.pct ?? 0)}</b></div>`;
          tip.style.left = Math.max(4, W - tip.offsetWidth - 8) + 'px';
          /* Le haut suit la ligne survolee, et c'est la seule infobulle des
             graphiques dans ce cas : les autres s'epinglent en tete, donc rien
             ne pouvait les faire sortir. Celle-ci n'avait aucune borne basse, et
             sur les dernieres lignes elle depassait sa carte — les deux
             dernieres valeurs, le montant et la part, tombaient hors du cadre.
             Elle est posee en absolu dans le conteneur du graphique, donc c'est
             la hauteur de ce conteneur qui la retient.

             Et cette hauteur se MESURE : `H` est celle du viewBox, or le SVG est
             mis a l'echelle de la largeur disponible. Sur un telephone les deux
             differaient de dix pixels, et borner sur `H` laissait deborder
             d'autant. */
          const dispo = el.clientHeight || H;
          tip.style.top = Math.max(0,
            Math.min(dispo - tip.offsetHeight, +node.dataset.i * rowH - 6)) + 'px';
        };
        node.addEventListener('mouseenter', montrer);
        node.addEventListener('mouseleave', () => { tip.hidden = true; });
        /* Au doigt, `mouseenter` n'arrive qu'apres coup, et parfois pas du tout :
           un appui maintenu ne montrait donc rien, ou rien avant de relacher.
           `pointerdown` ouvre la bulle des que le doigt se pose, ce qui est
           precisement le geste qu'on fait pour la demander. */
        node.addEventListener('pointerdown', ev => {
          if (ev.pointerType === 'touch') montrer();
        });
        /* Au doigt, aucun `mouseleave` ne suit l'appui : l'infobulle restait
           collee. Lever le doigt la referme, apres un instant de repit pour
           laisser lire le chiffre. Toucher ailleurs referme aussi, par
           l'ecouteur pose dans `ensureTip`. */
        node.addEventListener('pointerup', ev => {
          if (ev.pointerType === 'touch') setTimeout(() => { tip.hidden = true; }, 1400);
        });
      });
    });
  }

  function groupedBars(el, opts) {
    mount(el, () => {
      const { items, seriesLabels } = opts;   // items: {label, a, b}
      const c = ink();
      const W = Math.max(el.clientWidth, 320);
      const H = opts.height || 260;
      const m = { t: 12, r: 12, b: 44, l: 54 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const max = Math.max(...items.flatMap(i => [i.a, i.b]), 1);
      const ticks = niceTicks(max);
      const top = ticks[ticks.length - 1];
      const y = v => m.t + ih - (v / top) * ih;
      const bandW = iw / items.length;
      const barW = Math.min(38, (bandW - 18) / 2);
      const cA = cssv('--series-1'), cB = cssv('--series-2');

      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${trad('Réel contre cible')}">
          ${ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${c.grid}"/>
            <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" class="tick">${kEur(t)}</text>`).join('')}
          ${items.map((it, i) => {
            const cxb = m.l + bandW * i + bandW / 2;
            const xa = cxb - barW - 1, xb = cxb + 1;
            return `<g class="gb" data-i="${i}">
              <rect x="${xa}" y="${y(it.a)}" width="${barW}" height="${Math.max(1, y(0) - y(it.a))}" rx="4" fill="${cA}"/>
              <rect x="${xb}" y="${y(it.b)}" width="${barW}" height="${Math.max(1, y(0) - y(it.b))}" rx="4" fill="${cB}" fill-opacity=".85"/>
              <text x="${cxb}" y="${H - 24}" text-anchor="middle" class="tick">${esc(it.label)}</text>
              <text x="${cxb}" y="${H - 8}" text-anchor="middle" class="tick tick-strong">${it.delta >= 0 ? '+' : '−'}${fmtEUR0Texte(Math.abs(it.delta))}</text>
            </g>`;
          }).join('')}
          <line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="${c.axis}"/>
        </svg>
        <div class="legend">
          <span><i style="background:${cA}"></i>${esc(seriesLabels[0])}</span>
          <span><i style="background:${cB}"></i>${esc(seriesLabels[1])}</span>
        </div>`;

      const tip = ensureTip(el);
      el.querySelectorAll('.gb').forEach(node => {
        if (opts.onPick) {
          node.style.cursor = 'pointer';
          node.addEventListener('click', () => opts.onPick(items[+node.dataset.i], +node.dataset.i));
        }
        node.addEventListener('mouseenter', () => {
          const it = items[+node.dataset.i];
          tip.hidden = false;
          tip.innerHTML = `<div class="tt-head">${esc(it.label)}</div>
            <div class="tt-row"><span class="sw" style="background:${cA}"></span>${esc(seriesLabels[0])}<b>${fmtEUR0(it.a)}</b></div>
            <div class="tt-row"><span class="sw" style="background:${cB}"></span>${esc(seriesLabels[1])}<b>${fmtEUR0(it.b)}</b></div>
            <div class="tt-row tt-total">${trad('Écart')}<b>${it.delta >= 0 ? '+' : '−'}${fmtEUR0(Math.abs(it.delta))}</b></div>
            ${opts.onPick ? `<div class="tt-row tt-hint">${trad('Clique pour changer la cible')}</div>` : ''}`;
          tip.style.left = Math.max(4, Math.min(W - tip.offsetWidth - 4, m.l + bandW * (+node.dataset.i) + bandW / 2 - tip.offsetWidth / 2)) + 'px';
          tip.style.top = '6px';
        });
        node.addEventListener('mouseleave', () => { tip.hidden = true; });
        /* Au doigt, aucun `mouseleave` ne suit l'appui : l'infobulle restait
           collee. Lever le doigt la referme, apres un instant de repit pour
           laisser lire le chiffre. Toucher ailleurs referme aussi, par
           l'ecouteur pose dans `ensureTip`. */
        node.addEventListener('pointerup', ev => {
          if (ev.pointerType === 'touch') setTimeout(() => { tip.hidden = true; }, 1400);
        });
      });
    });
  }

  function barsWithTarget(el, opts) {
    mount(el, () => {
      const { items, target, targetLabel } = opts;   // items: {label, value, note}
      const c = ink();
      const W = Math.max(el.clientWidth, 320);
      const H = opts.height || 280;
      const m = { t: 16, r: 14, b: 34, l: 56 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      if (!items.length) { el.innerHTML = `<p class="empty">${trad('Pas de données')}</p>`; return; }

      const max = Math.max(...items.map(i => i.value), target || 0, 1);
      const ticks = niceTicks(max);
      const top = ticks[ticks.length - 1];
      const y = v => m.t + ih - (v / top) * ih;
      const band = iw / items.length;
      const bw = Math.min(46, band * 0.62);

      /* Trois niveaux, pas deux. Tout mois au-dessus de l'objectif etait rouge :
         sur huit mois, sept l'etaient, et une couleur d'alerte qui s'allume
         presque toujours ne dit plus rien. Le seuil vit dans le modele,
         `niveauDepassement()`, partage avec les tableaux. */
      const teinte = { sous: cssv('--good'), leger: cssv('--serious'), grave: cssv('--critical') };
      const none = cssv('--grid');
      const every = Math.ceil(items.length / Math.max(3, Math.floor(iw / 62)));

      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${trad('Dépenses mensuelles')}">
          ${ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${c.grid}"/>
            <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" class="tick">${kEur(t)}</text>`).join('')}
          ${items.map((it, i) => {
            const cx = m.l + band * i + band / 2;
            const h = Math.max(it.value > 0 ? 2 : 0, y(0) - y(it.value));
            const fill = teinte[niveauDepassement(it.value, target)] || none;
            return `<g class="vb" data-i="${i}">
              <rect x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>
              <rect x="${cx - bw / 2}" y="${y(it.value)}" width="${bw}" height="${h}" rx="4" fill="${fill}" fill-opacity=".9"/>
              ${(i % every === 0 || i === items.length - 1)
                ? `<text x="${cx}" y="${H - 12}" text-anchor="middle" class="tick">${esc(it.label)}</text>` : ''}
            </g>`;
          }).join('')}
          <line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="${c.axis}"/>
          ${target ? `
            <line x1="${m.l}" x2="${W - m.r}" y1="${y(target)}" y2="${y(target)}"
                  stroke="${c.text}" stroke-width="2" stroke-dasharray="5 4" stroke-opacity=".65"/>
            <text x="${W - m.r}" y="${y(target) - 6}" text-anchor="end" class="tick tick-strong">
              ${esc(targetLabel || trad('Objectif'))} ${kEur(target)}</text>` : ''}
        </svg>`;

      const tip = ensureTip(el);
      el.querySelectorAll('.vb').forEach(node => {
        node.addEventListener('mouseenter', () => {
          const it = items[+node.dataset.i];
          const diff = target ? it.value - target : null;
          tip.hidden = false;
          tip.innerHTML = `<div class="tt-head">${esc(it.label)}</div>
            <div class="tt-row">Dépensé<b>${fmtEUR0(it.value)}</b></div>
            ${target && it.value > 0 ? `<div class="tt-row tt-total">vs objectif<b>${diff > 0 ? '+' : '−'}${fmtEUR0(Math.abs(diff))}</b></div>` : ''}
            ${it.note ? `<div class="tt-note">${esc(it.note)}</div>` : ''}`;
          const cx = m.l + band * (+node.dataset.i) + band / 2;
          const r = el.querySelector('svg').getBoundingClientRect();
          tip.style.left = Math.max(4, Math.min(r.width - tip.offsetWidth - 4,
            cx * (r.width / W) - tip.offsetWidth / 2)) + 'px';
          tip.style.top = '4px';
        });
        node.addEventListener('mouseleave', () => { tip.hidden = true; });
        /* Au doigt, aucun `mouseleave` ne suit l'appui : l'infobulle restait
           collee. Lever le doigt la referme, apres un instant de repit pour
           laisser lire le chiffre. Toucher ailleurs referme aussi, par
           l'ecouteur pose dans `ensureTip`. */
        node.addEventListener('pointerup', ev => {
          if (ev.pointerType === 'touch') setTimeout(() => { tip.hidden = true; }, 1400);
        });
      });
    });
  }

  function deltaBars(el, opts) {
    mount(el, () => {
      const { items, average } = opts;
      const c = ink();
      const W = Math.max(el.clientWidth, 320);
      const H = opts.height || 220;
      const m = { t: 14, r: 12, b: 30, l: 56 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      if (!items.length) { el.innerHTML = '<p class="empty">Pas assez d\'historique</p>'; return; }

      const vals = items.map(i => i.value);
      const hi = Math.max(...vals, average || 0, 0);
      const lo = Math.min(...vals, average || 0, 0);
      const span = (hi - lo) || 1;
      const y = v => m.t + ih - ((v - lo) / span) * ih;
      const zero = y(0);
      const band = iw / items.length;
      const bw = Math.min(34, band * 0.6);

      const up = cssv('--good'), down = cssv('--critical');
      const every = Math.ceil(items.length / Math.max(3, Math.floor(iw / 60)));

      el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(trad('Variation mensuelle du patrimoine'))}">
          ${[hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i).map(v =>
            `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${c.grid}"/>
             <text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${kEur(v)}</text>`).join('')}
          ${items.map((it, i) => {
            const cx = m.l + band * i + band / 2;
            const top = it.value >= 0 ? y(it.value) : zero;
            const h = Math.max(2, Math.abs(zero - y(it.value)));
            return `<g class="vb" data-i="${i}">
              <rect x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>
              <rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="3"
                    fill="${it.value >= 0 ? up : down}" fill-opacity=".9"/>
              ${(i % every === 0 || i === items.length - 1)
                ? `<text x="${cx}" y="${H - 10}" text-anchor="middle" class="tick">${esc(it.label)}</text>` : ''}
            </g>`;
          }).join('')}
          <line x1="${m.l}" x2="${W - m.r}" y1="${zero}" y2="${zero}" stroke="${c.axis}" stroke-width="1.5"/>
          ${average != null ? `
            <line x1="${m.l}" x2="${W - m.r}" y1="${y(average)}" y2="${y(average)}"
                  stroke="${c.text}" stroke-width="2" stroke-dasharray="5 4" stroke-opacity=".55"/>
            <text x="${W - m.r}" y="${y(average) - 5}" text-anchor="end" class="tick tick-strong">
              moyenne ${kEur(average)}</text>` : ''}
        </svg>`;

      const tip = ensureTip(el);
      el.querySelectorAll('.vb').forEach(node => {
        node.addEventListener('mouseenter', () => {
          const it = items[+node.dataset.i];
          tip.hidden = false;
          tip.innerHTML = `<div class="tt-head">${esc(it.label)}</div>
            <div class="tt-row">Variation<b>${it.value >= 0 ? '+' : '−'}${fmtEUR0(Math.abs(it.value))}</b></div>
            ${it.note ? `<div class="tt-note">${esc(it.note)}</div>` : ''}`;
          const cx = m.l + band * (+node.dataset.i) + band / 2;
          const r = el.querySelector('svg').getBoundingClientRect();
          tip.style.left = Math.max(4, Math.min(r.width - tip.offsetWidth - 4,
            cx * (r.width / W) - tip.offsetWidth / 2)) + 'px';
          tip.style.top = '2px';
        });
        node.addEventListener('mouseleave', () => { tip.hidden = true; });
        /* Au doigt, aucun `mouseleave` ne suit l'appui : l'infobulle restait
           collee. Lever le doigt la referme, apres un instant de repit pour
           laisser lire le chiffre. Toucher ailleurs referme aussi, par
           l'ecouteur pose dans `ensureTip`. */
        node.addEventListener('pointerup', ev => {
          if (ev.pointerType === 'touch') setTimeout(() => { tip.hidden = true; }, 1400);
        });
      });
    });
  }

  function sparkline(el, values, opts = {}) {
    mount(el, () => {
      const W = Math.max(el.clientWidth, 80), H = opts.height || 44;
      if (values.length < 2) { el.innerHTML = ''; return; }
      const min = Math.min(...values), max = Math.max(...values);
      const span = (max - min) || 1;
      const x = i => i * W / (values.length - 1);
      const y = v => H - 4 - ((v - min) / span) * (H - 8);
      const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      const col = opts.color || (values[values.length - 1] >= values[0] ? cssv('--good') : cssv('--critical'));
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
        <polygon points="0,${H} ${pts} ${W},${H}" fill="${col}" fill-opacity=".12"/>
        <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="3" fill="${col}"/>
        <circle class="spark-curseur" r="4" fill="${col}" stroke="${cssv('--surface-1') || '#fff'}"
                stroke-width="2" style="display:none"/>
      </svg>`;

      if (!opts.labels) return;
      const svg = el.querySelector('svg');
      const curseur = el.querySelector('.spark-curseur');
      const tip = ensureTip(el);
      el.style.position = 'relative';
      el.style.touchAction = 'pan-y';        // le defilement vertical reste possible

      const montrer = ev => {
        const r = svg.getBoundingClientRect();
        const i = Math.max(0, Math.min(values.length - 1,
          Math.round((ev.clientX - r.left) / r.width * (values.length - 1))));
        curseur.style.display = '';
        curseur.setAttribute('cx', x(i));
        curseur.setAttribute('cy', y(values[i]));
        tip.innerHTML = `<b>${fmtEUR0(values[i])}</b> · ${opts.labels[i]}`;
        tip.hidden = false;                  // l'attribut hidden gagnerait sur un style inline
        const tw = tip.offsetWidth;
        tip.style.left = Math.max(0, Math.min(W - tw, x(i) - tw / 2)) + 'px';
        tip.style.top = '-6px';
      };
      const cacher = () => { curseur.style.display = 'none'; tip.hidden = true; };
      /* Meme regle que la courbe d'evolution, et pour les memes raisons : le doigt
         garde la main sur toute la hauteur, un appui qui commence un defilement
         n'ouvre rien, et ce qui ferme est sa levee, sans minuteur. Celui qui
         vivait ici — 1 200 ms, jamais annule — fermait l'infobulle du deuxieme
         appui avec le retard du premier.

         Cable sur le `svg` et non sur `el`, contrairement aux `on…` qui
         vivaient ici : `mount` rejoue ce rendu a chaque redimensionnement, et
         des `addEventListener` poses sur le conteneur, qui lui survit, se
         seraient empiles a chaque fois. Les proprietes `on…` s'ecrasaient et
         masquaient donc ce piege. Le `svg`, lui, est refait a chaque rendu par
         l'`innerHTML` ci-dessus : rien ne s'empile, et c'est deja ce que fait
         la courbe d'evolution. */
      cablerInfobulle(svg, montrer, cacher);
    });
  }

  return { stackedArea, donut, rankedBars, groupedBars, barsWithTarget, deltaBars,
           sparkline, refreshAll, cssv };
})();
