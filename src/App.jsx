import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Wallet, ReceiptText, CalendarClock, Settings as SettingsIcon,
  Printer, Plus, Check, Clock, AlertTriangle, ChevronRight, Building2,
  Download, Trash2, CircleCheck, Stamp, ArrowRight,
  Coins, Calculator, PieChart, TrendingDown, LogOut, Banknote, ArrowDownUp, Percent
} from "lucide-react";
import { store } from "./store";
import { supabase } from "./supabaseClient";

/* ============================================================================
   GESTION LOCATION MEUBLÉE — LMNP RÉEL
   Suivi des versements · Quittances · Calendrier fiscal
   Données persistées via window.storage (repli mémoire si indisponible).
   ============================================================================ */

const MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const CAT = {
  fiscal:   { label: "Fiscal",   c: "var(--brand)"  },
  cfe:      { label: "CFE",      c: "var(--accent)" },
  bail:     { label: "Bail",     c: "var(--green)"  },
  charges:  { label: "Charges",  c: "var(--amber)"  },
  assurance:{ label: "Assurance",c: "var(--ink-2)"  },
  perso:    { label: "Perso",    c: "var(--muted)"  },
};

const CHARGE_CATS = [
  { id: "copro",     label: "Charges de copropriété" },
  { id: "tf",        label: "Taxe foncière" },
  { id: "cfe",       label: "CFE" },
  { id: "assurance", label: "Assurance PNO / GLI" },
  { id: "interets",  label: "Intérêts d’emprunt" },
  { id: "assempr",   label: "Assurance emprunteur" },
  { id: "compta",    label: "Honoraires comptables" },
  { id: "gestion",   label: "Frais de gestion / agence" },
  { id: "entretien", label: "Entretien & réparations" },
  { id: "equipement",label: "Petit équipement (< 600 €)" },
  { id: "banque",    label: "Frais bancaires" },
  { id: "miseenloc", label: "Frais de mise en location" },
  { id: "procedure", label: "Frais de procédure" },
  { id: "abo",       label: "Abonnements & logiciels" },
  { id: "notaire",   label: "Frais d’acquisition (notaire)" },
  { id: "autres",    label: "Autres charges" },
];

/* Correspondance indicative poste -> rubrique 2033-B (+ compte PCG repère).
   À revoir selon la doctrine de ton comptable, notamment assurance emprunteur
   et frais d'acquisition (déductibles OU immobilisés puis amortis). */
const MAP_2033 = {
  copro:      { pcg: "614",   rub: "Autres achats et charges externes" },
  tf:         { pcg: "63512", rub: "Impôts, taxes et versements assimilés" },
  cfe:        { pcg: "63511", rub: "Impôts, taxes et versements assimilés" },
  assurance:  { pcg: "616",   rub: "Autres achats et charges externes" },
  interets:   { pcg: "661",   rub: "Charges financières (intérêts et assimilés)" },
  assempr:    { pcg: "616",   rub: "Charges financières (intérêts et assimilés)" },
  compta:     { pcg: "622",   rub: "Autres achats et charges externes" },
  gestion:    { pcg: "622",   rub: "Autres achats et charges externes" },
  entretien:  { pcg: "615",   rub: "Autres achats et charges externes" },
  equipement: { pcg: "606",   rub: "Autres achats et charges externes" },
  banque:     { pcg: "627",   rub: "Autres achats et charges externes" },
  miseenloc:  { pcg: "6226",  rub: "Autres achats et charges externes" },
  procedure:  { pcg: "6227",  rub: "Autres achats et charges externes" },
  abo:        { pcg: "6180",  rub: "Autres achats et charges externes" },
  notaire:    { pcg: "6226",  rub: "Autres achats et charges externes" },
  autres:     { pcg: "628",   rub: "Autres charges" },
};

