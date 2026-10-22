'use strict';
// Stocks (lot 0.10.0) — moteur partagé : lots et rouleaux de matières, couches FIFO, stock produits finis
// par taille et couleur, synchronisation avec les BL. Toutes les fonctions reçoivent le client de la
// transaction en cours : un mouvement et le document qui le provoque sont enregistrés ensemble ou pas du tout.
// Valorisation FIFO (premier entré, premier sorti) : décision utilisateur du 22/10/2026, à confirmer par le comptable.
const { r3 } = require('./calculs');
const REF_PF = /^[A-Z]+[0-9]{3}[0-9]{2}[BEFHU]$/;
const r4 = (v) => Math.round((+v || 0) * 10000) / 10000;
const EPS = 0.0005;
const leve = (code, message, statusCode = 400) => Object.assign(new Error(message), { statusCode, code });
const estTissu = (fiche) => /^tissu/i.test(String(fiche?.famille || ''));

// ================================================================ matières premières
async function ficheMP(c, id) {
  const f = (await c.query(`select id, donnees, actif from registres.fiches where id = $1 and registre = 'articles_mp'`, [id])).rows[0];
  if (!f) throw leve('article_introuvable', 'Article matière introuvable.', 404);
  return { id: Number(f.id), actif: f.actif, ...f.donnees };
}

/** Entrée d'un lot (réception, ajustement +, inventaire +) : crée la couche FIFO et le mouvement. */
async function entreeLot(c, u, { article_id, qte, cout_unitaire, n_lot = '', bain = '', rouleau = '', emplacement = '', reception_id = null, origine_lot = null, date, type = 'reception', motif = '', ref_doc = '' }) {
  qte = r3(qte);
  if (!(qte > 0)) throw leve('qte_invalide', 'La quantité doit être supérieure à 0.');
  const cu = r4(cout_unitaire);
  const lot = (await c.query(`insert into stocks.lots_mp (article_id, reception_id, origine_lot, n_lot, bain, rouleau, date_entree, qte_initiale, qte_restante, cout_unitaire, emplacement)
    values ($1,$2,$3,$4,$5,$6,coalesce($7::date, current_date),$8,$8,$9,$10) returning id`, [article_id, reception_id, origine_lot, n_lot, bain, rouleau, date || null, qte, cu, emplacement])).rows[0];
  await c.query(`insert into stocks.mouvements_mp (date, type, article_id, lot_id, qte, cout_unitaire, valeur, motif, ref_doc, emplacement, utilisateur)
    values (coalesce($1::date, current_date),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [date || null, type, article_id, lot.id, qte, cu, r3(qte * cu), motif, ref_doc, emplacement, u?.id || null]);
  return Number(lot.id);
}

/** Sortie de matière : d'un lot précis (rouleau) ou en FIFO sur les lots les plus anciens. Jamais en négatif.
 *  Renvoie { valeur, detail: [{lot_id, qte, cout_unitaire}] }. */
async function sortieMP(c, u, { article_id, qte, lot_id = null, type = 'sortie', motif = '', ref_doc = '', date }) {
  qte = r3(qte);
  if (!(qte > 0)) throw leve('qte_invalide', 'La quantité doit être supérieure à 0.');
  const fiche = await ficheMP(c, article_id);
  if (estTissu(fiche) && !lot_id && type !== 'inventaire') throw leve('rouleau_requis', `« ${fiche.designation} » est un tissu : choisissez le rouleau d’où sort le métrage.`);
  const lots = (await c.query(`select id, qte_restante::float8 q, cout_unitaire::float8 cu, emplacement from stocks.lots_mp
    where article_id = $1 and qte_restante > 0 ${lot_id ? 'and id = $2' : ''} order by date_entree, id for update`, lot_id ? [article_id, lot_id] : [article_id])).rows;
  const dispo = r3(lots.reduce((s, l) => s + l.q, 0));
  if (lot_id && !lots.length) throw leve('lot_vide', 'Ce lot / rouleau est vide ou n’appartient pas à cet article.');
  if (qte > dispo + EPS) throw leve('stock_insuffisant', lot_id ? `Il reste ${dispo} ${fiche.unite || ''} sur ce rouleau / lot : impossible de sortir ${qte}.` : `Stock insuffisant pour « ${fiche.designation} » : ${dispo} ${fiche.unite || ''} disponible(s), ${qte} demandé(s).`);
  let reste = qte, valeur = 0; const detail = [];
  for (const l of lots) {
    if (reste <= EPS) break;
    const q = r3(Math.min(reste, l.q));
    await c.query('update stocks.lots_mp set qte_restante = qte_restante - $2 where id = $1', [l.id, q]);
    await c.query(`insert into stocks.mouvements_mp (date, type, article_id, lot_id, qte, cout_unitaire, valeur, motif, ref_doc, emplacement, utilisateur)
      values (coalesce($1::date, current_date),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [date || null, type, article_id, l.id, -q, l.cu, -r3(q * l.cu), motif, ref_doc, l.emplacement, u?.id || null]);
    valeur += q * l.cu; reste = r3(reste - q); detail.push({ lot_id: Number(l.id), qte: q, cout_unitaire: l.cu });
  }
  return { valeur: r3(valeur), detail };
}

