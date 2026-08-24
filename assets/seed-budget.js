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
  monthlyTarget: 1500,        // objectif : 1 500 € de dépenses max par mois
  categories: [...EXPENSE_CATEGORIES],   // colonnes du tableau, modifiables dans l'app

  income: [
    { label: 'Salary', amount: 2700 },
    { label: 'Flatmate’s share', amount: 450 },
  ],

  contributors: [{ id: 'coloc', name: 'Flatmate' }],
  fixedCharges: [
    /* Le loyer a cede la place a la mensualite : celui qui possede son
       logement n'en paie pas deux. La colocataire participe, pour la meme
       part qu'avant. `creditId` relie la charge au pret, et c'est la charge
       qui detient le montant — le credit le lit a travers elle. */
    { label: 'Mortgage', amount: 894.44, shares: { coloc: 450.00 },
      provider: 'Mortgage lender', creditId: 'd_pretAppart' },
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

  toReview: [
    { label: 'Domain name',   amount: 15, period: 'an', when: 'March',    note: 'Worth keeping' },
    { label: 'Antivirus',        amount: 60, period: 'an', when: 'June',    note: 'Check it is still useful before renewing' },
    { label: 'Subscription review', amount: 0, period: '', when: '',      note: 'Go through every yearly direct debit' },
  ],

  supplements: [
    { label: 'Coffee',        perDay: '2 cups',   perYear: '730 cups',   annual: 220.00 },
    { label: 'Bread',         perDay: 'half a loaf', perYear: '365 halves', annual: 240.00 },
    { label: 'Sparkling water', perDay: '1 L',    perYear: '365 L',      annual: 180.00 },
  ],

  expenses: [
    { month: '2025-03-01', note: 'First month tracked, not everything is split out yet',
      v: { Groceries: 355, Dining: 240, Transport: 50, Other: 330 } },
    { month: '2025-04-01', note: 'Quiet month',
      v: { Groceries: 385, Dining: 210, Subscriptions: 75, Transport: 45, Other: 150 } },
    { month: '2025-05-01', note: 'Long weekend',
      v: { Groceries: 370, Dining: 265, Travel: 305, Transport: 40, Leisure: 55 } },
    { month: '2025-06-01', note: 'A quiet month, well under target',
      v: { Groceries: 335, Dining: 190, Subscriptions: 75, Transport: 45 } },
    { month: '2025-07-01', note: 'Holidays: two weeks away from home',
      v: { Groceries: 265, Dining: 405, Travel: 785, Leisure: 115, Transport: 30 } },
    { month: '2025-08-01', note: 'Back from holidays, autumn to get ready for',
      v: { Groceries: 420, Dining: 230, Shopping: 305, Subscriptions: 75, Transport: 50 } },
    { month: '2025-09-01', note: 'Computer gear replaced',
      v: { Groceries: 400, Dining: 250, Shopping: 610, Transport: 50, Leisure: 45 } },
    { month: '2025-10-01', note: 'Unexpected bike repair',
      v: { Groceries: 380, Dining: 260, 'Unexpected': 230, Subscriptions: 75, Transport: 50 } },
    { month: '2025-11-01', note: 'Christmas shopping done early',
      v: { Groceries: 430, Dining: 220, Shopping: 495, Transport: 45, Leisure: 65 } },
    { month: '2025-12-01', note: 'Festive season and family travel',
      v: { Groceries: 485, Dining: 370, Shopping: 330, Travel: 265, Leisure: 75 } },

    { month: '2026-01-01', note: 'Back on track, a deliberately lean month',
      v: { Groceries: 360, Dining: 185, Subscriptions: 75, Transport: 50 } },
    { month: '2026-02-01', note: 'Kitchen appliance to replace',
      v: { Groceries: 380, Dining: 215, 'Unexpected': 535, Transport: 50 } },
    { month: '2026-03-01', note: 'Heavy month: deposit and moving-in costs',
      v: { Groceries: 405, Dining: 290, 'Unexpected': 815, Shopping: 165, Transport: 55 } },
    { month: '2026-04-01', note: 'Spring kit',
      v: { Groceries: 395, Dining: 275, Shopping: 445, Leisure: 70, Transport: 50 } },
    { month: '2026-05-01', note: 'Trip booked in advance',
      v: { Groceries: 375, Dining: 305, Travel: 610, Subscriptions: 75, Transport: 45 } },
    { month: '2026-06-01', note: 'Quiet month, a big grocery restock',
      v: { Groceries: 500, Dining: 235, Leisure: 50, Transport: 50 } },
    { month: '2026-07-01', note: 'Holidays: the travel line carries almost all of it',
      v: { Groceries: 240, Dining: 330, Travel: 1105, Transport: 30 } },
    { month: '2026-08-01', note: 'Current month, entered as it goes',
      v: { Groceries: 260, Dining: 185, Subscriptions: 75, Transport: 45 } },
    { month: '2026-09-01', note: '', v: {} },
    { month: '2026-10-01', note: '', v: {} },
    { month: '2026-11-01', note: '', v: {} },
    { month: '2026-12-01', note: '', v: {} },
  ],
};
