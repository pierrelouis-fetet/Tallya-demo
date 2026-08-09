/* Un patrimoine synthétique, choisi pour que chaque total soit vérifiable de
   tête. Aucune donnée réelle : un test qui lit le `localStorage` de
   du propriétaire passerait ou échouerait selon son humeur du mois, et ferait
   voyager ses montants dans le dépôt.

   Les valeurs sont rondes et volontairement toutes distinctes : quand un test
   échoue, le montant faux désigne à lui seul la ligne fautive.

     Liquidités      3 000 courant + 2 000 précaution      =   5 000
     À investir      1 500 sur le PEA                      =   1 500
     Actions         MSCI 100 × 90                         =   9 000
     Métaux          Or 10 × 75  (poche « actions »)       =     750
     Immobilier      studio                                = 120 000
     Non coté        crowdfunding                          =   2 000
                                                    brut   = 138 250
     Crédit sur le contenant du studio                     = −40 000
                                                    net    =  98 250
*/
const Fixture = (() => {

  const BRUT = 138250;
  const DETTE = 40000;
  /* Le cash a investir, nomme parce qu'un test s'en sert pour verifier que
     retirer la tresorerie du reequilibrage retire bien ce montant de la base.
     L'ecrire en dur dans le test aurait cree une deuxieme source de verite : le
     jour ou le fixture change, le test aurait menti sans broncher. */
  const CASH_A_INVESTIR = 1500;

  function etat() {
    return {
      version: 2,
      schemaVersion: 2,
      meta: {
        objective: 200000, objectiveYear: 2030, expectedInflow: 0, modelCapital: 0,
        autoRefresh: false, preferredExchange: '',
        projMonthly: 100, projRate: 5, projInflation: 2, projTarget: 0, projHorizon: 10,
        savedAt: '', comptesReplies: [],
      },
      quotes: {}, sales: [], now: {}, accountInfo: {}, strategy: {},
      accounts: [], accountTypes: [],
      targets: {
        cashToInvest: 5,
        classes: { actions: 70, obligations: 10, metaux: 5, crypto: 5, monetaire: 10 },
        exclues: [],
      },
      budget: {
        monthlyTarget: 1000,
        categories: ['Courses', 'Voyages'],
        income: [{ label: 'Salaire', amount: 3000 }],
        contributors: [], fixedCharges: [], toReview: [], supplements: [], apports: [],
        expenses: [
          { month: '2026-01', v: { Courses: 400, Voyages: 100 }, note: '' },
          /* Un mois avec découpage : `v` reste la vérité, `d` le détaille. */
          { month: '2026-02', v: { Courses: 500 }, note: '',
            d: { Courses: [{ montant: 200, libelle: 'Marché' }, { montant: 300, libelle: '' }] } },
        ],
      },
      etabs: [
        { id: 'e_banque',   nom: 'Banque',      notes: '', dettes: [] },
        { id: 'e_courtier', nom: 'Courtier',    notes: '', dettes: [] },
        /* Le champ s'appelle `montant`, c'est lui que `dettesTotal()` somme. */
        { id: 'e_bien',     nom: 'Studio',      notes: '',
          dettes: [{ id: 'd_pret', libelle: 'Prêt immobilier', montant: DETTE, note: '' }] },
        { id: 'e_pe',       nom: 'Plateforme',  notes: '', dettes: [] },
      ],
      comptes: [
        compte('c_courant', 'e_banque', 'courant', 'Compte courant', '2020-01-01',
               [{ montant: 3000, affectation: 'courant' }], []),
        compte('c_livret', 'e_banque', 'livret', 'Livret A', '2020-01-01',
               [{ montant: 2000, affectation: 'precaution' }], []),
        compte('c_pea', 'e_courtier', 'pea', 'PEA', '2021-06-01',
               [{ montant: CASH_A_INVESTIR, affectation: 'investir' }], []),
        compte('c_cto', 'e_courtier', 'cto', 'CTO', '2022-01-01', [], []),
        compte('c_immo', 'e_bien', 'immo', 'Studio', '2023-01-01', [],
               [ligne('l_immo', 'immobilier', 'Studio', 120000, 110000)]),
        compte('c_pe', 'e_pe', 'crowdfunding', 'Crowdfunding', '2024-01-01', [],
               [ligne('l_pe', 'nonCote', 'Startups', 2000, 2000)]),
      ],
      positions: [
        position('p_etf', 'MSCI World', 'IWDA', 'EUR', 100, 80, 90, 'c_pea', 'actions', 'core'),
        position('p_or', 'Amundi Physical Gold', 'GOLD', 'EUR', 10, 70, 75, 'c_cto', 'metaux', 'satellite'),
      ],
      /* Un seul relevé, dont la somme fait exactement le brut du jour : les
         comptes portant des titres valent cash + titres. */
      monthly: [
        { date: '2026-01-31', comment: '',
          v: { c_courant: 3000, c_livret: 2000, c_pea: 10500, c_cto: 750,
               c_immo: 120000, c_pe: 2000 } },
      ],
    };
  }

  function compte(id, etabId, type, libelle, ouvertLe, cash, lignes) {
    return { id, etabId, type, statut: 'ouvert', ouvertLe, numero: '', notes: '',
             libelle, court: libelle, alloc: '', cash, lignes };
  }

  function ligne(id, classe, libelle, valeur, prixDeRevient) {
    return { id, classe, libelle, valeur, prixDeRevient, quantite: 1, dateAcquisition: '' };
  }

  function position(id, name, symbol, currency, qty, buyPrice, price, account, assetClass, role) {
    return { id, name, isin: '', symbol, currency, qty, buyPrice, price,
             fx: 1, fxBuy: 1, account, manual: false, assetClass, role };
  }

  /* Installe l'état et reconstruit la projection des comptes. `refreshAccounts`
     n'est pas optionnel : `rowGroups()` range chaque relevé par la poche du
     compte, qu'elle lit dans cette projection. Sans l'appel, les tests
     d'historique lisent les comptes du fixture précédent. */
  function poser(modifier) {
    const s = etat();
    if (modifier) modifier(s);
    Store.state = s;
    refreshAccounts();
    return s;
  }

  return { etat, poser, BRUT, DETTE, CASH_A_INVESTIR };
})();
