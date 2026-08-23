# BusMinute

Application monolithique de suivi BlaBlaCar Bus. Elle importe les horaires GTFS, lit le temps réel SIRI-Lite, associe chaque circulation à son trajet théorique et présente le résultat dans une interface web complète.

## Fonctionnalités

- recherche par numéro de bus, ville ou arrêt ;
- page de suivi avec horaires prévus, horaires constatés et retard par arrêt ;
- rafraîchissement automatique toutes les 30 secondes ;
- recherche par ville et gare, même sans circulation active ;
- pages de ville, gare, départ daté et liaison ;
- signalements voyageurs avec persistance PostgreSQL et repli en mémoire ;
- synchronisation GTFS quotidienne et SIRI-Lite chaque minute ;
- état temps réel courant et observations historiques conservés dans PostgreSQL ;
- historique de ponctualité par ligne et destination ;
- import GTFS depuis un dossier ou une archive ZIP ;
- parser SIRI-Lite `EstimatedTimetable` ;
- matcher explicable fondé sur le numéro de service, la date, la séquence d’arrêts et les horaires ;
- API JSON, données structurées, métadonnées sociales, sitemap dynamique et robots.txt ;
- cas d’intégration réel `50819:2026-08-22`.

Le projet n’utilise ni microservice, ni file de messages, ni cache distribué. Le site et le worker partagent le même code, la même image Docker et la même base PostgreSQL.

## Démarrage rapide

Prérequis : Node.js 22 ou ultérieur.

```powershell
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000), puis rechercher `50819`.

L’application tente de charger les flux officiels. Si ceux-ci sont indisponibles, elle utilise automatiquement l’extrait réel fourni dans `tests/fixtures`.

## Docker Compose

La stack de production contient le site BusMinute, son worker de synchronisation, une migration ponctuelle et PostgreSQL. Les migrations sont appliquées automatiquement avant le démarrage du site et du worker.

```powershell
Copy-Item .env.example .env
docker compose -f docker-compose.yaml -f compose.local.yaml up --build -d
```

Remplacer impérativement `POSTGRES_PASSWORD` dans `.env` avant le premier démarrage, puis ouvrir [http://localhost:3000](http://localhost:3000).

```powershell
docker compose -f docker-compose.yaml -f compose.local.yaml ps
docker compose -f docker-compose.yaml -f compose.local.yaml logs app
docker compose -f docker-compose.yaml -f compose.local.yaml logs worker
```

Arrêter la stack sans supprimer les données :

```powershell
docker compose -f docker-compose.yaml -f compose.local.yaml down
```

Le volume `busminute-postgres` conserve PostgreSQL entre les déploiements.

## Déploiement GitHub et Coolify

1. Créer un dépôt GitHub privé avec les fichiers du projet.
2. Dans Coolify, créer une application depuis ce dépôt et choisir le build pack Docker Compose.
3. Sélectionner `docker-compose.yaml` comme fichier de déploiement.
4. Définir `SITE_URL` avec le domaine HTTPS public et générer un `POSTGRES_PASSWORD` long.
5. Associer le domaine au service `app` sur le port `3000`.
6. Déployer puis vérifier `/api/health`.

Coolify utilise uniquement `docker-compose.yaml`. Le fichier `compose.local.yaml` sert au développement et ne doit pas être ajouté au déploiement Coolify.

Variables disponibles :

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `SITE_URL` | oui | origine HTTPS publique utilisée par les métadonnées |
| `POSTGRES_PASSWORD` | oui | secret PostgreSQL |
| `POSTGRES_DB` | non | base, `busminute` par défaut |
| `POSTGRES_USER` | non | utilisateur, `busminute` par défaut |
| `DATABASE_SSL` | non | `false` avec le PostgreSQL interne |
| `GTFS_URL` | non | source GTFS officielle |
| `SIRI_URL` | non | source SIRI-Lite officielle |
| `REALTIME_SYNC_INTERVAL_SECONDS` | non | fréquence SIRI, `60` par défaut |
| `GTFS_SYNC_INTERVAL_HOURS` | non | fréquence GTFS, `24` par défaut |
| `HISTORY_RETENTION_DAYS` | non | conservation des observations, `90` jours par défaut |
| `IMAGE_TAG` | non | étiquette locale de l’image Docker |

PostgreSQL n’est pas publié sur Internet. Seul le service `app` est exposé au proxy Coolify. Le contrôle `/api/health` vérifie la connexion à la base, le dernier cycle GTFS/SIRI et la fraîcheur de la donnée temps réel.

## Synchronisation et historique

Le worker applique le cycle suivant :

```text
GTFS quotidien
      ↓