/** Retour en stock sur un lot existant (retour d'atelier, inventaire +) au coût du lot. */
async function retourLot(c, u, { lot_id, qte, type = 'retour', motif = '', ref_doc = '', date }) {
  qte = r3(qte);
  if (!(qte > 0)) throw leve('qte_invalide', 'La quantité doit être supérieure à 0.');
  const l = (await c.query('select id, article_id, cout_unitaire::float8 cu, emplacement from stocks.lots_mp where id = $1 for update', [lot_id])).rows[0];
  if (!l) throw leve('lot_introuvable', 'Lot / rouleau introuvable.', 404);
  await c.query('update stocks.lots_mp set qte_restante = qte_restante + $2 where id = $1', [lot_id, qte]);
  await c.query(`insert into stocks.mouvements_mp (date, type, article_id, lot_id, qte, cout_unitaire, valeur, motif, ref_doc, emplacement, utilisateur)
    values (coalesce($1::date, current_date),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [date || null, type, l.article_id, lot_id, qte, l.cu, r3(qte * l.cu), motif, ref_doc, l.emplacement, u?.id || null]);
  return { article_id: Number(l.article_id), valeur: r3(qte * l.cu) };
}

/** Transfert d'emplacement : tout le lot change de place, ou une partie est scindée en nouveau lot (même coût). */
async function transfertLot(c, u, { lot_id, qte, emplacement, motif = '' }) {
  const l = (await c.query('select * from stocks.lots_mp where id = $1 for update', [lot_id])).rows[0];
  if (!l) throw leve('lot_introuvable', 'Lot / rouleau introuvable.', 404);
  emplacement = String(emplacement || '').trim().slice(0, 80);
  if (!emplacement) throw leve('emplacement_requis', 'Indiquez le nouvel emplacement.');
  const rest = Number(l.qte_restante); qte = r3(qte || rest);
  if (!(qte > 0) || qte > rest + EPS) throw leve('qte_invalide', `Quantité à transférer entre 0 et ${rest}.`);
  const mv = (lot, q, empl) => c.query(`insert into stocks.mouvements_mp (type, article_id, lot_id, qte, cout_unitaire, valeur, motif, emplacement, utilisateur)
    values ('transfert',$1,$2,$3,$4,0,$5,$6,$7)`, [l.article_id, lot, q, l.cout_unitaire, motif || `${l.emplacement || '—'} → ${emplacement}`, empl, u?.id || null]);
  if (Math.abs(qte - rest) <= EPS) {
    await c.query('update stocks.lots_mp set emplacement = $2 where id = $1', [lot_id, emplacement]);
    await mv(lot_id, 0, emplacement);
    return Number(lot_id);
  }
  await c.query('update stocks.lots_mp set qte_restante = qte_restante - $2 where id = $1', [lot_id, qte]);
  const n = (await c.query(`insert into stocks.lots_mp (article_id, reception_id, origine_lot, n_lot, bain, rouleau, date_entree, qte_initiale, qte_restante, cout_unitaire, emplacement)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) returning id`, [l.article_id, l.reception_id, l.id, l.n_lot, l.bain, l.rouleau, l.date_entree, qte, l.cout_unitaire, emplacement])).rows[0].id;
  await mv(lot_id, -qte, l.emplacement); await mv(n, qte, emplacement);
  return Number(n);
}

/** État du stock matières par article : physique, réservé, disponible, valeur FIFO, alerte de réapprovisionnement. */
async function etatMP(db) {
  const r = await db.query(`select f.id, f.donnees, f.actif,
      coalesce(sum(l.qte_restante), 0)::float8 physique,
      coalesce(sum(l.qte_restante * l.cout_unitaire), 0)::float8 valeur,
      count(l.id) filter (where l.qte_restante > 0)::int lots,
      (select coalesce(sum(qte), 0)::float8 from stocks.reservations_mp r where r.article_id = f.id and r.actif) reserve
    from registres.fiches f left join stocks.lots_mp l on l.article_id = f.id and l.qte_restante > 0
    where f.registre = 'articles_mp' group by f.id order by f.actif desc, lower(f.donnees->>'designation')`);
  return r.rows.map((x) => {
    const seuil = x.donnees.stock_mini === undefined || x.donnees.stock_mini === '' ? null : Number(x.donnees.stock_mini);
    const disponible = r3(x.physique - x.reserve);
    return { id: Number(x.id), code: x.donnees.code || '', designation: x.donnees.designation, famille: x.donnees.famille || '', unite: x.donnees.unite || '',
      couleur: x.donnees.couleur || '', actif: x.actif, physique: r3(x.physique), reserve: r3(x.reserve), disponible, lots: x.lots,
      seuil_min: seuil, alerte: seuil !== null && disponible < seuil, valeur: r3(x.valeur), cout_moyen: x.physique > 0 ? r4(x.valeur / x.physique) : 0 };
  });
}

// ================================================================ produits finis
/** Produit fini d'une ligne de document : référence P00126H, ou ancien code article 0.7.0 converti (alias). */
async function produitDeCode(c, code) {
  code = String(code || '').trim();
  if (!code) return null;
  if (REF_PF.test(code)) {
    const p = (await c.query('select id, reference, pri::float8 pri from pf.produits where reference = $1', [code])).rows[0];
    if (p) return p;
  }
  return (await c.query(`select p.id, p.reference, p.pri::float8 pri from commercial.articles a join pf.produits p on p.id = a.produit_id where a.code = $1`, [code])).rows[0] || null;
}

/** Entrée en stock PF : couvre d'abord un éventuel stock négatif, le reste forme une couche FIFO. */
async function entreePF(c, u, { produit_id, taille = '', couleur = '', qte, cout_unitaire = null, type = 'entree_manuelle', motif = '', ref_doc = '', ref_num = '', date }) {
  qte = r3(qte);
  if (!(qte > 0)) throw leve('qte_invalide', 'La quantité doit être supérieure à 0.');
  taille = String(taille || '').trim().slice(0, 30); couleur = String(couleur || '').trim().slice(0, 60);
  const p = (await c.query('select pri::float8 pri from pf.produits where id = $1', [produit_id])).rows[0];
  if (!p) throw leve('produit_introuvable', 'Produit fini introuvable.', 404);
  const cu = r4(cout_unitaire ?? p.pri);
  await c.query(`insert into stocks.pf_stock (produit_id, taille, couleur, qte) values ($1,$2,$3,0) on conflict do nothing`, [produit_id, taille, couleur]);
  const s = (await c.query('select qte::float8 q from stocks.pf_stock where produit_id = $1 and taille = $2 and couleur = $3 for update', [produit_id, taille, couleur])).rows[0];
  const couche = r3(Math.max(0, s.q + qte) - Math.max(0, s.q));
  if (couche > EPS) await c.query(`insert into stocks.couches_pf (produit_id, taille, couleur, date_entree, qte_restante, cout_unitaire) values ($1,$2,$3,coalesce($4::date, current_date),$5,$6)`, [produit_id, taille, couleur, date || null, couche, cu]);
  await c.query('update stocks.pf_stock set qte = qte + $4, maj_le = now() where produit_id = $1 and taille = $2 and couleur = $3', [produit_id, taille, couleur, qte]);
  await c.query(`insert into stocks.mouvements_pf (date, type, produit_id, taille, couleur, qte, valeur, motif, ref_doc, ref_num, utilisateur)
    values (coalesce($1::date, current_date),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [date || null, type, produit_id, taille, couleur, qte, r3(qte * cu), motif, ref_doc, ref_num, u?.id || null]);
  return { qte_apres: r3(s.q + qte), valeur: r3(qte * cu) };
}

