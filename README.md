# 🌾 Songho - Jeu de semailles africain

Jeu de plateau de type *mancala* (semailles/awalé), jouable directement dans le navigateur en **HTML/CSS/JavaScript pur** — aucun backend de jeu, aucun build, aucune dépendance externe. Trois modes : **deux joueurs en local** (même écran), **contre une IA** (4 niveaux), et **en ligne à distance** (P2P, sans serveur).

---

## 🎯 Principe général

Chaque joueur possède **7 fosses** (14 au total) contenant chacune **5 graines** au départ (70 graines en jeu). Le but est de **capturer des graines** en semant intelligemment jusqu'à atteindre le score de victoire, ou avoir le plus de graines capturées lorsque la partie se termine.

- **Sud** (joueur 0) : fosses `S1` à `S7`
- **Nord** (joueur 1) : fosses `N1` à `N7`

---

## 📜 Règles (telles qu'implémentées dans le code)

### 1. Semer (sowing)

- **13 graines ou moins** dans la fosse jouée : semis **vers l'arrière, dans son propre camp** d'abord ; s'il reste des graines, la suite est semée **dans le camp adverse**, en bouclant si nécessaire.
- **Plus de 13 graines** : semis **en continu tout autour du plateau**. Si un tour complet est bouclé et qu'il reste des graines, la suite va uniquement dans le camp adverse.

### 2. Capturer

Une capture n'a lieu que si la **dernière graine tombe dans le camp adverse** :
- Fosse d'arrivée à **2, 3 ou 4 graines** vers capturée.
- La capture se **propage en chaîne** vers l'arrière tant que chaque fosse rencontrée est aussi entre 2 et 4 graines.
- Cas particulier : tour complet bouclé + dernière graine dans la toute première fosse adverse - une seule fosse capturée (pas de chaîne).

### 3. Coup interdit - famine

Un coup qui **viderait totalement le camp adverse** est refusé (message : *"Coup interdit : vous videriez le camp adverse !"*).

### 4. Règle de solidarité

Si le camp adverse est totalement vide avant qu'un joueur ne joue :
- S'il a **au moins 7 graines**, il doit automatiquement en **donner 7** à l'adversaire.
- Sinon, la partie s'arrête immédiatement en **match nul**.

### 5. Fin de partie

| Condition | Résultat |
|---|---|
| Un joueur atteint **40 graines capturées** | Il gagne |
| Le total de graines sur le plateau passe **sous 10** | Match nul |
| Règle de solidarité impossible à appliquer | Match nul |

---

## 🤖 Intelligence artificielle (mode solo)

| Niveau | Comportement |
|---|---|
| 🟢 Facile | Coup **aléatoire** parmi les coups valides |
| 🟡 Moyen | Coup qui **maximise la capture immédiate** (glouton) |
| 🔴 Difficile | **Minimax** + élagage alpha-bêta, profondeur 1 |
| ⚫ Expert | **Minimax** + élagage alpha-bêta, profondeur 2 |

Évaluation : `score déjà capturé + (graines du camp × 0,5)`. À cette profondeur, le calcul reste quasi instantané.

---

## 🌐 Mode en ligne (P2P, WebRTC)

Deux joueurs peuvent s'affronter à distance **sans compte, sans serveur de jeu et sans coût d'hébergement**, via une connexion directe entre les deux navigateurs (WebRTC + `RTCDataChannel`).

L'échange de connexion se fait **manuellement**, en copiant-collant deux codes techniques (offre / réponse) par n'importe quel canal (message, email...) :

1. **L'hôte** clique *"Créer une partie"* puis un code est généré puis il l'envoie à son adversaire.
2. **L'invité** clique *"Rejoindre une partie"*, colle le code reçu puis un code réponse est généré puis il le renvoie à l'hôte.
3. **L'hôte** colle ce code réponse et clique *"Connecter"*.
4. Une fois connectés, la partie démarre automatiquement des deux côtés : l'hôte joue **Sud**, l'invité joue **Nord**.

Chaque coup est envoyé à l'adversaire et rejoué avec la même logique déterministe côté récepteur, ce qui garantit que les deux plateaux restent synchronisés. "Rejouer" et "Quitter" sont eux aussi synchronisés.

