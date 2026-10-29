# Suivi — gestion des tâches

Interface Angular 21 pour le suivi des tâches d’une administration. Elle propose
un espace de travail adapté au rôle de l’utilisateur : administration, chef de
service ou agent. L’interface s’adapte aux mobiles, tablettes et ordinateurs.

## Démarrage local

Dans le terminal XAMPP, démarrer MySQL et vérifier que la base `gestion_taches`
est accessible. Configurer au besoin les identifiants dans le `.env` du projet
Laravel.

Dans un premier terminal, lancer l’API :

```powershell
cd "C:\Users\hp\Documents\Projet\Gestion de projet\mon-projet-laravel"
php artisan serve --host=127.0.0.1 --port=8000
```

Dans un second terminal, lancer Angular :

```powershell
cd "C:\Users\hp\Documents\Projet\Gestion de projet\mon-projet-angular"
npm start
```

Ouvrir ensuite <http://localhost:4200>. Le serveur de développement Angular
transmet automatiquement les requêtes `/api` à Laravel via `proxy.conf.json`.

Créer le compte d’administration avec la commande Laravel
`php artisan app:create-administrator`. Les utilisateurs suivants peuvent
demander un accès depuis l’écran d’inscription ; un administrateur doit valider
leur profil avant leur première connexion.

Les divisions sont créées et gérées par l’administration IT. Les demandes agent
choisissent une division existante ; le service et la division sont affectés depuis
ce référentiel. Dans l’administration, les profils sont filtrables par rôle, les
chefs peuvent consulter leurs agents, et les comptes peuvent être suspendus puis
réactivés sans supprimer leur historique. Le DG conserve un annuaire en lecture
seule, organisé par service et division. Les espaces
Directeur général, chef de service, chef de division et agent appliquent des
droits distincts. Le Directeur général dispose d’une vue de toute l’organisation,
d’un annuaire des responsables et agents, et peut affecter et examiner les
tâches de tous les services. Le destinataire démarre la tâche avant de pouvoir
l’envoyer pour validation. Le rôle d’administration reste distinct du DG.
Les trois adresses de direction sont réservées et ne peuvent pas être modifiées
via l’administration des profils.

L’administrateur IT peut créer un rôle depuis le bouton « Ajouter un rôle »,
placé sous « Organisation et profils » dans le menu latéral. Il choisit le rôle
au-dessus duquel insérer le nouveau rôle ; celui-ci en hérite les capacités et
son périmètre de supervision. Le nouveau rôle est ensuite disponible dans le
formulaire d’ajout et de modification des profils.

## Workflow des tâches

Le tableau de bord présente le volume de tâches par statut, les retards à venir
et les éléments à valider selon le rôle de l’utilisateur. Le DG peut consulter
l’annuaire actif de l’organisation et rechercher/filtrer les tâches par état et
mot-clé.

Les tâches suivent un cycle de vie complet : assignation, démarrage, soumission,
révision, validation et clôture. Le destinataire démarre la tâche, ce qui notifie
la personne qui l’a affectée. Les commentaires de suivi notifient aussi le DG.
Le responsable créateur ou le DG peut accepter une soumission, demander une
reprise ou rejeter la tâche.

Le menu du compte en haut à droite donne accès au profil et à la déconnexion.
Le profil permet de modifier le nom, la photo et le mot de passe ; l’adresse
e-mail y reste en lecture seule.

## Vérification

```powershell
npm run build
npx ng test --watch=false
```

Pour la configuration de la base, le schéma et les tests de l’API, consulter le
[guide Laravel](../mon-projet-laravel/README.md).

## Rôles et droits d’accès

L’accès aux pages dépend du **rôle** de l’utilisateur (règles centralisées dans
`src/app/core/access.ts`, vérifiées par le menu et par `authGuard`). Le statut
du profil n’intervient plus dans la navigation : les comptes sont créés par
l’administrateur et la création de compte publique est supprimée.

| Page | Administrateur IT | DG | Chef de service | Chef de division | Agent |
| --- | :-: | :-: | :-: | :-: | :-: |
| Tableau de bord, Tâches, Mon profil | ✔ | ✔ | ✔ | ✔ | ✔ |
| Équipe | ✔ | ✔ | – | – | – |
| Journal d’audit | ✔ | ✔ | – | – | – |
| Organisation et profils, Paramètres | ✔ | – | – | – | – |

Un profil peut aussi recevoir une liste de pages autorisées (`allowed_pages`)
définie par l’administrateur.

## Interface

- Gabarit d’administration : barre latérale fixe avec en-tête de marque, menu par
  sections, barre supérieure (titre de page, thème clair/sombre, notifications,
  profil) et pied de page.
- Responsive : menu en tiroir sous 1024 px, tableaux transformés en cartes sous
  720 px, aucun défilement horizontal de 320 px à 1920 px.
- Composants communs `ui-*` dans `src/styles.scss`, icônes SVG dans
  `src/app/shared/icon.ts`, police Poppins hébergée dans `public/assets/fonts`.
- Déconnexion automatique après 30 minutes d’inactivité (avertissement 5
  minutes avant), constante `IDLE_LIMIT_MS` dans `app-shell.ts`.

## Fonctionnalités ajoutées pour le cahier des charges

- Priorité des tâches (création, modification, filtre, badges).
- Statut « En retard » (badge, filtre, indicateur du tableau de bord).
- Demande de report de date limite et décision du donneur d’ordre.
- Export des tâches filtrées au format CSV (Excel).
- Journal d’audit (administrateur et DG) avec recherche et valeurs modifiées.
- Tableau de bord : retards, répartition par statut et par priorité.

## Vérification

```powershell
npm install
npm run build
npm test
```