/** Sortie PF en FIFO. `autoriserNegatif` (BL) : le manque est valorisé au PRI du produit et signalé. */
async function sortiePF(c, u, { produit_id, taille = '', couleur = '', qte, type = 'sortie', motif = '', ref_doc = '', ref_num = '', autoriserNegatif = false, date }) {
  qte = r3(qte);
  if (!(qte > 0)) throw leve('qte_invalide', 'La quantité doit être supérieure à 0.');
  taille = String(taille || '').trim().slice(0, 30); couleur = String(couleur || '').trim().slice(0, 60);
  const p = (await c.query('select reference, pri::float8 pri from pf.produits where id = $1', [produit_id])).rows[0];
  if (!p) throw leve('produit_introuvable', 'Produit fini introuvable.', 404);
  await c.query(`insert into stocks.pf_stock (produit_id, taille, couleur, qte) values ($1,$2,$3,0) on conflict do nothing`, [produit_id, taille, couleur]);
  const avant = Number((await c.query('select qte from stocks.pf_stock where produit_id = $1 and taille = $2 and couleur = $3 for update', [produit_id, taille, couleur])).rows[0].qte);
  if (!autoriserNegatif && qte > avant + EPS) throw leve('stock_insuffisant', `Stock insuffisant pour ${p.reference}${taille ? ' ' + taille : ''}${couleur ? ' ' + couleur : ''} : ${r3(avant)} en stock, ${qte} demandé(s).`);
  const couches = (await c.query(`select id, qte_restante::float8 q, cout_unitaire::float8 cu from stocks.couches_pf
    where produit_id = $1 and taille = $2 and couleur = $3 and qte_restante > 0 order by date_entree, id for update`, [produit_id, taille, couleur])).rows;
  let reste = qte, valeur = 0;
  for (const k of couches) {
    if (reste <= EPS) break;
    const q = r3(Math.min(reste, k.q));
    await c.query('update stocks.couches_pf set qte_restante = qte_restante - $2 where id = $1', [k.id, q]);
    valeur += q * k.cu; reste = r3(reste - q);
  }
  if (reste > EPS) valeur += reste * p.pri; // stock négatif : valorisé au prix de revient actuel
  const apres = r3(avant - qte), alerte = apres < -EPS;
  await c.query('update stocks.pf_stock set qte = $4, maj_le = now() where produit_id = $1 and taille = $2 and couleur = $3', [produit_id, taille, couleur, apres]);
  await c.query(`insert into stocks.mouvements_pf (date, type, produit_id, taille, couleur, qte, valeur, motif, ref_doc, ref_num, alerte_negatif, utilisateur)
    values (coalesce($1::date, current_date),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [date || null, type, produit_id, taille, couleur, -qte, -r3(valeur), motif, ref_doc, ref_num, alerte, u?.id || null]);
  return { reference: p.reference, qte_avant: r3(avant), qte_apres: apres, alerte, valeur: r3(valeur) };
}

/** BL → stock PF. Calcule ce que le BL doit avoir sorti (0 s'il est annulé) et passe la différence
 *  (sortie ou retour) : création, modification de quantité, suppression de ligne et annulation en une seule règle.
 *  Les lignes qui ne reposent pas sur un produit fini (studio, prestations, saisie libre) ne bougent pas le stock.
 *  Renvoie les alertes de stock négatif. */
async function synchroniserBL(c, u, bl) {
  const voulu = new Map();
  if (bl.status !== 'annule') {
    const o = (await c.query(`select donnees from commercial.documents where collection = 'orders' and id = $1`, [bl.orderId || ''])).rows[0]?.donnees;
    for (const l of bl.lines || []) {
      const ol = (o?.lines || []).find((x) => x.id === l.lineId);
      if (!ol || ol.service) continue;
      const p = await produitDeCode(c, ol.article);
      if (!p) continue;
      const k = JSON.stringify([Number(p.id), String(l.size ?? ol.size ?? '').trim(), String(l.color ?? ol.color ?? '').trim()]);
      voulu.set(k, r3((voulu.get(k) || 0) + (+l.qty || 0)));
    }
  }
  const deja = new Map(), valeurs = new Map();
  for (const m of (await c.query(`select produit_id, taille, couleur, sum(-qte)::float8 q, sum(-valeur)::float8 v from stocks.mouvements_pf
      where ref_doc = $1 and type in ('sortie_bl', 'retour_bl') group by 1, 2, 3`, [bl.id])).rows) {
    const k = JSON.stringify([Number(m.produit_id), m.taille, m.couleur]);
    deja.set(k, r3(m.q)); valeurs.set(k, m.v);
  }
  const alertes = [];
  for (const k of new Set([...voulu.keys(), ...deja.keys()])) {
    const [produit_id, taille, couleur] = JSON.parse(k);
    const diff = r3((voulu.get(k) || 0) - (deja.get(k) || 0));
    if (Math.abs(diff) <= EPS) continue;
    if (diff > 0) {
      const s = await sortiePF(c, u, { produit_id, taille, couleur, qte: diff, type: 'sortie_bl', ref_doc: bl.id, ref_num: bl.number || '', autoriserNegatif: true, date: bl.date, motif: 'Livraison' });
      if (s.alerte) alertes.push({ reference: s.reference, taille, couleur, livre: diff, stock_avant: s.qte_avant, stock_apres: s.qte_apres });
    } else {
      const cu = (deja.get(k) || 0) > 0 ? (valeurs.get(k) || 0) / deja.get(k) : null; // retour au coût moyen de ce qui est sorti
      await entreePF(c, u, { produit_id, taille, couleur, qte: -diff, cout_unitaire: cu, type: 'retour_bl', ref_doc: bl.id, ref_num: bl.number || '', motif: bl.status === 'annule' ? 'BL annulé' : 'BL modifié' });
    }
  }
  return alertes;
}

async function etatPF(db) {
  const r = await db.query(`select s.produit_id, p.reference, p.code_article, ca.libelle article, p.client_nom, s.taille, s.couleur, s.emplacement,
      s.qte::float8 qte, p.pri::float8 pri,
      (select coalesce(sum(k.qte_restante * k.cout_unitaire), 0)::float8 from stocks.couches_pf k where k.produit_id = s.produit_id and k.taille = s.taille and k.couleur = s.couleur) valeur,
      s.maj_le
    from stocks.pf_stock s join pf.produits p on p.id = s.produit_id left join pf.codes_article ca on ca.code = p.code_article
    order by p.reference, s.couleur, s.taille`);
  return r.rows.map((x) => ({ ...x, produit_id: Number(x.produit_id), qte: r3(x.qte), valeur: r3(x.valeur), negatif: x.qte < -EPS }));
}

module.exports = { REF_PF, r4, leve, estTissu, ficheMP, entreeLot, sortieMP, retourLot, transfertLot, etatMP, produitDeCode, entreePF, sortiePF, synchroniserBL, etatPF };