> Un serveur STUN public gratuit (`stun.l.google.com`) aide à la traversée NAT. **Limite inhérente à une solution 100 % gratuite sans serveur** : sur un réseau très restrictif (NAT symétrique, pare-feu d'entreprise strict), la connexion peut échouer faute de serveur TURN - un avertissement est affiché dans la fenêtre de connexion. Sur un même réseau local (même Wi-Fi, même sans Internet), la connexion peut fonctionner sans STUN grâce aux adresses locales.

---

## ✨ Fonctionnalités

- **Plateau animé en 3D** avec graines qui apparaissent, se déplacent ("graine volante") et disparaissent lors des captures.
- **Sons synthétisés** (Web Audio API) : semis, capture, mélodie de victoire -activables/désactivables.
- **Thème clair / sombre**, mémorisé d'une session à l'autre.
- **Statistiques persistantes** (parties jouées, victoires solo/duo, matchs nuls, graines capturées, meilleur score), avec **export/import JSON** pour les transférer entre appareils.
- **Historique des coups** (20 derniers), repliable.
- **Mode en ligne P2P** (voir ci-dessus).
- Modales dédiées : **règles**, **palmarès**, **statistiques**, **paramètres**.
- **Écran de victoire** récapitulatif (scores, graines restantes, durée).

---

## 🎨 Identité visuelle

- Thème sombre vert forêt / or (variables CSS `--bg-deep`, `--gold`, `--green`, `--blue`, `--purple`...), avec un thème clair équivalent.
- **Accueil** : titre "SONGHO" en dégradé doré sous une couronne, 3 modes de jeu présentés en **cartes** (icône colorée + titre + sous-titre) plutôt qu'en simples boutons.
- **Écran de difficulté** : cartes avec icône, description et **notation en étoiles** (★☆☆☆  ★★★★), mise en évidence de la sélection active.
- **Écran de jeu** : cartes de score Sud/Nord avec pastille de tour, plateau 3D en fosses circulaires, barre d'état (mode, connexion en ligne).
- **Palmarès/statistiques** : trophée en en-tête, valeurs mises en évidence en doré.

---

## 🕹️ Prise en main

1. Sur l'accueil : **Deux joueurs**, **Jouer contre la machine** ou **En ligne (P2P)**.
2. En mode IA, choisir un niveau. En mode en ligne, suivre les 3 étapes d'échange de code.
3. Cliquer sur une fosse active de son propre camp pour jouer (les fosses non jouables sont grisées).
4. La partie se termine automatiquement selon les règles, avec écran de victoire ou match nul.

---

## 🗂️ Structure du projet

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des écrans (accueil, difficulté, jeu, connexion en ligne), styles CSS (thème, cartes, plateau 3D, animations, responsive) |
| `server.js` | Logique complète : état du plateau, règles (semis/capture/solidarité), IA (minimax), rendu, animations, sons, statistiques, connexion multijoueur P2P -malgré son nom, ce fichier s'exécute entièrement côté navigateur, ce n'est pas un serveur |

Fonctionne **sans backend ni build** : ouvrir `index.html` dans un navigateur suffit (les deux fichiers doivent rester dans le même dossier).

---

## 🌍 Déploiement (GitHub Pages)

1. Pousser `index.html` et `server.js` à la **racine** du dépôt (dépôt public).
2. `Settings` - `Pages` - Source : *Deploy from a branch* - branche `main`, dossier `/root` → `Save`.
3. Le site est servi à `https://<utilisateur>.github.io/<nom-du-dépôt>/` après 1 à 3 minutes.
4. Chaque `git push` sur `main` redéploie automatiquement.

> GitHub Pages sert toujours en HTTPS, ce qui convient bien au mode en ligne (WebRTC).

---

## 💾 Persistance des données

Statistiques et préférences stockées dans le `localStorage` du navigateur (`songhoStatsV3`, `songhoThemeV3`, `songhoSoundV3`) :
- Propres à chaque navigateur/appareil, effacées si le cache est vidé.
- Transférables manuellement via l'export/import JSON des statistiques.

---

## ⚙️ Prérequis techniques

Un navigateur moderne supportant Web Audio, `localStorage` et WebRTC (`RTCPeerConnection`/`RTCDataChannel`) - rien d'autre à installer.

---

## 🛠️ Historique des corrections

- **Bug de blocage du plateau (corrigé)** : dans `executeMove()`, le plateau était redessiné pendant que l'indicateur interne `isProcessing` était encore à `true`, ce qui désactivait visuellement toutes les fosses - et comme aucun second rendu ne suivait, le blocage était définitif. Concrètement : le premier joueur (Sud) jouait, puis plus personne ne pouvait cliquer, y compris en mode solo après le premier coup de l'IA. Corrigé en repassant `isProcessing` à `false` **avant** le redessin, avec un second rendu après la règle de solidarité pour que le don de graines soit visible immédiatement.
- **Refonte visuelle** : passage d'un thème brun à une palette vert forêt / or, accueil et écran de difficulté transformés en cartes avec icônes et descriptions, cartes de score plus lisibles en jeu, sans modification des règles, données ou fonctionnalités existantes.
- **Ajout du mode en ligne P2P** (WebRTC, signalisation manuelle par code copié-collé) et de **l'export/import des statistiques**, pour répondre aux limites d'une première version sans multijoueur à distance.

---

## ⚠️ Limites connues

- **Mode en ligne** : peut échouer sur des réseaux très restrictifs faute de serveur TURN. L'échange de code est manuel (pas de salon de jeu public ni de liste de parties).
- Les statistiques restent locales par défaut ; leur transfert entre appareils passe par l'export/import manuel du fichier JSON (pas de compte utilisateur).