horaires PostgreSQL
      ↓
SIRI-Lite chaque minute
      ↓
matching GTFS ↔ SIRI
      ↓
état courant + observations historiques
      ↓
pages et API BusMinute
```

`trip_stop_realtime` contient le dernier état connu de chaque arrêt. `trip_stop_observations` conserve les états successifs sans doublonner une même observation source. Les anciennes circulations restent accessibles par leur référence, même après leur disparition du flux officiel.

Lancer un seul cycle de synchronisation dans Docker :

```powershell
docker compose run --rm -e SYNC_ONCE=true worker
```

Lancer le worker directement avec un PostgreSQL configuré :

```powershell
npm run build:core
$env:SYNC_ONCE='true'
npm run worker
```

## Import PostgreSQL

Importer manuellement un GTFS complet dans une stack en fonctionnement :

```powershell
docker compose run --rm --volume C:/data:/data migration node dist/src/cli/import-gtfs.js /data/blablacar-gtfs.zip
```

## Pages et API

| Adresse | Rôle |
| --- | --- |
| `/` | accueil et recherche |
| `/recherche?q=50819` | résultats de recherche |
| `/suivi/50819%3A2026-08-22` | suivi détaillé d’une circulation |
| `/villes` | annuaire des villes et gares |
| `/ville/paris` | gares et bus d’une ville |
| `/departs/paris/2026-08-22` | départs d’une ville à une date donnée |
| `/gares/XPB` | prochains passages à un arrêt |
| `/trajets/XPB/XTO` | circulations entre deux arrêts |
| `/sources` | provenance et méthode |
| `/api/search?q=50819` | recherche JSON |
| `/api/journeys/50819%3A2026-08-22` | circulation JSON |
| `/api/reports` | lecture et création des signalements |
| `/api/health` | état du service et de PostgreSQL |

## Validation

```powershell
npm run check
```

Cette commande compile le cœur TypeScript en mode strict, exécute les tests puis produit le build Next.js de production.

Rejouer uniquement le matching réel :

```powershell
npm run match -- tests\fixtures\gtfs-50819 tests\fixtures\siri-50819-2026-08-22.json 50819:2026-08-22
```

Résultat attendu :

```json
{
  "status": "matched",
  "journeyRef": "50819:2026-08-22",
  "serviceNumber": "50819",
  "serviceDate": "2026-08-22",
  "tripId": "7672428505",
  "method": "SERVICE_NUMBER_DATE_STOP_SEQUENCE_TIMES",
  "stops": [
    "XPB",
    "XOS",
    "XTO"
  ]
}
```

## Matching

| Signal | Poids |
| --- | ---: |
| Numéro de service identique | 35 % |
| Service actif à la date SIRI | 20 % |
| Séquence d’arrêts | 30 % |
| Écart entre horaires GTFS et horaires SIRI visés | 15 % |

Les horaires GTFS sont interprétés dans `agency_timezone` et les valeurs supérieures à `24:00:00` sont acceptées. Un score insuffisant produit `unmatched`. Deux meilleurs candidats trop proches produisent `ambiguous`.

## Structure

```text
app/                 pages et API Next.js
components/          composants interactifs
Dockerfile           image autonome de production
docker-compose.yaml  stack Coolify et production
compose.local.yaml   ports réservés au développement local
src/application/     services destinés au front
src/cli/             migration, import et worker de synchronisation
src/providers/       importeur GTFS et parser SIRI
src/services/        matcher GTFS ↔ SIRI
src/db/              persistance PostgreSQL
migrations/          schéma PostgreSQL
tests/               tests et extrait réel 50819
public/              ressources publiques
.github/workflows/   validation GitHub automatique
```

## Données et licence

Les fixtures sont un extrait des ressources officielles BlaBlaCar Bus observées le 22 août 2026 :

- [jeu de données GTFS et SIRI-Lite](https://transport.data.gouv.fr/datasets/blablacar-bus-horaires-theoriques-et-temps-reel-du-reseau-europeen) ;
- [endpoint SIRI-Lite EstimatedTimetable](https://open-data.bus.blablacar.com/api/siri-lite/estimated-timetable).

L’extrait conserve les variantes calendaires du service 50819 ainsi que les appels `XPB → XOS → XTO` et leurs heures constatées. Les données source sont publiées sous ODbL. BusMinute est un projet indépendant de BlaBlaCar.