const eur = (n) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const eurPlain = (n) => (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const frDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—");
const frShort = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const iso = (d) => d.toISOString().slice(0, 10);
const todayISO = () => iso(new Date());
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

/* ---- persistence helper -------------------------------------------------- */
const DEFAULT_SETTINGS = {
  bailleur: "Max",
  bailleurAdresse: "",
  locataire: "",
  adresseBien: "Le Pré-Saint-Gervais (93310)",
  loyerHC: 900,
  charges: 60,
  jourEcheance: 5,
  dateDebutBail: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
  departementResidence: "13",
  prixAcquisition: 0,
  fraisAcquisition: 0,
  travauxInitiaux: 0,
  apport: 0,
  note: "Zone d’encadrement des loyers (Est Ensemble) — vérifier loyer de référence majoré et complément de loyer.",
};

/* ---- fiscal calendar builder -------------------------------------------- */
function buildCalendar(year, settings) {
  const anniv = settings.dateDebutBail
    ? `${year}-${settings.dateDebutBail.slice(5)}`
    : `${year}-01-01`;
  const items = [
    { id:`charges-${year}`, date:`${year}-02-28`, cat:"charges",
      title:"Régularisation annuelle des charges",
      detail:"Comparer les provisions encaissées aux charges réelles (décompte du syndic) et régulariser avec le locataire. À faire dès réception de l’arrêté des comptes de copropriété." },
    { id:`liasse-${year}`, date:`${year}-05-20`, cat:"fiscal",
      title:"Télétransmission de la liasse fiscale",
      detail:`Déclarer le résultat BIC de l’exercice ${year-1} : formulaire 2031-SD + annexes 2033-A à 2033-D, par EDI-TDFC. Date limite le 20 mai ${year}. Pense au FEC à tenir en cas de contrôle.` },
    { id:`decl-${year}`, date:`${year}-05-30`, cat:"fiscal",
      title:"Report sur la 2042-C-PRO",
      detail:`Reporter le résultat sur la déclaration de revenus ${year-1} : case 5NK (bénéfice) ou 5NY (déficit, imputable 10 ans sur des BIC de même nature). Date échelonnée fin mai–début juin selon la zone de ton département de résidence.` },
    { id:`cfe-ac-${year}`, date:`${year}-06-15`, cat:"cfe",
      title:"Acompte de CFE",
      detail:"Verser l’acompte de 50 % si la CFE de l’an passé dépassait 3 000 €. Sinon, rien à ce stade. 1ʳᵉ année d’activité : exonération de CFE l’année de création." },
    { id:`irl-${year}`, date: anniv, cat:"bail",
      title:"Révision du loyer (IRL)",
      detail:"À la date anniversaire du bail : réviser le loyer selon le dernier IRL publié par l’INSEE, uniquement si le bail comporte une clause de révision. En zone d’encadrement, le loyer révisé reste plafonné." },
    { id:`pno-${year}`, date: anniv, cat:"assurance",
      title:"Renouvellement assurance PNO",
      detail:"Vérifier la reconduction de l’assurance propriétaire non-occupant et la garantie loyers impayés le cas échéant." },
    { id:`bail-${year}`, date: anniv, cat:"bail",
      title:"Reconduction tacite du bail meublé",
      detail:"Le bail meublé (1 an, ou 9 mois pour un étudiant) se reconduit tacitement. Vérifier qu’aucun congé n’est à donner et actualiser l’état des lieux si besoin." },
    { id:`cfe-avis-${year}`, date:`${year}-11-03`, cat:"cfe",
      title:"Avis de CFE disponible",
      detail:"Consulter l’avis de CFE dans l’espace professionnel impots.gouv.fr (il n’est pas envoyé par courrier)." },
    { id:`cfe-solde-${year}`, date:`${year}-12-15`, cat:"cfe",
      title:"Paiement du solde de CFE",
      detail:"Régler le solde de la CFE avant le 15 décembre via l’espace professionnel." },
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/* ---- payment status ------------------------------------------------------ */
function monthKeys(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}
function statusOf(key, pay, settings) {
  const bailStart = settings.dateDebutBail?.slice(0, 7);
  if (bailStart && key < bailStart) return "hors";
  if (pay?.received) return "paye";
  const [y, m] = key.split("-").map(Number);
  const due = new Date(y, m - 1, Number(settings.jourEcheance) || 1);
  return due < new Date(new Date().toDateString()) ? "retard" : "avenir";
}
const STATUS_META = {
  paye:   { label: "Payé",    fg: "var(--green)", bg: "var(--green-soft)" },
  retard: { label: "En retard", fg: "var(--red)",   bg: "var(--red-soft)" },
  avenir: { label: "À venir", fg: "var(--amber)", bg: "var(--amber-soft)" },
  hors:   { label: "Hors bail", fg: "var(--muted)", bg: "var(--surface-2)" },
};

/* ========================================================================== */
export default function App() {
  const [tab, setTab] = useState("dash");
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [payments, setPayments] = useState({});   // "YYYY-MM" -> {received, montantRecu, dateReceived, loyer, charges}
  const [quittances, setQuittances] = useState([]);
  const [done, setDone] = useState({});           // task id -> bool
  const [customTasks, setCustomTasks] = useState([]);
  const [charges, setCharges] = useState([]);           // {id,date,cat,label,amount,recuperable}
  const [amort, setAmort] = useState({ bati: 0, mobilier: 0, travaux: 0 });
  const [pret, setPret] = useState({ actif: false, mensualite: 0, partInterets: 0, jour: 5 });
  const [prev, setPrev] = useState({ tfMontant: 0, tfMois: 10, coproTrim: 0, coproTrimRecup: 0, coproMoisDebut: 1 });
  const [year, setYear] = useState(new Date().getFullYear());
  const [printDoc, setPrintDoc] = useState(null);

  /* load */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, p, q, d, c, ch, am, pr, pv] = await Promise.all([
        store.get("gl_settings", DEFAULT_SETTINGS),
        store.get("gl_payments", {}),
        store.get("gl_quittances", []),
        store.get("gl_done", {}),
        store.get("gl_custom", []),
        store.get("gl_charges", []),
        store.get("gl_amort", { bati: 0, mobilier: 0, travaux: 0 }),
        store.get("gl_pret", { actif: false, mensualite: 0, partInterets: 0, jour: 5 }),
        store.get("gl_prev", { tfMontant: 0, tfMois: 10, coproTrim: 0, coproTrimRecup: 0, coproMoisDebut: 1 }),
      ]);
      if (cancelled) return;
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setPayments(p); setQuittances(q); setDone(d); setCustomTasks(c);
      setCharges(ch); setAmort(am); setPret(pr); setPrev(pv);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
  /* save */
  useEffect(() => { if (loaded) store.set("gl_settings", settings); }, [settings, loaded]);
  useEffect(() => { if (loaded) store.set("gl_payments", payments); }, [payments, loaded]);
  useEffect(() => { if (loaded) store.set("gl_quittances", quittances); }, [quittances, loaded]);
  useEffect(() => { if (loaded) store.set("gl_done", done); }, [done, loaded]);
  useEffect(() => { if (loaded) store.set("gl_custom", customTasks); }, [customTasks, loaded]);
  useEffect(() => { if (loaded) store.set("gl_charges", charges); }, [charges, loaded]);
  useEffect(() => { if (loaded) store.set("gl_amort", amort); }, [amort, loaded]);
  useEffect(() => { if (loaded) store.set("gl_pret", pret); }, [pret, loaded]);
  useEffect(() => { if (loaded) store.set("gl_prev", prev); }, [prev, loaded]);

  const loyerTotal = (Number(settings.loyerHC) || 0) + (Number(settings.charges) || 0);

  /* derived: current-year figures */
  const keys = monthKeys(year);
  const encaisse = keys.reduce((s, k) => s + (payments[k]?.received ? Number(payments[k]?.montantRecu ?? loyerTotal) : 0), 0);
  const nbRetard = keys.filter((k) => statusOf(k, payments[k], settings) === "retard").length;
  const nbPaye = keys.filter((k) => statusOf(k, payments[k], settings) === "paye").length;

  /* estimated BIC result — amortissement can't create/deepen a deficit (art. 39 C) */
  const chargesTotal = charges
    .filter((c) => c.date?.slice(0, 4) === String(year))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const amortTotal = (Number(amort.bati) || 0) + (Number(amort.mobilier) || 0) + (Number(amort.travaux) || 0);
  const resAvantAmort = encaisse - chargesTotal;
  const amortImputable = Math.max(0, Math.min(amortTotal, Math.max(0, resAvantAmort)));
  const amortReporte = amortTotal - amortImputable;
  const resultat = resAvantAmort - amortImputable;
  const fiscal = { recettes: encaisse, chargesTotal, amortTotal, amortImputable, amortReporte, resultat };

  /* ---- trésorerie : uniquement les flux qui touchent réellement le compte ----
     Entrées  : loyers encaissés (réels si connus, sinon prévisionnels)
     Sorties  : charges payées + échéances de prêt (capital inclus)
     Exclu    : amortissements (charge comptable, aucun décaissement)          */
  const treso = useMemo(() => {
    const bailStart = settings.dateDebutBail?.slice(0, 7);
    const mens = pret.actif ? (Number(pret.mensualite) || 0) : 0;
    const nowKey = todayISO().slice(0, 7);
    const months = keys.map((k) => {
      const horsBail = bailStart && k < bailStart;
      const p = payments[k];
      const encaisseM = p?.received ? Number(p.montantRecu ?? loyerTotal) || 0 : 0;
      const prevu = horsBail ? 0 : loyerTotal;
      const reel = !!p?.received;
      const entrees = reel ? encaisseM : (k >= nowKey ? prevu : 0);
      const sortiesCharges = charges
        .filter((c) => c.date?.slice(0, 7) === k)
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

      /* charges récurrentes prévues : ajoutées seulement si aucune charge réelle
         de ce poste n'a déjà été saisie sur le mois (évite le double comptage) */
      const m = Number(k.slice(5));
      const aReel = (cat) => charges.some((c) => c.date?.slice(0, 7) === k && c.cat === cat);
      let prevTF = 0, prevCopro = 0;
      if (!horsBail) {
        if (Number(prev.tfMontant) > 0 && m === Number(prev.tfMois) && !aReel("tf")) {
          prevTF = Number(prev.tfMontant) || 0;
        }
        const deb = Number(prev.coproMoisDebut) || 1;
        const estTrimestre = ((m - deb) % 3 + 3) % 3 === 0 && m >= deb;
        if (Number(prev.coproTrim) > 0 && estTrimestre && !aReel("copro")) {
          prevCopro = Number(prev.coproTrim) || 0;
        }
      }
      const sortiesPrev = prevTF + prevCopro;
      const sortiesPret = horsBail ? 0 : mens;
      const net = entrees - sortiesCharges - sortiesPrev - sortiesPret;
      return { key: k, mois: MONTHS_FR[Number(k.slice(5)) - 1], horsBail, reel,
               entrees, sortiesCharges, sortiesPrev, prevTF, prevCopro, sortiesPret,
               sorties: sortiesCharges + sortiesPrev + sortiesPret, net,
               futur: k >= nowKey && !reel };
    });
    let cum = 0;
    months.forEach((m) => { cum += m.net; m.cumul = cum; });
    const tEntrees = months.reduce((s, m) => s + m.entrees, 0);
    const tCharges = months.reduce((s, m) => s + m.sortiesCharges, 0);
    const tPrev = months.reduce((s, m) => s + m.sortiesPrev, 0);
    const tPret = months.reduce((s, m) => s + m.sortiesPret, 0);
    const netAnnuel = tEntrees - tCharges - tPrev - tPret;
    const capitalRembourse = pret.actif
      ? Math.max(0, tPret - (Number(pret.partInterets) || 0) * months.filter((m) => m.sortiesPret > 0).length)
      : 0;
    const pire = months.reduce((a, m) => (m.net < a.net ? m : a), months[0] || { net: 0 });
    return { months, tEntrees, tCharges, tPrev, tPret, netAnnuel, capitalRembourse, pire };
  }, [keys, payments, charges, settings, loyerTotal, pret, prev]);

  /* combined upcoming deadlines (this year + next) */
  const upcoming = useMemo(() => {
    const cal = [...buildCalendar(year, settings), ...buildCalendar(year + 1, settings)]
      .map((t) => ({ ...t, done: !!done[t.id] }))
      .concat(customTasks.map((t) => ({ ...t, cat: t.cat || "perso", done: !!done[t.id] })));
    const t = todayISO();
    return cal.filter((x) => x.date >= t && !x.done).sort((a, b) => a.date.localeCompare(b.date));
  }, [year, settings, done, customTasks]);

  const toggleDone = (id) => setDone((d) => ({ ...d, [id]: !d[id] }));

  const emitQuittance = (monthKey) => {
    const [y, m] = monthKey.split("-").map(Number);
    const du = `${y}-${String(m).padStart(2, "0")}-01`;
    const au = iso(new Date(y, m, 0));
    const pay = payments[monthKey] || {};
    const loyer = Number(pay.loyer ?? settings.loyerHC) || 0;
    const charges = Number(pay.charges ?? settings.charges) || 0;
    const total = loyer + charges;
    const recu = Number(pay.montantRecu ?? total) || 0;
    const q = {
      id: `Q-${monthKey}-${Date.now().toString().slice(-4)}`,
      monthKey, du, au, loyer, charges, total,
      recu, partiel: recu < total,
      dateEmission: todayISO(),
      dateReglement: pay.dateReceived || todayISO(),
    };
    setQuittances((qs) => [q, ...qs.filter((x) => x.monthKey !== monthKey)]);
    setTab("quittances");
  };

  const exportCSV = () => {
    const rows = [["Mois", "Loyer HC", "Charges", "Total dû", "Encaissé", "Date règlement", "Statut"]];
    keys.forEach((k) => {
      const p = payments[k] || {};
      const st = statusOf(k, p, settings);
      if (st === "hors") return;
      rows.push([
        k,
        eurPlain(p.loyer ?? settings.loyerHC),
        eurPlain(p.charges ?? settings.charges),
        eurPlain((Number(p.loyer ?? settings.loyerHC)) + (Number(p.charges ?? settings.charges))),
        p.received ? eurPlain(p.montantRecu ?? loyerTotal) : "0,00",
        p.dateReceived ? frShort(p.dateReceived) : "",
        STATUS_META[st].label,
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `loyers-${year}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { /* sandbox */ }
  };

  const download = (name, content, type) => {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { /* sandbox */ }
  };
  const num2 = (n) => (Number(n) || 0).toFixed(2).replace(".", ",");

  /* Journal des recettes calé sur le 2033-B (loyers = production vendue de services, case BC) */
  const exportJournal2033 = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Date encaissement", "Mois", "Pièce", "Libellé", "Loyer HC", "Provisions charges", "Total encaissé", "Compte PCG", "Rubrique 2033-B"].map(esc).join(";")];
    let tL = 0, tC = 0, tR = 0;
    keys.forEach((k) => {
      const p = payments[k]; if (!p?.received) return;
      const loyer = Number(p.loyer ?? settings.loyerHC) || 0;
      const ch = Number(p.charges ?? settings.charges) || 0;
      const recu = Number(p.montantRecu ?? (loyer + ch)) || 0;
      tL += loyer; tC += ch; tR += recu;
      const q = quittances.find((x) => x.monthKey === k);
      const mois = `${MONTHS_FR[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
      rows.push([frShort(p.dateReceived || `${k}-01`), mois, q ? q.id : `LOY-${k}`, `Loyer ${mois}`, num2(loyer), num2(ch), num2(recu), "706", "Production vendue de services (case BC)"].map(esc).join(";"));
    });
    rows.push("");
    rows.push(esc(`RÉCAPITULATIF RECETTES 2033-B — exercice ${year}`));
    rows.push([esc("Production vendue de services (case BC, ligne 218)"), esc(num2(tR))].join(";"));
    rows.push([esc("  dont loyers hors charges"), esc(num2(tL))].join(";"));
    rows.push([esc("  dont provisions pour charges"), esc(num2(tC))].join(";"));
    download(`recettes-2033-${year}.csv`, "\uFEFF" + rows.join("\n"), "text/csv;charset=utf-8;");
  };

  /* Extrait FEC (18 colonnes, séparateur tabulation) — écritures d'encaissement */
  const exportFEC = () => {
    const fd = (s) => (s || "").replace(/-/g, "");
    const H = ["JournalCode","JournalLib","EcritureNum","EcritureDate","CompteNum","CompteLib","CompAuxNum","CompAuxLib","PieceRef","PieceDate","EcritureLib","Debit","Credit","EcritureLet","DateLet","ValidDate","Montantdevise","Idevise"];
    const lines = [H.join("\t")];
    const valid = fd(todayISO());
    let n = 0;
    keys.forEach((k) => {
      const p = payments[k]; if (!p?.received) return;
      const loyer = Number(p.loyer ?? settings.loyerHC) || 0;
      const ch = Number(p.charges ?? settings.charges) || 0;
      const recu = Number(p.montantRecu ?? (loyer + ch)) || 0;
      const d = fd(p.dateReceived || `${k}-01`);
      const q = quittances.find((x) => x.monthKey === k);
      const mois = `${MONTHS_FR[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
      const piece = q ? q.id : `LOY${k.replace("-", "")}`;
      const lib = `Loyer ${mois}`;
      n += 1;
      lines.push(["BQ","Banque",String(n),d,"512000","Banque","","",piece,d,lib,num2(recu),"0,00","","",valid,"",""].join("\t"));
      lines.push(["BQ","Banque",String(n),d,"706000","Loyers meublés","","",piece,d,lib,"0,00",num2(recu),"","",valid,"",""].join("\t"));
    });
    download(`FEC-recettes-${year}.txt`, lines.join("\r\n"), "text/plain;charset=utf-8;");
  };

  const doPrint = (q) => {
    setPrintDoc(q);
    setTimeout(() => { try { window.print(); } catch (e) {} }, 80);
  };


  /* ---- rentabilité ---------------------------------------------------------
     Brute  : loyer annualisé HC / coût total d'acquisition
     Nette  : après charges d'exploitation (hors financement et hors récupérable)
     Cash-on-cash : trésorerie nette / apport personnel                        */
  const rentab = useMemo(() => {
    const prix = Number(settings.prixAcquisition) || 0;
    const frais = Number(settings.fraisAcquisition) || 0;
    const trav = Number(settings.travauxInitiaux) || 0;
    const apport = Number(settings.apport) || 0;
    const cout = prix + frais + trav;
    const loyerAn = (Number(settings.loyerHC) || 0) * 12;

    /* charges d'exploitation : on exclut le financement (intérêts, assurance
       emprunteur) et la part récupérée auprès du locataire */
    const exploitSaisi = charges
      .filter((c) => c.date?.slice(0, 4) === String(year))
      .filter((c) => !["interets", "assempr", "notaire"].includes(c.cat))
      .filter((c) => !c.recuperable)
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const nbTrim = treso.months.filter((m) => m.prevCopro > 0).length;
    const coproNonRecup = Math.max(0, (Number(prev.coproTrim) || 0) - (Number(prev.coproTrimRecup) || 0)) * nbTrim;
    const tfPrev = treso.months.reduce((s, m) => s + m.prevTF, 0);
    const exploit = exploitSaisi + coproNonRecup + tfPrev;

    const brute = cout > 0 ? (loyerAn / cout) * 100 : null;
    const nette = cout > 0 ? ((loyerAn - exploit) / cout) * 100 : null;
    const coc = apport > 0 ? (treso.netAnnuel / apport) * 100 : null;
    return { cout, loyerAn, exploit, brute, nette, coc, apport, prix, frais, trav };
  }, [settings, charges, year, prev, treso]);

  const TABS = [
    { id: "dash", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "loyers", label: "Loyers & versements", icon: Wallet },
    { id: "quittances", label: "Quittances", icon: ReceiptText },
    { id: "charges", label: "Charges déductibles", icon: Coins },
    { id: "treso", label: "Trésorerie", icon: Banknote },
    { id: "calendrier", label: "Calendrier fiscal", icon: CalendarClock },
    { id: "params", label: "Paramètres", icon: SettingsIcon },
  ];

  if (!loaded) {
    return (
      <>
        <style>{CSS}</style>
        <div className="app loading-screen">
          <div className="brandmark"><Building2 size={20} /></div>
          <p>Chargement de tes données…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>

      <div className="no-print app">
        {/* ---- header ---- */}
        <header className="top">
          <div className="brandmark"><Building2 size={20} /></div>
          <div className="brandtext">
            <h1>Gestion locative</h1>
            <p>{settings.adresseBien || "—"} · LMNP réel</p>
          </div>
          <div className="yearpick">
            <button onClick={() => setYear((y) => y - 1)} aria-label="Année précédente">‹</button>
            <span>{year}</span>
            <button onClick={() => setYear((y) => y + 1)} aria-label="Année suivante">›</button>
          </div>
          <button className="signout" onClick={() => supabase.auth.signOut()} title="Se déconnecter"><LogOut size={16} /></button>
        </header>

        {/* ---- nav ---- */}
        <nav className="tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
                <Icon size={16} /><span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="page">
          {tab === "dash" && (
            <Dashboard
              year={year} encaisse={encaisse} nbRetard={nbRetard} nbPaye={nbPaye}
              loyerTotal={loyerTotal} upcoming={upcoming} quittances={quittances}
              fiscal={fiscal} onGo={setTab}
            />
          )}
          {tab === "charges" && (
            <Charges
              year={year} charges={charges} setCharges={setCharges}
              amort={amort} setAmort={setAmort} fiscal={fiscal}
            />
          )}
          {tab === "loyers" && (
            <Loyers
              year={year} keys={keys} payments={payments} setPayments={setPayments}
              settings={settings} loyerTotal={loyerTotal}
              onEmit={emitQuittance} onExport={exportCSV}
              onExportJournal={exportJournal2033} onExportFEC={exportFEC}
            />
          )}
          {tab === "quittances" && (
            <Quittances
              quittances={quittances} settings={settings}
              onPrint={doPrint} onDelete={(id) => setQuittances((qs) => qs.filter((q) => q.id !== id))}
              onGo={setTab}
            />
          )}
          {tab === "treso" && (
            <Tresorerie year={year} treso={treso} fiscal={fiscal} pret={pret} setPret={setPret}
              prev={prev} setPrev={setPrev} rentab={rentab} />
          )}
          {tab === "calendrier" && (
            <Calendrier
              year={year} settings={settings} done={done} toggleDone={toggleDone}
              customTasks={customTasks} setCustomTasks={setCustomTasks}
            />
          )}
          {tab === "params" && (
            <Params settings={settings} setSettings={setSettings} loyerTotal={loyerTotal} />
          )}
        </main>

        <footer className="foot">
          Outil de suivi personnel — ne remplace pas ta comptabilité ni un conseil fiscal.
          Dates 2026 : liasse (2031/2033) le 20 mai · 2042-C-PRO selon zone · CFE le 15 déc.
        </footer>
      </div>

      {/* ---- printable quittance ---- */}
      <div className="print-only">
        {printDoc && <QuittanceDoc q={printDoc} settings={settings} />}
      </div>
    </>
  );
}

/* ========================================================================== */
/* DASHBOARD                                                                  */
function Dashboard({ year, encaisse, nbRetard, nbPaye, loyerTotal, upcoming, quittances, fiscal, onGo }) {
  const next = upcoming[0];
  const dLeft = next ? daysBetween(next.date, todayISO()) : null;
  return (
    <div className="stack">
      {next && (
        <section className="hero">
          <div className="hero-eyebrow">Prochaine échéance</div>
          <div className="hero-main">
            <h2>{next.title}</h2>
            <div className="hero-meta">
              <span className="tagpill" style={{ color: CAT[next.cat]?.c, borderColor: CAT[next.cat]?.c }}>
                {CAT[next.cat]?.label}
              </span>
              <span className="hero-date">{frDate(next.date)}</span>
            </div>
          </div>
          <div className="hero-count">
            <div className="hero-num">{dLeft}</div>
            <div className="hero-unit">jour{dLeft > 1 ? "s" : ""}<br />restant{dLeft > 1 ? "s" : ""}</div>
          </div>
        </section>
      )}

      <section className="grid4">
        <Stat label={`Encaissé en ${year}`} value={eur(encaisse)} sub="loyers + charges reçus" tone="brand" />
        <Stat label="Mois réglés" value={`${nbPaye}`} sub={`sur l’année ${year}`} tone="green" />
        <Stat label="Loyers en retard" value={`${nbRetard}`} sub={nbRetard ? "à relancer" : "rien à signaler"} tone={nbRetard ? "red" : "muted"} />
        <Stat label="Loyer mensuel" value={eur(loyerTotal)} sub="charges comprises" tone="accent" />
      </section>

      {fiscal && (
        <section className="fiscal-strip">
          <div className="fs-item"><span>Recettes {year}</span><b>{eur(fiscal.recettes)}</b></div>
          <div className="fs-op">−</div>
          <div className="fs-item"><span>Charges</span><b>{eur(fiscal.chargesTotal)}</b></div>
          <div className="fs-op">−</div>
          <div className="fs-item"><span>Amort. imputés</span><b>{eur(fiscal.amortImputable)}</b></div>
          <div className="fs-op">=</div>
          <div className={`fs-item result ${fiscal.resultat < 0 ? "deficit" : "benef"}`}>
            <span>{fiscal.resultat < 0 ? "Déficit BIC" : "Résultat imposable"}</span>
            <b>{eur(Math.abs(fiscal.resultat))}</b>
          </div>
          <button className="link fs-link" onClick={() => onGo("charges")}>Détail <ChevronRight size={14} /></button>
        </section>
      )}

      <div className="grid2">
        <section className="card">
          <div className="card-head">
            <h3>Échéances à venir</h3>
            <button className="link" onClick={() => onGo("calendrier")}>Tout voir <ChevronRight size={14} /></button>
          </div>
          <ul className="deadlines">
            {upcoming.slice(0, 5).map((t) => {
              const dl = daysBetween(t.date, todayISO());
              return (
                <li key={t.id}>
                  <span className="dl-dot" style={{ background: CAT[t.cat]?.c }} />
                  <div className="dl-body">
                    <div className="dl-title">{t.title}</div>
                    <div className="dl-sub">{frDate(t.date)}</div>
                  </div>
                  <span className={`dl-left ${dl <= 14 ? "soon" : ""}`}>J−{dl}</span>
                </li>
              );
            })}
            {upcoming.length === 0 && <li className="empty">Aucune échéance à venir.</li>}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Quittances récentes</h3>
            <button className="link" onClick={() => onGo("quittances")}>Gérer <ChevronRight size={14} /></button>
          </div>
          {quittances.length === 0 ? (
            <div className="empty-box">
              <ReceiptText size={22} />
              <p>Aucune quittance émise. Génère-les depuis l’onglet <b>Loyers & versements</b>.</p>
            </div>
          ) : (
            <ul className="qlist">
              {quittances.slice(0, 5).map((q) => (
                <li key={q.id}>
                  <span className="q-per">{MONTHS_FR[Number(q.monthKey.slice(5)) - 1]} {q.monthKey.slice(0, 4)}</span>
                  <span className="q-amt">{eur(q.recu)}</span>
                  <span className={`q-tag ${q.partiel ? "warn" : ""}`}>{q.partiel ? "Reçu partiel" : "Quittance"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

/* ========================================================================== */
/* LOYERS                                                                     */
function Loyers({ year, keys, payments, setPayments, settings, loyerTotal, onEmit, onExport, onExportJournal, onExportFEC }) {
  const update = (k, patch) => setPayments((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  const togglePaid = (k) => {
    const cur = payments[k] || {};
    if (cur.received) update(k, { received: false });
    else update(k, { received: true, montantRecu: cur.montantRecu ?? loyerTotal, dateReceived: cur.dateReceived || todayISO() });
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Loyers & versements — {year}</h2>
          <p className="muted">Coche un mois pour l’enregistrer comme réglé, puis émets la quittance.</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={onExport}><Download size={15} /> Suivi (CSV)</button>
          <button className="btn ghost" onClick={onExportJournal}><Download size={15} /> Journal 2033-B</button>
          <button className="btn ghost" onClick={onExportFEC}><Download size={15} /> FEC recettes</button>
        </div>
      </div>

      <div className="ledger card">
        <div className="ledger-row head">
          <div>Mois</div><div>Dû</div><div>Encaissé</div><div>Date</div><div>Statut</div><div></div>
        </div>
        {keys.map((k) => {
          const p = payments[k] || {};
          const st = statusOf(k, p, settings);
          if (st === "hors") return (
            <div className="ledger-row muted-row" key={k}>
              <div className="lm">{MONTHS_FR[Number(k.slice(5)) - 1]}</div>
              <div className="hors" style={{ gridColumn: "2 / 7" }}>Hors période du bail</div>
            </div>
          );
          const meta = STATUS_META[st];
          return (
            <div className="ledger-row" key={k}>
              <div className="lm">{MONTHS_FR[Number(k.slice(5)) - 1]}</div>
              <div className="lnum">{eur((Number(p.loyer ?? settings.loyerHC)) + (Number(p.charges ?? settings.charges)))}</div>
              <div>
                <input className="mini-input" type="number" inputMode="decimal"
                  value={p.received ? (p.montantRecu ?? loyerTotal) : ""}
                  placeholder={p.received ? "" : "—"}
                  disabled={!p.received}
                  onChange={(e) => update(k, { montantRecu: e.target.value })} />
              </div>
              <div>
                <input className="mini-input" type="date"
                  value={p.dateReceived || ""} disabled={!p.received}
                  onChange={(e) => update(k, { dateReceived: e.target.value })} />
              </div>
              <div>
                <span className="pill" style={{ color: meta.fg, background: meta.bg }}>{meta.label}</span>
              </div>
              <div className="lactions">
                <button className={`check ${p.received ? "on" : ""}`} onClick={() => togglePaid(k)} title="Marquer réglé">
                  {p.received ? <Check size={14} /> : ""}
                </button>
                <button className="btn xs" disabled={!p.received} onClick={() => onEmit(k)} title="Émettre la quittance">
                  <ReceiptText size={13} /> Quittance
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* QUITTANCES                                                                 */
function Quittances({ quittances, settings, onPrint, onDelete, onGo }) {
  const [openId, setOpenId] = useState(quittances[0]?.id || null);
  const open = quittances.find((q) => q.id === openId) || quittances[0];

  if (quittances.length === 0) {
    return (
      <div className="empty-box big">
        <ReceiptText size={30} />
        <p>Aucune quittance pour l’instant.</p>
        <button className="btn" onClick={() => onGo("loyers")}>Aller aux versements <ArrowRight size={15} /></button>
      </div>
    );
  }
  return (
    <div className="qwrap">
      <aside className="qside card">
        <div className="card-head"><h3>Historique</h3></div>
        <ul className="qhist">
          {quittances.map((q) => (
            <li key={q.id} className={q.id === (open?.id) ? "on" : ""} onClick={() => setOpenId(q.id)}>
              <div>
                <div className="q-per">{MONTHS_FR[Number(q.monthKey.slice(5)) - 1]} {q.monthKey.slice(0, 4)}</div>
                <div className="q-sub">{eur(q.recu)} · {q.partiel ? "reçu partiel" : "quittance"}</div>
              </div>
              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(q.id); }} title="Supprimer"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="qmain">
        <div className="qtoolbar">
          <span className="muted">Aperçu du document</span>
          <button className="btn" onClick={() => onPrint(open)}><Printer size={15} /> Imprimer / PDF</button>
        </div>
        <div className="doc-frame">
          <QuittanceDoc q={open} settings={settings} />
        </div>
      </div>
    </div>
  );
}

function QuittanceDoc({ q, settings }) {
  const partiel = q.partiel;
  return (
    <div className="quittance">
      <div className="qh">
        <div>
          <div className="qkicker">{partiel ? "Reçu de paiement partiel" : "Quittance de loyer"}</div>
          <h2 className="qtitle">{MONTHS_FR[Number(q.monthKey.slice(5)) - 1]} {q.monthKey.slice(0, 4)}</h2>
        </div>
        <div className="qseal"><Stamp size={26} /><span>Acquitté</span></div>
      </div>

      <div className="qparties">
        <div>
          <div className="qlabel">Bailleur</div>
          <div className="qval">{settings.bailleur || "—"}</div>
          {settings.bailleurAdresse && <div className="qmini">{settings.bailleurAdresse}</div>}
        </div>
        <div>
          <div className="qlabel">Locataire</div>
          <div className="qval">{settings.locataire || "—"}</div>
        </div>
      </div>

      <div className="qbien">
        <span className="qlabel">Logement loué</span>
        <span>{settings.adresseBien || "—"}</span>
      </div>

      <table className="qtable">
        <tbody>
          <tr><td>Loyer hors charges</td><td>{eur(q.loyer)}</td></tr>
          <tr><td>Provision pour charges</td><td>{eur(q.charges)}</td></tr>
          <tr className="qtotal"><td>Total dû</td><td>{eur(q.total)}</td></tr>
          <tr className="qrecu"><td>Somme réglée</td><td>{eur(q.recu)}</td></tr>
        </tbody>
      </table>

      <p className="qbody">
        Je soussigné(e) {settings.bailleur || "—"}, bailleur du logement désigné ci-dessus,
        {partiel
          ? <> reconnais avoir reçu de {settings.locataire || "le locataire"} la somme de <b>{eur(q.recu)}</b>, à valoir sur le loyer et les charges de la période du {frDate(q.du)} au {frDate(q.au)}. Ce reçu ne vaut pas quittance pour le solde restant dû.</>
          : <> déclare avoir reçu de {settings.locataire || "le locataire"} la somme de <b>{eur(q.recu)}</b> au titre du paiement du loyer et des charges pour la période du {frDate(q.du)} au {frDate(q.au)}, et lui en donne quittance, sous réserve de tous mes droits.</>}
      </p>
      {!partiel && <p className="qnote">La présente quittance annule tous les reçus antérieurs établis pour la période concernée.</p>}

      <div className="qfoot">
        <div>
          <div className="qmini">Fait le {frDate(q.dateEmission)}</div>
          <div className="qmini">Règlement reçu le {frDate(q.dateReglement)}</div>
        </div>
        <div className="qsign">
          <div className="qsign-line" />
          <div className="qmini">Signature du bailleur</div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* CALENDRIER                                                                 */
function Calendrier({ year, settings, done, toggleDone, customTasks, setCustomTasks }) {
  const [draft, setDraft] = useState({ title: "", date: "", cat: "perso", detail: "" });
  const cal = useMemo(() => {
    const base = buildCalendar(year, settings);
    const extra = customTasks.filter((t) => t.date?.slice(0, 4) === String(year))
      .map((t) => ({ ...t, cat: t.cat || "perso", custom: true }));
    return [...base, ...extra].sort((a, b) => a.date.localeCompare(b.date));
  }, [year, settings, customTasks]);

  const addTask = () => {
    if (!draft.title || !draft.date) return;
    setCustomTasks((t) => [...t, { ...draft, id: `c-${Date.now()}` }]);
    setDraft({ title: "", date: "", cat: "perso", detail: "" });
  };
  const t = todayISO();

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Calendrier fiscal & obligations — {year}</h2>
          <p className="muted">Les échéances LMNP réel, générées automatiquement. Coche ce qui est fait.</p>
        </div>
      </div>

      <div className="timeline card">
        {cal.map((task) => {
          const isDone = !!done[task.id];
          const overdue = !isDone && task.date < t;
          return (
            <div key={task.id} className={`tl-item ${isDone ? "is-done" : ""}`}>
              <button className={`tl-check ${isDone ? "on" : ""}`} onClick={() => toggleDone(task.id)}>
                {isDone && <Check size={13} />}
              </button>
              <div className="tl-rail" style={{ background: CAT[task.cat]?.c }} />
              <div className="tl-body">
                <div className="tl-top">
                  <span className="tl-date">{frDate(task.date)}</span>
                  <span className="tagpill" style={{ color: CAT[task.cat]?.c, borderColor: CAT[task.cat]?.c }}>{CAT[task.cat]?.label}</span>
                  {overdue && <span className="tagpill overdue"><AlertTriangle size={11} /> en retard</span>}
                  {task.custom && (
                    <button className="icon-btn tiny" onClick={() => setCustomTasks((ts) => ts.filter((x) => x.id !== task.id))} title="Supprimer"><Trash2 size={12} /></button>
                  )}
                </div>
                <div className="tl-title">{task.title}</div>
                <div className="tl-detail">{task.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="card add-task">
        <div className="card-head"><h3><Plus size={15} /> Ajouter un rappel</h3></div>
        <div className="add-grid">
          <input className="input" placeholder="Intitulé (ex. Envoyer décompte de charges)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <select className="input" value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value })}>
            {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn" onClick={addTask}>Ajouter</button>
        </div>
      </section>
    </div>
  );
}

/* ========================================================================== */
/* PARAMS                                                                      */
function Params({ settings, setSettings, loyerTotal }) {
  const up = (patch) => setSettings((s) => ({ ...s, ...patch }));
  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Paramètres du bail</h2>
          <p className="muted">Ces informations alimentent les quittances et le calendrier.</p>
        </div>
        <span className="pill" style={{ color: "var(--brand)", background: "var(--brand-soft)" }}>Loyer total : {eur(loyerTotal)}</span>
      </div>

      <div className="grid2">
        <section className="card form">
          <h3>Parties</h3>
          <Field label="Bailleur"><input className="input" value={settings.bailleur} onChange={(e) => up({ bailleur: e.target.value })} /></Field>
          <Field label="Adresse du bailleur"><input className="input" value={settings.bailleurAdresse} onChange={(e) => up({ bailleurAdresse: e.target.value })} placeholder="Optionnel" /></Field>
          <Field label="Locataire"><input className="input" value={settings.locataire} onChange={(e) => up({ locataire: e.target.value })} placeholder="Nom du locataire" /></Field>
          <Field label="Adresse du logement"><input className="input" value={settings.adresseBien} onChange={(e) => up({ adresseBien: e.target.value })} /></Field>
        </section>

        <section className="card form">
          <h3>Loyer & échéances</h3>
          <div className="row2">
            <Field label="Loyer hors charges (€)"><input className="input" type="number" value={settings.loyerHC} onChange={(e) => up({ loyerHC: e.target.value })} /></Field>
            <Field label="Provision charges (€)"><input className="input" type="number" value={settings.charges} onChange={(e) => up({ charges: e.target.value })} /></Field>
          </div>
          <div className="row2">
            <Field label="Jour d’échéance"><input className="input" type="number" min="1" max="28" value={settings.jourEcheance} onChange={(e) => up({ jourEcheance: e.target.value })} /></Field>
            <Field label="Début du bail"><input className="input" type="date" value={settings.dateDebutBail} onChange={(e) => up({ dateDebutBail: e.target.value })} /></Field>
          </div>
          <Field label="Département de résidence (pour la date 2042-C-PRO)"><input className="input" value={settings.departementResidence} onChange={(e) => up({ departementResidence: e.target.value })} /></Field>
        </section>

        <section className="card form">
          <h3>Acquisition (pour la rentabilité)</h3>
          <div className="row2">
            <Field label="Prix d’achat (€)"><input className="input" type="number" value={settings.prixAcquisition} onChange={(e) => up({ prixAcquisition: e.target.value })} /></Field>
            <Field label="Frais de notaire (€)"><input className="input" type="number" value={settings.fraisAcquisition} onChange={(e) => up({ fraisAcquisition: e.target.value })} /></Field>
          </div>
          <div className="row2">
            <Field label="Travaux initiaux (€)"><input className="input" type="number" value={settings.travauxInitiaux} onChange={(e) => up({ travauxInitiaux: e.target.value })} /></Field>
            <Field label="Apport personnel (€)"><input className="input" type="number" value={settings.apport} onChange={(e) => up({ apport: e.target.value })} /></Field>
          </div>
          <p className="fiscal-note">L’apport sert au calcul du rendement sur fonds propres. Laisse à 0 si l’achat était comptant.</p>
          <Field label="Note"><textarea className="input" rows={2} value={settings.note} onChange={(e) => up({ note: e.target.value })} /></Field>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

/* ========================================================================== */
/* CHARGES DÉDUCTIBLES                                                         */
function Charges({ year, charges, setCharges, amort, setAmort, fiscal }) {
  const [draft, setDraft] = useState({ date: todayISO(), cat: "copro", label: "", amount: "", recuperable: false });
  const catLabel = (id) => CHARGE_CATS.find((c) => c.id === id)?.label || "Autres charges";

  const list = useMemo(
    () => charges.filter((c) => c.date?.slice(0, 4) === String(year)).sort((a, b) => b.date.localeCompare(a.date)),
    [charges, year]
  );
  const byCat = useMemo(() => {
    const m = {};
    list.forEach((c) => { m[c.cat] = (m[c.cat] || 0) + (Number(c.amount) || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [list]);
  const maxCat = byCat.length ? byCat[0][1] : 0;

  const add = () => {
    if (!draft.amount || !draft.date) return;
    setCharges((cs) => [...cs, { ...draft, id: `x-${Date.now()}`, amount: Number(draft.amount) }]);
    setDraft({ date: todayISO(), cat: draft.cat, label: "", amount: "", recuperable: false });
  };
  const upAmort = (patch) => setAmort((a) => ({ ...a, ...patch }));
  const deficit = fiscal.resultat < 0;

  const exportLiasse = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [];
    rows.push(["Date", "Poste", "Libellé", "Montant €", "Compte PCG", "Rubrique 2033-B", "Récupérable"].map(esc).join(";"));
    list.forEach((c) => {
      const m = MAP_2033[c.cat] || MAP_2033.autres;
      rows.push([frShort(c.date), catLabel(c.cat), c.label || "", eurPlain(c.amount), m.pcg, m.rub, c.recuperable ? "oui" : "non"].map(esc).join(";"));
    });
    const rub = {};
    list.forEach((c) => { const m = MAP_2033[c.cat] || MAP_2033.autres; rub[m.rub] = (rub[m.rub] || 0) + (Number(c.amount) || 0); });
    const amortT = (Number(amort.bati) || 0) + (Number(amort.mobilier) || 0) + (Number(amort.travaux) || 0);
    const totalCharges = Object.values(rub).reduce((s, v) => s + v, 0);
    rows.push("");
    rows.push(esc(`RÉCAPITULATIF PAR RUBRIQUE 2033-B — exercice ${year}`));
    Object.entries(rub).sort((a, b) => b[1] - a[1]).forEach(([r, v]) => rows.push([esc(r), esc(eurPlain(v))].join(";")));
    rows.push([esc("Dotations aux amortissements (2033-C / 2033-B)"), esc(eurPlain(amortT))].join(";"));
    rows.push([esc("TOTAL charges + amortissements"), esc(eurPlain(totalCharges + amortT))].join(";"));
    const csv = "\uFEFF" + rows.join("\n");
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `charges-2033-${year}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { /* sandbox */ }
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Charges déductibles — {year}</h2>
          <p className="muted">Enregistre chaque dépense payée au titre de la location. Elle vient en déduction du résultat BIC.</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={exportLiasse}><Download size={15} /> Export liasse (CSV)</button>
          <span className="pill" style={{ color: "var(--red)", background: "var(--red-soft)" }}>
            <TrendingDown size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            {eur(fiscal.chargesTotal)} déductibles
          </span>
        </div>
      </div>

      <div className="grid2">
        <section className="card fiscal">
          <div className="card-head"><h3><Calculator size={15} /> Résultat fiscal estimé</h3></div>
          <div className="feq">
            <div className="feq-row"><span>Recettes encaissées</span><b>{eur(fiscal.recettes)}</b></div>
            <div className="feq-row minus"><span>− Charges déductibles</span><b>{eur(fiscal.chargesTotal)}</b></div>
            <div className="feq-row minus"><span>− Amortissements imputés</span><b>{eur(fiscal.amortImputable)}</b></div>
            <div className={`feq-total ${deficit ? "deficit" : "benef"}`}>
              <span>{deficit ? "Déficit BIC" : "Bénéfice imposable"}</span>
              <b>{eur(Math.abs(fiscal.resultat))}</b>
            </div>
          </div>
          {fiscal.amortReporte > 0 && (
            <p className="fiscal-note">
              {eur(fiscal.amortReporte)} d’amortissement non imputé cette année (plafonné pour ne pas créer de déficit) — reportable sans limite de durée.
            </p>
          )}
          {deficit && (
            <p className="fiscal-note">
              Déficit imputable uniquement sur des bénéfices LMNP de même nature, pendant 10 ans.
            </p>
          )}

          <div className="amort-box">
            <div className="amort-head">Dotations annuelles aux amortissements</div>
            <div className="amort-grid">
              <label className="field mini"><span>Bâti (composants)</span>
                <input className="input" type="number" value={amort.bati} onChange={(e) => upAmort({ bati: e.target.value })} /></label>
              <label className="field mini"><span>Mobilier & équip.</span>
                <input className="input" type="number" value={amort.mobilier} onChange={(e) => upAmort({ mobilier: e.target.value })} /></label>
              <label className="field mini"><span>Travaux</span>
                <input className="input" type="number" value={amort.travaux} onChange={(e) => upAmort({ travaux: e.target.value })} /></label>
            </div>
            <p className="fiscal-note">Montants annuels indicatifs, hors valeur du terrain (non amortissable). À aligner sur ta liasse 2033-C.</p>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h3><PieChart size={15} /> Répartition par poste</h3></div>
          {byCat.length === 0 ? (
            <div className="empty-box"><Coins size={22} /><p>Aucune charge saisie pour {year}.</p></div>
          ) : (
            <div className="bars">
              {byCat.map(([cat, val]) => (
                <div className="bar-row" key={cat}>
                  <div className="bar-label">{catLabel(cat)}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${maxCat ? (val / maxCat) * 100 : 0}%` }} /></div>
                  <div className="bar-val">{eur(val)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h3><Coins size={15} /> Registre des charges</h3></div>
        <div className="charge-add">
          <input className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <select className="input" value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value })}>
            {CHARGE_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input className="input" placeholder="Libellé (ex. appel de fonds T1)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <input className="input" type="number" inputMode="decimal" placeholder="Montant €" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          <label className="recup"><input type="checkbox" checked={draft.recuperable} onChange={(e) => setDraft({ ...draft, recuperable: e.target.checked })} /> récup.</label>
          <button className="btn" onClick={add}><Plus size={15} /></button>
        </div>

        {list.length === 0 ? (
          <div className="empty-box"><p>Rien pour l’instant. Ajoute ta première charge ci-dessus.</p></div>
        ) : (
          <div className="charge-list">
            <div className="charge-row head">
              <div>Date</div><div>Poste</div><div>Libellé</div><div>Montant</div><div></div>
            </div>
            {list.map((c) => (
              <div className="charge-row" key={c.id}>
                <div className="cmono">{frShort(c.date)}</div>
                <div><span className="cat-chip">{catLabel(c.cat)}</span></div>
                <div className="clabel">{c.label || "—"}{c.recuperable && <span className="recup-tag">récupérable</span>}</div>
                <div className="cmono camt">{eur(c.amount)}</div>
                <div className="cright"><button className="icon-btn" onClick={() => setCharges((cs) => cs.filter((x) => x.id !== c.id))}><Trash2 size={14} /></button></div>
              </div>
            ))}
          </div>
        )}
        <p className="fiscal-note reconcile">Les charges « récupérables » sont refacturées au locataire via les provisions : elles restent déductibles, mais tu dois les retrouver dans tes recettes lors de la régularisation annuelle.</p>
      </section>
    </div>
  );
}

/* ========================================================================== */
/* TRÉSORERIE — flux de caisse réels, hors amortissement                       */
function Tresorerie({ year, treso, fiscal, pret, setPret, prev, setPrev, rentab }) {
  const { months, tEntrees, tCharges, tPrev, tPret, netAnnuel, capitalRembourse, pire } = treso;
  const upPret = (patch) => setPret((p) => ({ ...p, ...patch }));
  const upPrev = (patch) => setPrev((x) => ({ ...x, ...patch }));
  const pct = (v) => (v == null ? "—" : `${v.toFixed(2).replace(".", ",")} %`);
  const actifs = months.filter((m) => !m.horsBail);
  const maxAbs = Math.max(1, ...actifs.map((m) => Math.max(m.entrees, m.sorties)));
  const cumMax = Math.max(1, ...actifs.map((m) => Math.abs(m.cumul)));

  /* pont trésorerie -> résultat fiscal */
  const interetsAn = pret.actif ? (Number(pret.partInterets) || 0) * actifs.length : 0;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Trésorerie — {year}</h2>
          <p className="muted">Ce qui entre et sort réellement du compte. Les amortissements sont exclus : ils ne coûtent aucun euro.</p>
        </div>
        <span className="pill" style={{ color: netAnnuel >= 0 ? "var(--green)" : "var(--red)",
          background: netAnnuel >= 0 ? "var(--green-soft)" : "var(--red-soft)" }}>
          <Banknote size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          Cash net {netAnnuel >= 0 ? "+" : "−"}{eur(Math.abs(netAnnuel))}
        </span>
      </div>

      <section className="grid4">
        <Stat label="Encaissements" value={eur(tEntrees)} sub="loyers + charges reçus" tone="green" />
        <Stat label="Charges & prévisions" value={eur(tCharges + tPrev)} sub={tPrev > 0 ? `dont ${eur(tPrev)} prévus` : "décaissements réels"} tone="red" />
        <Stat label="Échéances de prêt" value={eur(tPret)} sub={pret.actif ? "capital + intérêts" : "aucun prêt saisi"} tone="accent" />
        <Stat label="Solde net" value={eur(netAnnuel)} sub={netAnnuel >= 0 ? "excédent de trésorerie" : "effort d’épargne"} tone={netAnnuel >= 0 ? "brand" : "red"} />
      </section>

      <section className="card">
        <div className="card-head">
          <h3><ArrowDownUp size={15} /> Flux mensuels</h3>
          <span className="legend">
            <i className="lg-in" /> entrées <i className="lg-out" /> sorties <i className="lg-cum" /> cumul
          </span>
        </div>
        <div className="cash-chart">
          {months.map((m) => {
            if (m.horsBail) return <div className="cc-col off" key={m.key}><div className="cc-lbl">{m.mois.slice(0, 3)}</div></div>;
            return (
              <div className={`cc-col ${m.futur ? "prev" : ""}`} key={m.key} title={`${m.mois} · net ${eur(m.net)}`}>
                <div className="cc-bars">
                  <div className="cc-in" style={{ height: `${(m.entrees / maxAbs) * 100}%` }} />
                  <div className="cc-out" style={{ height: `${(m.sorties / maxAbs) * 100}%` }} />
                </div>
                <div className="cc-net" style={{ color: m.net >= 0 ? "var(--green)" : "var(--red)" }}>
                  {m.net >= 0 ? "+" : "−"}{Math.round(Math.abs(m.net))}
                </div>
                <div className="cc-lbl">{m.mois.slice(0, 3)}</div>
              </div>
            );
          })}
        </div>
        <div className="cum-line">
          <div className="cum-track">
            {actifs.map((m) => (
              <div key={m.key} className="cum-pt"
                style={{ height: `${Math.max(3, (Math.abs(m.cumul) / cumMax) * 100)}%`,
                         background: m.cumul >= 0 ? "var(--brand)" : "var(--red)" }} />
            ))}
          </div>
          <div className="cum-cap">Trésorerie cumulée · fin d’année {eur(actifs.length ? actifs[actifs.length - 1].cumul : 0)}</div>
        </div>
        {pire && pire.net < 0 && (
          <p className="fiscal-note">Mois le plus tendu : {pire.mois} ({eur(pire.net)}). Pense à provisionner les gros postes (taxe foncière, CFE, appels de fonds).</p>
        )}
      </section>

      <div className="grid2">
        <section className="card">
          <div className="card-head"><h3><Calculator size={15} /> Du cash au résultat fiscal</h3></div>
          <div className="feq">
            <div className="feq-row"><span>Trésorerie nette encaissée</span><b>{eur(netAnnuel)}</b></div>
            <div className="feq-row"><span>+ Remboursement de capital <em>(sorti, non déductible)</em></span><b>{eur(capitalRembourse)}</b></div>
            <div className="feq-row minus"><span>− Amortissements <em>(déduits, aucun décaissement)</em></span><b>{eur(fiscal.amortImputable)}</b></div>
            <div className={`feq-total ${fiscal.resultat < 0 ? "deficit" : "benef"}`}>
              <span>≈ {fiscal.resultat < 0 ? "Déficit BIC" : "Résultat imposable"}</span>
              <b>{eur(Math.abs(fiscal.resultat))}</b>
            </div>
          </div>
          <p className="fiscal-note">
            C’est tout l’intérêt du réel : tu peux encaisser de la trésorerie tout en affichant un résultat faible ou nul.
            À l’inverse, le capital remboursé sort du compte sans être déductible — d’où un impôt possible sans cash disponible.
          </p>
          <p className="fiscal-note">Rapprochement indicatif : l’écart exact dépend du décalage entre dates de paiement et rattachement comptable.</p>
        </section>

        <section className="card form">
          <h3>Échéance de prêt</h3>
          <label className="switch">
            <input type="checkbox" checked={!!pret.actif} onChange={(e) => upPret({ actif: e.target.checked })} />
            <span>Le bien est financé par un emprunt</span>
          </label>
          {pret.actif && (
            <>
              <div className="row2">
                <Field label="Mensualité totale (€)">
                  <input className="input" type="number" value={pret.mensualite} onChange={(e) => upPret({ mensualite: e.target.value })} />
                </Field>
                <Field label="Dont intérêts (€/mois)">
                  <input className="input" type="number" value={pret.partInterets} onChange={(e) => upPret({ partInterets: e.target.value })} />
                </Field>
              </div>
              <p className="fiscal-note">
                La mensualité entière sort du compte, mais seuls les <b>intérêts</b> sont déductibles — le capital, non.
                Reprends la part d’intérêts sur le tableau d’amortissement de ta banque (elle diminue chaque année).
              </p>
              <div className="pret-recap">
                <div><span>Sorties annuelles</span><b>{eur(tPret)}</b></div>
                <div><span>dont intérêts déductibles</span><b>{eur(interetsAn)}</b></div>
                <div><span>dont capital (non déductible)</span><b>{eur(capitalRembourse)}</b></div>
              </div>
              <p className="fiscal-note">Pense à saisir les intérêts en charge dans l’onglet <b>Charges déductibles</b> pour qu’ils entrent dans le résultat fiscal.</p>
            </>
          )}
        </section>
      </div>

      <div className="grid2">
        <section className="card form">
          <h3>Charges récurrentes prévues</h3>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 12 }}>
            Anticipées dans la trésorerie. Si tu saisis la charge réelle dans le registre, la prévision du mois s’efface automatiquement.
          </p>
          <div className="row2">
            <Field label="Taxe foncière (€/an)">
              <input className="input" type="number" value={prev.tfMontant} onChange={(e) => upPrev({ tfMontant: e.target.value })} />
            </Field>
            <Field label="Mois de prélèvement">
              <select className="input" value={prev.tfMois} onChange={(e) => upPrev({ tfMois: e.target.value })}>
                {MONTHS_FR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="row2">
            <Field label="Appel de copro (€/trimestre)">
              <input className="input" type="number" value={prev.coproTrim} onChange={(e) => upPrev({ coproTrim: e.target.value })} />
            </Field>
            <Field label="dont récupérable (€)">
              <input className="input" type="number" value={prev.coproTrimRecup} onChange={(e) => upPrev({ coproTrimRecup: e.target.value })} />
            </Field>
          </div>
          <Field label="Premier appel de l’année">
            <select className="input" value={prev.coproMoisDebut} onChange={(e) => upPrev({ coproMoisDebut: e.target.value })}>
              {MONTHS_FR.slice(0, 3).map((m, i) => <option key={m} value={i + 1}>{m} (puis tous les 3 mois)</option>)}
            </select>
          </Field>
          <p className="fiscal-note">
            L’appel entier sort du compte, part récupérable comprise : tu l’avances et la récupères via les provisions du locataire.
            Seule la part non récupérable pèse dans le calcul de rentabilité.
          </p>
        </section>

        <section className="card">
          <div className="card-head"><h3><Percent size={15} /> Rentabilité</h3></div>
          {rentab.cout > 0 ? (
            <>
              <div className="rent-grid">
                <div className="rent-box">
                  <span>Brute</span>
                  <b>{pct(rentab.brute)}</b>
                  <em>loyer annuel / coût total</em>
                </div>
                <div className="rent-box hl">
                  <span>Nette de charges</span>
                  <b>{pct(rentab.nette)}</b>
                  <em>après charges d’exploitation</em>
                </div>
                <div className="rent-box">
                  <span>Sur fonds propres</span>
                  <b>{pct(rentab.coc)}</b>
                  <em>trésorerie / apport</em>
                </div>
              </div>
              <div className="feq" style={{ marginTop: 14 }}>
                <div className="feq-row"><span>Loyer annualisé (hors charges)</span><b>{eur(rentab.loyerAn)}</b></div>
                <div className="feq-row minus"><span>− Charges d’exploitation</span><b>{eur(rentab.exploit)}</b></div>
                <div className="feq-row"><span>Coût total d’acquisition</span><b>{eur(rentab.cout)}</b></div>
                {rentab.apport > 0 && <div className="feq-row"><span>Apport personnel</span><b>{eur(rentab.apport)}</b></div>}
              </div>
              <p className="fiscal-note">
                Calculs hors fiscalité et hors financement (les intérêts d’emprunt sont exclus des charges d’exploitation,
                pour comparer le bien indépendamment de son montage). La rentabilité sur fonds propres, elle, intègre l’échéance de prêt.
              </p>
            </>
          ) : (
            <div className="empty-box">
              <Percent size={22} />
              <p>Renseigne le prix d’acquisition dans l’onglet <b>Paramètres</b> pour obtenir les rendements.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ========================================================================== */
const CSS = `
:root{
  --paper:#F5F6F3; --surface:#FFFFFF; --surface-2:#FBFAF6;
  --ink:#16222B; --ink-2:#3B4A54; --muted:#727E86; --line:#E6E8E3;
  --brand:#123E52; --brand-2:#1D5B74; --brand-soft:#E1EBEF;
  --accent:#A9772F; --accent-soft:#F3E9D8;
  --green:#2E6B52; --green-soft:#E3F0E9;
  --amber:#946510; --amber-soft:#F6ECD3;
  --red:#A8392F; --red-soft:#F5E2DE;
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;
  --sans:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  --mono:'SF Mono','JetBrains Mono',ui-monospace,'Cascadia Code',Menlo,monospace;
}
*{box-sizing:border-box}
.app{font-family:var(--sans);color:var(--ink);background:var(--paper);min-height:100vh;
  max-width:1080px;margin:0 auto;padding:20px 20px 40px;-webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.01em}
.muted{color:var(--muted)}
.loading-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;min-height:60vh;color:var(--muted);font-size:13.5px}
.loading-screen .brandmark{opacity:.85}

/* header */
.top{display:flex;align-items:center;gap:14px;padding:6px 2px 18px}
.brandmark{width:40px;height:40px;border-radius:11px;background:var(--brand);color:#fff;
  display:grid;place-items:center;flex:none;box-shadow:0 4px 14px rgba(18,62,82,.28)}
.brandtext h1{font-family:var(--serif);font-size:21px;line-height:1.1}
.brandtext p{margin:2px 0 0;font-size:12.5px;color:var(--muted);letter-spacing:.02em}
.yearpick{margin-left:auto;display:flex;align-items:center;gap:2px;background:var(--surface);
  border:1px solid var(--line);border-radius:10px;padding:3px;font-variant-numeric:tabular-nums}
.yearpick span{font-family:var(--mono);font-weight:600;padding:0 10px;font-size:14px}
.yearpick button{width:28px;height:28px;border:none;background:transparent;border-radius:7px;
  font-size:18px;color:var(--ink-2);cursor:pointer;line-height:1}
.yearpick button:hover{background:var(--brand-soft)}

/* tabs */
.tabs{display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;margin-bottom:20px;
  border-bottom:1px solid var(--line);scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:none;background:transparent;
  color:var(--muted);font-family:var(--sans);font-size:13.5px;font-weight:500;padding:10px 12px;
  cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab:hover{color:var(--ink-2)}
.tab.on{color:var(--brand);border-bottom-color:var(--brand);font-weight:600}

.stack{display:flex;flex-direction:column;gap:20px}
.page{min-height:50vh}

/* cards & sections */
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px}
.card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.card-head h3{font-size:15px;display:flex;align-items:center;gap:6px}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.section-head h2{font-family:var(--serif);font-size:22px}
.section-head .muted{font-size:13px;margin-top:3px}
.link{border:none;background:transparent;color:var(--brand);font-size:12.5px;font-weight:600;
  cursor:pointer;display:inline-flex;align-items:center;gap:2px}

/* hero */
.hero{display:flex;align-items:center;gap:20px;background:linear-gradient(120deg,var(--brand),var(--brand-2));
  color:#fff;border-radius:16px;padding:22px 24px;box-shadow:0 10px 30px rgba(18,62,82,.25)}
.hero-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.16em;opacity:.8}
.hero-main{flex:1;min-width:0}
.hero-main h2{font-family:var(--serif);font-size:22px;margin:6px 0 8px;line-height:1.15}
.hero-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.hero-date{font-size:13px;opacity:.92}
.hero .tagpill{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.4)!important;color:#fff!important}
.hero-count{text-align:center;flex:none;padding-left:16px;border-left:1px solid rgba(255,255,255,.22)}
.hero-num{font-family:var(--serif);font-size:44px;line-height:1;font-weight:600}
.hero-unit{font-size:11px;opacity:.85;margin-top:4px;line-height:1.2}

/* stats */
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:15px 16px;
  border-left:3px solid var(--muted)}
.stat-brand{border-left-color:var(--brand)} .stat-green{border-left-color:var(--green)}
.stat-red{border-left-color:var(--red)} .stat-accent{border-left-color:var(--accent)}
.stat-muted{border-left-color:var(--line)}
.stat-label{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.stat-value{font-family:var(--serif);font-size:26px;font-weight:600;margin:6px 0 2px;font-variant-numeric:tabular-nums}
.stat-sub{font-size:12px;color:var(--muted)}

/* deadlines list */
.deadlines,.qlist,.qhist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.deadlines li{display:flex;align-items:center;gap:11px;padding:11px 2px;border-top:1px solid var(--line)}
.deadlines li:first-child{border-top:none}
.dl-dot{width:8px;height:8px;border-radius:50%;flex:none}
.dl-body{flex:1;min-width:0}
.dl-title{font-size:13.5px;font-weight:500}
.dl-sub{font-size:11.5px;color:var(--muted)}
.dl-left{font-family:var(--mono);font-size:12px;color:var(--muted);font-weight:600}
.dl-left.soon{color:var(--red)}
.empty{color:var(--muted);font-size:13px;padding:10px 0}
.empty-box{display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--muted);
  text-align:center;padding:26px 16px}
.empty-box p{font-size:13px;margin:0;max-width:280px}
.empty-box.big{background:var(--surface);border:1px dashed var(--line);border-radius:14px;padding:48px}
.empty-box svg{color:var(--brand);opacity:.5}

/* quittance list mini */
.qlist li{display:flex;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid var(--line)}
.qlist li:first-child{border-top:none}
.q-per{font-weight:500;font-size:13px;text-transform:capitalize;flex:1}
.q-amt{font-family:var(--mono);font-size:12.5px}
.q-tag{font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--brand-soft);color:var(--brand);font-weight:600}
.q-tag.warn{background:var(--amber-soft);color:var(--amber)}

/* ledger */
.ledger{padding:6px 6px}
.ledger-row{display:grid;grid-template-columns:1.3fr 1fr 1fr 1.2fr 1fr 1.4fr;align-items:center;
  gap:10px;padding:9px 12px;border-radius:9px}
.ledger-row.head{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
  padding-bottom:8px;border-bottom:1px solid var(--line)}
.ledger-row:not(.head):hover{background:var(--surface-2)}
.lm{font-weight:500;text-transform:capitalize;font-size:13.5px}
.lnum,.q-per{font-variant-numeric:tabular-nums}
.lnum{font-family:var(--mono);font-size:13px;color:var(--ink-2)}
.muted-row .hors{color:var(--muted);font-size:12.5px;font-style:italic}
.lactions{display:flex;align-items:center;gap:7px;justify-content:flex-end}

.mini-input{width:100%;border:1px solid var(--line);border-radius:7px;padding:5px 7px;font-size:12.5px;
  font-family:var(--mono);background:var(--surface);color:var(--ink)}
.mini-input:disabled{background:var(--surface-2);color:var(--muted);opacity:.7}
.pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap}
.check{width:24px;height:24px;border:1.5px solid var(--line);border-radius:6px;background:var(--surface);
  cursor:pointer;display:grid;place-items:center;color:#fff;flex:none}
.check.on{background:var(--green);border-color:var(--green)}

/* buttons */
.btn{display:inline-flex;align-items:center;gap:6px;background:var(--brand);color:#fff;border:none;
  border-radius:9px;padding:9px 14px;font-family:var(--sans);font-size:13px;font-weight:600;cursor:pointer}
.btn:hover{background:var(--brand-2)}
.btn.ghost{background:transparent;color:var(--brand);border:1px solid var(--brand)}
.btn.ghost:hover{background:var(--brand-soft)}
.btn.xs{padding:5px 9px;font-size:11.5px;border-radius:7px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.icon-btn{border:none;background:transparent;color:var(--muted);cursor:pointer;padding:4px;border-radius:6px}
.icon-btn:hover{color:var(--red);background:var(--red-soft)}
.icon-btn.tiny{padding:2px}

/* tagpill */
.tagpill{font-size:10.5px;font-weight:600;padding:2px 8px;border:1px solid;border-radius:20px;
  display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
.tagpill.overdue{color:var(--red);border-color:var(--red)}

/* quittances layout */
.qwrap{display:grid;grid-template-columns:280px 1fr;gap:18px;align-items:start}
.qside{padding:14px}
.qhist li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;
  border-radius:9px;cursor:pointer;border:1px solid transparent}
.qhist li:hover{background:var(--surface-2)}
.qhist li.on{background:var(--brand-soft);border-color:var(--brand)}
.q-sub{font-size:11.5px;color:var(--muted);margin-top:2px}
.qtoolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.doc-frame{background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:22px;
  display:flex;justify-content:center;overflow:auto}

/* the document */
.quittance{background:#fff;width:100%;max-width:560px;padding:34px 38px;border-radius:6px;
  box-shadow:0 2px 20px rgba(20,34,43,.10);font-family:var(--serif);color:var(--ink);
  border-top:4px solid var(--brand)}
.qh{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;
  padding-bottom:16px;border-bottom:1.5px solid var(--ink);margin-bottom:18px}
.qkicker{font-family:var(--sans);font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--accent);font-weight:700}
.qtitle{font-size:24px;text-transform:capitalize;margin-top:4px}
.qseal{display:flex;flex-direction:column;align-items:center;color:var(--accent);
  border:1.5px solid var(--accent);border-radius:50%;width:74px;height:74px;justify-content:center;
  flex:none;transform:rotate(-8deg);opacity:.9}
.qseal span{font-family:var(--sans);font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-top:2px}
.qparties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px}
.qlabel{font-family:var(--sans);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600}
.qval{font-size:16px;margin-top:2px}
.qmini{font-family:var(--sans);font-size:11.5px;color:var(--muted);margin-top:2px}
.qbien{display:flex;flex-direction:column;gap:2px;background:var(--surface-2);border-radius:8px;
  padding:10px 12px;margin-bottom:16px;font-size:14px}
.qtable{width:100%;border-collapse:collapse;margin-bottom:16px}
.qtable td{padding:8px 4px;font-size:14px;border-bottom:1px solid var(--line)}
.qtable td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.qtable .qtotal td{font-weight:700;border-bottom:1.5px solid var(--ink)}
.qtable .qrecu td{color:var(--brand);font-weight:600;border-bottom:none}
.qbody{font-size:14px;line-height:1.65;margin:0 0 8px}
.qnote{font-family:var(--sans);font-size:11px;color:var(--muted);font-style:italic;margin:0 0 18px}
.qfoot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:22px;padding-top:14px;border-top:1px solid var(--line)}
.qsign{text-align:center}
.qsign-line{width:150px;border-bottom:1px solid var(--ink-2);margin-bottom:5px;height:26px}

/* timeline */
.timeline{padding:6px 8px}
.tl-item{display:grid;grid-template-columns:auto 4px 1fr;gap:12px;align-items:start;padding:14px 8px;
  border-top:1px solid var(--line)}
.tl-item:first-child{border-top:none}
.tl-item.is-done{opacity:.5}
.tl-item.is-done .tl-title{text-decoration:line-through}
.tl-check{width:22px;height:22px;border:1.5px solid var(--line);border-radius:6px;background:var(--surface);
  cursor:pointer;display:grid;place-items:center;color:#fff;margin-top:1px;flex:none}
.tl-check.on{background:var(--green);border-color:var(--green)}
.tl-rail{width:4px;border-radius:4px;align-self:stretch;min-height:100%}
.tl-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px}
.tl-date{font-family:var(--mono);font-size:11.5px;color:var(--ink-2);font-weight:600}
.tl-title{font-size:14.5px;font-weight:600}
.tl-detail{font-size:12.5px;color:var(--muted);line-height:1.55;margin-top:3px}

/* add task */
.add-grid{display:grid;grid-template-columns:1fr 150px 130px auto;gap:10px}
.add-task h3{color:var(--ink)}

/* forms */
.form h3{font-size:15px;margin-bottom:12px;font-family:var(--serif)}
.field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.field>span{font-size:11.5px;color:var(--ink-2);font-weight:500}
.input{border:1px solid var(--line);border-radius:9px;padding:9px 11px;font-family:var(--sans);
  font-size:13.5px;background:var(--surface);color:var(--ink);width:100%}
.input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
textarea.input{resize:vertical;line-height:1.5}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}

.foot{margin-top:24px;padding-top:16px;border-top:1px solid var(--line);font-size:11.5px;
  color:var(--muted);line-height:1.6}

/* fiscal strip (dashboard) */
.fiscal-strip{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--surface);
  border:1px solid var(--line);border-radius:13px;padding:14px 18px}
.fs-item{display:flex;flex-direction:column;gap:2px}
.fs-item span{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.fs-item b{font-family:var(--mono);font-size:15px;font-variant-numeric:tabular-nums}
.fs-op{font-size:16px;color:var(--muted);font-family:var(--serif)}
.fs-item.result span{color:var(--ink-2);font-weight:600}
.fs-item.result b{font-size:17px}
.fs-item.benef b{color:var(--brand)}
.fs-item.deficit b{color:var(--red)}
.fs-link{margin-left:auto;align-self:center}
.head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}

/* fiscal summary card */
.fiscal .feq{display:flex;flex-direction:column}
.feq-row{display:flex;justify-content:space-between;padding:9px 2px;font-size:13.5px;border-bottom:1px solid var(--line)}
.feq-row.minus{color:var(--ink-2)}
.feq-row b,.feq-total b{font-variant-numeric:tabular-nums}
.feq-row b{font-family:var(--mono)}
.feq-total{display:flex;justify-content:space-between;align-items:baseline;padding:14px 2px 2px;font-size:15px;font-weight:600}
.feq-total.benef{color:var(--brand)} .feq-total.deficit{color:var(--red)}
.feq-total b{font-size:22px;font-family:var(--serif)}
.fiscal-note{font-size:11.5px;color:var(--muted);line-height:1.5;margin:10px 0 0;font-style:italic}
.fiscal-note.reconcile{margin-top:14px;font-style:normal;padding-top:12px;border-top:1px solid var(--line)}
.amort-box{margin-top:16px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:13px 14px}
.amort-head{font-size:12px;font-weight:600;color:var(--ink-2);margin-bottom:9px}
.amort-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px}
.field.mini{margin-bottom:0}
.field.mini>span{font-size:10.5px}
.field.mini .input{padding:7px 9px;font-size:12.5px;font-family:var(--mono)}

/* breakdown bars */
.bars{display:flex;flex-direction:column;gap:11px}
.bar-row{display:grid;grid-template-columns:1.2fr 2fr auto;align-items:center;gap:11px}
.bar-label{font-size:12px;color:var(--ink-2)}
.bar-track{height:8px;background:var(--surface-2);border-radius:6px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,var(--brand),var(--brand-2));border-radius:6px;min-width:3px}
.bar-val{font-family:var(--mono);font-size:12px;white-space:nowrap}

/* charges register */
.charge-add{display:grid;grid-template-columns:132px 1.3fr 1.7fr 108px auto auto;gap:8px;margin-bottom:14px}
.charge-add .btn{padding:9px 12px}
.recup{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);white-space:nowrap}
.charge-list{display:flex;flex-direction:column}
.charge-row{display:grid;grid-template-columns:96px 1.2fr 1.8fr 108px 40px;align-items:center;gap:11px;
  padding:10px 8px;border-radius:8px}
.charge-row.head{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border-bottom:1px solid var(--line)}
.charge-row:not(.head):hover{background:var(--surface-2)}
.cmono{font-family:var(--mono);font-size:12.5px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.camt{color:var(--ink);font-weight:600}
.cat-chip{font-size:11px;background:var(--brand-soft);color:var(--brand);padding:2px 8px;border-radius:20px;font-weight:600;white-space:nowrap}
.clabel{font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.recup-tag{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--amber);background:var(--amber-soft);padding:1px 6px;border-radius:10px;font-weight:700}
.cright{text-align:right}

@media (max-width:860px){
  .amort-grid{grid-template-columns:1fr 1fr 1fr}
  .charge-add{grid-template-columns:1fr 1fr}
  .charge-add .btn{grid-column:1/3}
  .fs-link{margin-left:0;width:100%}
}
@media (max-width:560px){
  .fs-op{display:none}
  .fiscal-strip{gap:10px}
  .amort-grid{grid-template-columns:1fr}
  .charge-add{grid-template-columns:1fr}
  .charge-row{grid-template-columns:1fr auto;row-gap:2px}
  .charge-row.head{display:none}
  .charge-row .cmono:first-child{grid-column:1;color:var(--muted)}
  .charge-row .cright{grid-row:1/3;grid-column:2;align-self:center}
  .bar-row{grid-template-columns:1fr auto;gap:6px}
  .bar-track{grid-column:1/3;order:3}
}

.signout{margin-left:8px;width:36px;height:36px;border:1px solid var(--line);background:var(--surface);
  border-radius:10px;display:grid;place-items:center;color:var(--muted);cursor:pointer;flex:none}
.signout:hover{color:var(--brand);border-color:var(--brand);background:var(--brand-soft)}

/* trésorerie */
.legend{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted)}
.legend i{width:9px;height:9px;border-radius:2px;display:inline-block;margin-left:6px}
.lg-in{background:var(--green)} .lg-out{background:var(--red)} .lg-cum{background:var(--brand)}
.cash-chart{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;align-items:end;
  min-height:170px;padding:6px 0 0}
.cc-col{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.cc-col.off{opacity:.3}
.cc-col.prev .cc-in,.cc-col.prev .cc-out{opacity:.45;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.5) 0 3px,transparent 3px 6px)}
.cc-bars{display:flex;align-items:flex-end;gap:2px;height:120px;width:100%;justify-content:center}
.cc-in,.cc-out{width:9px;border-radius:3px 3px 0 0;min-height:2px}
.cc-in{background:var(--green)} .cc-out{background:var(--red)}
.cc-net{font-family:var(--mono);font-size:9.5px;font-weight:600;white-space:nowrap}
.cc-lbl{font-size:10px;color:var(--muted);text-transform:capitalize}
.cum-line{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.cum-track{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px;align-items:end;height:44px}
.cum-pt{border-radius:3px 3px 0 0;min-height:3px}
.cum-cap{font-size:11.5px;color:var(--muted);margin-top:7px}
.feq-row em{font-style:normal;color:var(--muted);font-size:11.5px}
.switch{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink);margin-bottom:14px;cursor:pointer}
.switch input{width:16px;height:16px;accent-color:var(--brand)}
.pret-recap{background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-top:4px}
.pret-recap div{display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0}
.pret-recap b{font-family:var(--mono);font-variant-numeric:tabular-nums}

@media (max-width:560px){
  .cash-chart{grid-template-columns:repeat(6,1fr);row-gap:14px}
  .cc-bars{height:90px}
  .cc-in,.cc-out{width:7px}
}

.rent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.rent-box{background:var(--surface-2);border:1px solid var(--line);border-radius:11px;
  padding:12px 13px;display:flex;flex-direction:column;gap:3px}
.rent-box.hl{background:var(--brand-soft);border-color:var(--brand)}
.rent-box span{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.rent-box b{font-family:var(--serif);font-size:23px;font-weight:600;color:var(--brand);font-variant-numeric:tabular-nums}
.rent-box em{font-style:normal;font-size:10.5px;color:var(--muted);line-height:1.35}

@media (max-width:560px){ .rent-grid{grid-template-columns:1fr} }

/* print */
.print-only{display:none}
@media print{
  .no-print{display:none!important}
  .print-only{display:block!important}
  .quittance{box-shadow:none;max-width:none;border-top:4px solid #123E52;padding:10px 4px}
}

/* responsive */
@media (max-width:860px){
  .grid4{grid-template-columns:1fr 1fr}
  .grid2{grid-template-columns:1fr}
  .qwrap{grid-template-columns:1fr}
  .add-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:560px){
  .grid4{grid-template-columns:1fr 1fr}
  .hero{flex-direction:column;align-items:flex-start;gap:14px}
  .hero-count{border-left:none;border-top:1px solid rgba(255,255,255,.22);padding:12px 0 0;padding-left:0;
    display:flex;align-items:baseline;gap:8px;width:100%}
  .hero-num{font-size:32px}
  .ledger-row{grid-template-columns:1fr 1fr;row-gap:6px;padding:10px}
  .ledger-row.head{display:none}
  .lactions{grid-column:1/3;justify-content:flex-start}
  .add-grid{grid-template-columns:1fr}
  .quittance{padding:22px 20px}
  .qparties{grid-template-columns:1fr}
}
`;
