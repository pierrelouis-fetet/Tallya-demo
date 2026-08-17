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
  'Groceries', 'Dining', 'Unexpected', 'Subscriptions',
  'Shopping', 'Travel', 'Leisure', 'Transport', 'Other',
];

const SEED_BUDGET = {
  monthlyTarget: 1200,        // objectif : 1 200 € de dépenses max par mois
  categories: [...EXPENSE_CATEGORIES],   // colonnes du tableau, modifiables dans l'app

  /* Revenus fixes : la part sur laquelle on peut compter chaque mois. Un
     revenu variable se saisit à son plancher, le surplus se lit ensuite dans
     l'écart entre l'épargne théorique et la croissance réelle. */
  income: [
    { label: 'Salary', amount: 3400 },
    { label: 'Flatmate’s share', amount: 450 },
  ],

  /* Personnes avec qui des charges sont partagees. Ces parts sont
     indicatives : le budget deduit la charge en entier, et ce qu'elles
     versent figure dans les revenus.
     Un rôle, pas quelqu'un : le jeu de démonstration ne nomme personne. */
  contributors: [{ id: 'coloc', name: 'Flatmate' }],
  fixedCharges: [
    { label: 'Rent (bills included)', amount: 900.00, shares: { coloc: 450.00 }, provider: 'Landlord' },
    { label: 'Electricity and gas',        amount: 110.00, shares: { coloc: 55.00 },  provider: 'Energy supplier' },
    { label: 'Home insurance',      amount: 18.00,  shares: { coloc: 9.00 },   provider: 'Insurer' },
    { label: 'Internet',                  amount: 32.00,  shares: { coloc: 16.00 },  provider: 'Telecom operator' },
    { label: 'Public transport',      amount: 88.00,  shares: {}, provider: 'Regional network' },
    { label: 'Mobile plan',            amount: 15.00,  shares: {}, provider: 'Telecom operator' },
    { label: 'Gym',            amount: 29.00,  shares: {}, provider: 'Local gym' },
    { label: 'Music streaming',          amount: 11.00,  shares: {}, provider: 'Music service' },
    { label: 'Video streaming',            amount: 9.00,   shares: {}, provider: 'Video service' },
    { label: 'Online backup',       amount: 3.00,   shares: {}, provider: 'Hosting provider' },
  ],

  /* Lignes annuelles à repasser en revue une fois par an. Elles ne pèsent pas
     sur le budget mensuel, elles servent à ne pas les oublier. */
  toReview: [
    { label: 'Domain name',   amount: 15, period: 'an', when: 'March',    note: 'Worth keeping' },
    { label: 'Antivirus',        amount: 60, period: 'an', when: 'June',    note: 'Check it is still useful before renewing' },
    { label: 'Subscription review', amount: 0, period: '', when: '',      note: 'Go through every yearly direct debit' },
  ],

  /* Achats récurrents dont le coût réel ne se voit qu'à l'année : une petite
     somme chaque semaine finit par peser autant qu'une charge fixe. */
  supplements: [
    { label: 'Coffee',        perDay: '2 cups',   perYear: '730 cups',   annual: 220.00 },
    { label: 'Bread',         perDay: 'half a loaf', perYear: '365 halves', annual: 240.00 },
    { label: 'Sparkling water', perDay: '1 L',    perYear: '365 L',      annual: 180.00 },
  ],

  /* Dépenses mensuelles par catégorie. Les mois à venir restent vides : c'est
     ce qui déclenche le rappel de saisie et fait vivre la démonstration. */
  expenses: [
    { month: '2025-03-01', note: 'First month tracked, not everything is split out yet',
      v: { Groceries: 280, Dining: 190, Transport: 40, Other: 260 } },
    { month: '2025-04-01', note: 'Quiet month',
      v: { Groceries: 305, Dining: 165, Subscriptions: 60, Transport: 35, Other: 120 } },
    { month: '2025-05-01', note: 'Long weekend',
      v: { Groceries: 290, Dining: 210, Travel: 240, Transport: 30, Leisure: 45 } },
    { month: '2025-06-01', note: 'The only month clearly under target',
      v: { Groceries: 265, Dining: 150, Subscriptions: 60, Transport: 35 } },
    { month: '2025-07-01', note: 'Holidays: two weeks away from home',
      v: { Groceries: 210, Dining: 320, Travel: 620, Leisure: 90, Transport: 25 } },
    { month: '2025-08-01', note: 'Back from holidays, autumn to get ready for',
      v: { Groceries: 330, Dining: 180, Shopping: 240, Subscriptions: 60, Transport: 40 } },
    { month: '2025-09-01', note: 'Computer gear replaced',
      v: { Groceries: 315, Dining: 195, Shopping: 480, Transport: 40, Leisure: 35 } },
    { month: '2025-10-01', note: 'Unexpected bike repair',
      v: { Groceries: 300, Dining: 205, 'Unexpected': 180, Subscriptions: 60, Transport: 40 } },
    { month: '2025-11-01', note: 'Christmas shopping done early',
      v: { Groceries: 340, Dining: 175, Shopping: 390, Transport: 35, Leisure: 50 } },
    { month: '2025-12-01', note: 'Festive season and family travel',
      v: { Groceries: 380, Dining: 290, Shopping: 260, Travel: 210, Leisure: 60 } },

    { month: '2026-01-01', note: 'Back on track, a deliberately lean month',
      v: { Groceries: 285, Dining: 145, Subscriptions: 60, Transport: 40 } },
    { month: '2026-02-01', note: 'Kitchen appliance to replace',
      v: { Groceries: 300, Dining: 170, 'Unexpected': 420, Transport: 40 } },
    { month: '2026-03-01', note: 'Heavy month: deposit and moving-in costs',
      v: { Groceries: 320, Dining: 230, 'Unexpected': 640, Shopping: 130, Transport: 45 } },
    { month: '2026-04-01', note: 'Spring kit',
      v: { Groceries: 310, Dining: 215, Shopping: 350, Leisure: 55, Transport: 40 } },
    { month: '2026-05-01', note: 'Trip booked in advance',
      v: { Groceries: 295, Dining: 240, Travel: 480, Subscriptions: 60, Transport: 35 } },
    { month: '2026-06-01', note: 'Quiet month, a big grocery restock',
      v: { Groceries: 395, Dining: 185, Leisure: 40, Transport: 40 } },
    { month: '2026-07-01', note: 'Holidays: the travel line carries almost all of it',
      v: { Groceries: 190, Dining: 260, Travel: 870, Transport: 25 } },
    { month: '2026-08-01', note: 'Current month, entered as it goes',
      v: { Groceries: 205, Dining: 145, Subscriptions: 60, Transport: 35 } },
    { month: '2026-09-01', note: '', v: {} },
    { month: '2026-10-01', note: '', v: {} },
    { month: '2026-11-01', note: '', v: {} },
    { month: '2026-12-01', note: '', v: {} },
  ],
};
