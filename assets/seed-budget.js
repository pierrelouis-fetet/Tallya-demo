/* =============================================================
   SEED BUDGET — jeu de démonstration
   =============================================================
   Entièrement fictif. Aucune ligne ne décrit une personne réelle : ni nom,
   ni santé, ni adresse, ni sommes constatées. C'est une exigence du dépôt,
   pas une précaution de style — voir la note en tête de `seed.js`.

   Ce fichier sert au premier lancement et après « Réinitialiser ». Il doit
   donc rester assez fourni pour que l'application se montre : plusieurs
   catégories, une charge partagée, et assez de mois pour qu'une moyenne et
   un graphique aient un sens.
   ============================================================= */

const EXPENSE_CATEGORIES = [
  'Courses', 'Restos', 'Imprévus', 'Abonnements',
  'Shopping', 'Voyages', 'Loisirs', 'Transport', 'Autres',
];

const SEED_BUDGET = {
  monthlyTarget: 1200,        // objectif : 1 200 € de dépenses max par mois
  categories: [...EXPENSE_CATEGORIES],   // colonnes du tableau, modifiables dans l'app

  /* Revenus fixes : la part sur laquelle on peut compter chaque mois. Un
     revenu variable se saisit à son plancher, le surplus se lit ensuite dans
     l'écart entre l'épargne théorique et la croissance réelle. */
  income: [
    { label: 'Salaire', amount: 2800 },
    { label: 'Part du colocataire', amount: 450 },
  ],

  /* Personnes avec qui des charges sont partagees. Ces parts sont
     indicatives : le budget deduit la charge en entier, et ce qu'elles
     versent figure dans les revenus.
     Un rôle, pas quelqu'un : le jeu de démonstration ne nomme personne. */
  contributors: [{ id: 'coloc', name: 'Colocataire' }],
  fixedCharges: [
    { label: 'Loyer (charges comprises)', amount: 900.00, shares: { coloc: 450.00 }, provider: 'Bailleur' },
    { label: 'Électricité et gaz',        amount: 110.00, shares: { coloc: 55.00 },  provider: 'Fournisseur énergie' },
    { label: 'Assurance habitation',      amount: 18.00,  shares: { coloc: 9.00 },   provider: 'Assureur' },
    { label: 'Internet',                  amount: 32.00,  shares: { coloc: 16.00 },  provider: 'Opérateur' },
    { label: 'Transports en commun',      amount: 88.00,  shares: {}, provider: 'Réseau régional' },
    { label: 'Forfait mobile',            amount: 15.00,  shares: {}, provider: 'Opérateur' },
    { label: 'Salle de sport',            amount: 29.00,  shares: {}, provider: 'Salle de quartier' },
    { label: 'Musique en ligne',          amount: 11.00,  shares: {}, provider: 'Service musical' },
    { label: 'Vidéo en ligne',            amount: 9.00,   shares: {}, provider: 'Service vidéo' },
    { label: 'Sauvegarde en ligne',       amount: 3.00,   shares: {}, provider: 'Hébergeur' },
  ],

  /* Lignes annuelles à repasser en revue une fois par an. Elles ne pèsent pas
     sur le budget mensuel, elles servent à ne pas les oublier. */
  toReview: [
    { label: 'Nom de domaine',   amount: 15, period: 'an', when: 'Mars',    note: 'À conserver' },
    { label: 'Antivirus',        amount: 60, period: 'an', when: 'Juin',    note: "Vérifier l'utilité avant renouvellement" },
    { label: 'Revue des abonnements', amount: 0, period: '', when: '',      note: 'Passer en revue tous les prélèvements annuels' },
  ],

  /* Achats récurrents dont le coût réel ne se voit qu'à l'année : une petite
     somme chaque semaine finit par peser autant qu'une charge fixe. */
  supplements: [
    { label: 'Café',           perDay: '2 tasses', perYear: '730 tasses', annual: 220.00 },
    { label: 'Pain',           perDay: '1 demi',   perYear: '365 demis',  annual: 240.00 },
    { label: 'Eau pétillante', perDay: '1 L',      perYear: '365 L',      annual: 180.00 },
  ],

  /* Dépenses mensuelles par catégorie. Les mois à venir restent vides : c'est
     ce qui déclenche le rappel de saisie et fait vivre la démonstration. */
  expenses: [
    { month: '2025-03-01', note: 'Premier mois suivi, tout n’est pas encore ventilé',
      v: { Courses: 280, Restos: 190, Transport: 40, Autres: 260 } },
    { month: '2025-04-01', note: 'Mois calme',
      v: { Courses: 305, Restos: 165, Abonnements: 60, Transport: 35, Autres: 120 } },
    { month: '2025-05-01', note: 'Week-end prolongé',
      v: { Courses: 290, Restos: 210, Voyages: 240, Transport: 30, Loisirs: 45 } },
    { month: '2025-06-01', note: 'Seul mois nettement sous objectif',
      v: { Courses: 265, Restos: 150, Abonnements: 60, Transport: 35 } },
    { month: '2025-07-01', note: 'Vacances : deux semaines hors de chez soi',
      v: { Courses: 210, Restos: 320, Voyages: 620, Loisirs: 90, Transport: 25 } },
    { month: '2025-08-01', note: 'Retour de vacances, rentrée à préparer',
      v: { Courses: 330, Restos: 180, Shopping: 240, Abonnements: 60, Transport: 40 } },
    { month: '2025-09-01', note: 'Renouvellement du matériel informatique',
      v: { Courses: 315, Restos: 195, Shopping: 480, Transport: 40, Loisirs: 35 } },
    { month: '2025-10-01', note: 'Réparation imprévue sur le vélo',
      v: { Courses: 300, Restos: 205, 'Imprévus': 180, Abonnements: 60, Transport: 40 } },
    { month: '2025-11-01', note: 'Achats anticipés pour les fêtes',
      v: { Courses: 340, Restos: 175, Shopping: 390, Transport: 35, Loisirs: 50 } },
    { month: '2025-12-01', note: 'Fêtes et déplacements en famille',
      v: { Courses: 380, Restos: 290, Shopping: 260, Voyages: 210, Loisirs: 60 } },

    { month: '2026-01-01', note: 'Reprise, mois volontairement sobre',
      v: { Courses: 285, Restos: 145, Abonnements: 60, Transport: 40 } },
    { month: '2026-02-01', note: 'Électroménager à remplacer',
      v: { Courses: 300, Restos: 170, 'Imprévus': 420, Transport: 40 } },
    { month: '2026-03-01', note: 'Mois lourd : caution et frais d’installation',
      v: { Courses: 320, Restos: 230, 'Imprévus': 640, Shopping: 130, Transport: 45 } },
    { month: '2026-04-01', note: 'Équipement de printemps',
      v: { Courses: 310, Restos: 215, Shopping: 350, Loisirs: 55, Transport: 40 } },
    { month: '2026-05-01', note: 'Voyage réservé à l’avance',
      v: { Courses: 295, Restos: 240, Voyages: 480, Abonnements: 60, Transport: 35 } },
    { month: '2026-06-01', note: 'Mois calme, gros réassort de courses',
      v: { Courses: 395, Restos: 185, Loisirs: 40, Transport: 40 } },
    { month: '2026-07-01', note: 'Vacances : le poste voyages porte presque tout',
      v: { Courses: 190, Restos: 260, Voyages: 870, Transport: 25 } },
    { month: '2026-08-01', note: 'Mois en cours, saisi au fil de l’eau',
      v: { Courses: 205, Restos: 145, Abonnements: 60, Transport: 35 } },
    { month: '2026-09-01', note: '', v: {} },
    { month: '2026-10-01', note: '', v: {} },
    { month: '2026-11-01', note: '', v: {} },
    { month: '2026-12-01', note: '', v: {} },
  ],
};
