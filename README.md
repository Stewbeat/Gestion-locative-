# Gestion locative — LMNP réel

Application de suivi de location meublée (quittances, versements, charges déductibles,
calendrier fiscal, exports 2033-B / FEC). Frontend **React + Vite**, données dans
**Supabase** (Postgres + authentification), hébergement gratuit sur **GitHub Pages**.

---

## 1. Tester en local (5 min)

Prérequis : [Node.js](https://nodejs.org) 18 ou plus.

```bash
npm install
cp .env.example .env      # puis renseigne tes valeurs Supabase (étape 2)
npm run dev               # ouvre http://localhost:5173
```

## 2. Créer le projet Supabase

1. Sur [supabase.com](https://supabase.com), crée un projet — **choisis une région UE**
   (Frankfurt ou Paris), plus confortable côté RGPD.
2. Menu **SQL Editor → New query** : colle le contenu de `supabase-schema.sql` et clique **Run**.
   (Crée la table `app_state` et les règles RLS.)
3. Menu **Project Settings → API** : copie **Project URL** et la clé **anon public**.
4. Colle-les dans ton fichier `.env` :

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```

   > La clé `anon` est **publique par nature** : elle finit dans le code du site, c'est prévu.
   > La sécurité est assurée par le RLS. Ne mets **jamais** la clé `service_role` ici.

5. L'authentification par e-mail (lien magique) est active par défaut. Dans
   **Authentication → URL Configuration**, ajoute tes URLs autorisées :
   - `http://localhost:5173` (dev)
   - l'URL de ton site GitHub Pages (étape 3), en **Site URL** et **Redirect URLs**.

## 3. Mettre en ligne sur GitHub Pages

1. Crée un dépôt GitHub (public — nécessaire pour Pages en gratuit ; sans risque,
   le front ne contient que la clé anon) et pousse le projet :

   ```bash
   git init && git add . && git commit -m "Gestion locative"
   git branch -M main
   git remote add origin https://github.com/<toi>/<depot>.git
   git push -u origin main
   ```

2. **Settings → Secrets and variables → Actions → onglet _Variables_** : ajoute
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. **Settings → Pages → Build and deployment → Source : GitHub Actions**.

4. Le workflow `.github/workflows/deploy.yml` construit et publie le site à chaque
   `git push`. L'URL apparaît dans **Settings → Pages** (`https://<toi>.github.io/<depot>/`).

5. Reviens dans Supabase (**Authentication → URL Configuration**) et ajoute cette URL
   en **Site URL** et **Redirect URLs**, sinon le lien de connexion ne reviendra pas au bon endroit.

---

## Points à connaître

- **Mise en pause Supabase (gratuit)** : un projet sans activité pendant 7 jours est
  mis en pause ; il se réveille en ~30 s à la première requête. Pour l'éviter, un ping
  régulier (ex. Uptime Robot) suffit.
- **Synchro multi-appareils** : tes données sont dans Supabase, donc partagées entre
  téléphone et postes une fois connecté au même compte e-mail.
- **Sauvegarde** : le plan gratuit n'a pas de backup automatique. Utilise les exports
  CSV / FEC de l'app comme sauvegarde, ou passe au plan Pro pour les backups quotidiens.
- **Données personnelles** : l'app stocke des données du locataire (nom, montants).
  Héberge la base en UE et garde à l'esprit tes obligations RGPD de responsable de traitement.

## Structure

```
├─ index.html               entrée Vite
├─ vite.config.js           base relative (compatible Pages)
├─ supabase-schema.sql      tables + RLS à exécuter dans Supabase
├─ .env.example             modèle de configuration
├─ .github/workflows/       déploiement automatique GitHub Pages
└─ src/
   ├─ main.jsx              point d'entrée + porte d'authentification
   ├─ Auth.jsx              écran de connexion (lien magique)
   ├─ supabaseClient.js     initialise le client Supabase
   ├─ store.js              persistance (get/set) adossée à Supabase
   └─ App.jsx               l'application (identique à la version Claude)
```
