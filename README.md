#  Songho - Jeu de semailles africain

Jeu de plateau de type *mancala* (semailles/awalé), jouable dans le navigateur en **HTML/CSS/JavaScript pur**, sans backend de jeu ni build. Trois modes : joueur contre joueur en local (même écran), joueur contre une IA à 4 niveaux de difficulté, et **joueur contre joueur en ligne (P2P, WebRTC)**.


## Principe général

Chaque joueur possède **7 fosses** (14 au total) contenant chacune **5 graines** au départ (70 graines en jeu). Le but est de **capturer des graines** en semant intelligemment jusqu'à atteindre le score de victoire, ou avoir le plus de graines capturées lorsque la partie se termine.

- **Sud** (joueur 0) : fosses `S1` à `S7`
- **Nord** (joueur 1) : fosses `N1` à `N7`


##  Règles (telles qu'implémentées dans le code)

### 1. Semer (sowing)

Quand un joueur joue une fosse :

- **Si la fosse contient 13 graines ou moins** : les graines sont d'abord semées **vers l'arrière, dans son propre camp** (des indices décroissants, jusqu'à sa première fosse). S'il reste des graines après avoir atteint le début de son camp, la suite est semée **dans le camp adverse**, en tournant en boucle si nécessaire.
- **Si la fosse contient plus de 13 graines** : les graines sont semées **en continu tout autour du plateau** (case par case). Si un tour complet est bouclé et qu'il reste des graines, la suite est déposée uniquement dans le camp adverse.

### 2. Capturer

Une capture n'a lieu que si la **dernière graine semée tombe dans le camp adverse** :

- Si la fosse d'arrivée contient alors **2, 3 ou 4 graines**, son contenu est capturé.
- La capture se **propage en chaîne** vers l'arrière (fosse précédente dans le camp adverse) tant que chaque fosse rencontrée contient également 2, 3 ou 4 graines.
- Cas particulier : si un tour complet du plateau a été bouclé (semis de plus de 13 graines) et que la dernière graine tombe exactement dans la première fosse adverse, une seule fosse est capturée (pas de chaîne).

### 3. Coup interdit - famine

Un coup qui **viderait complètement le camp adverse** (0 graine dans ses 7 fosses après le coup) est **refusé** : le joueur doit choisir un autre coup. Un message *"Coup interdit : vous videriez le camp adverse !"* s'affiche.

### 4. Règle de solidarité

Si, **avant qu'un joueur ne joue**, le camp adverse est totalement vide :

- Si le joueur courant possède **au moins 7 graines** dans son camp, il doit automatiquement en **donner 7 à l'adversaire** (première fosse de son camp) avant de pouvoir continuer à jouer normalement.
- S'il n'a **pas assez de graines** pour donner ce cadeau de solidarité, la partie s'arrête immédiatement sur un **match nul**.

### 5. Fin de partie

La partie se termine dans l'un des cas suivants :

| Condition | Résultat |
|---|---|
| Un joueur atteint **40 graines capturées** | Il remporte la partie |
| Le total de graines encore sur le plateau passe **sous 10** | Match nul |
| La règle de solidarité ne peut pas être appliquée (camp adverse vide et donateur en dessous de 7 graines) | Match nul |


##  Intelligence artificielle (mode solo)

4 niveaux de difficulté, sélectionnables avant la partie :

| Niveau | Comportement |
|---|---|
|  Facile | Coup choisi **au hasard** parmi les coups valides |
|  Moyen | Choisit le coup qui **maximise la capture immédiate** (glouton, sans anticipation) |
|  Difficile | **Minimax** avec élagage alpha-bêta, profondeur 1 |
|  Expert | **Minimax** avec élagage alpha-bêta, profondeur 2 |

La fonction d'évaluation combine le score déjà capturé et la moitié du nombre de graines encore présentes dans le camp du joueur évalué (`score + graines_du_camp × 0,5`). À cette profondeur (2, avec au plus 7 coups possibles par niveau), le calcul reste quasi instantané — pas besoin de table de transposition.


## Mode en ligne (P2P, WebRTC)

Le mode **"En ligne (P2P)"** permet à deux joueurs de s'affronter à distance, **sans compte, sans serveur de jeu et sans coût d'hébergement**, via une connexion directe entre les deux navigateurs (WebRTC + `RTCDataChannel`).

Comme il n'y a pas de serveur de signalisation, l'échange de connexion se fait **manuellement**, en copiant-collant deux courts codes techniques (offre / réponse) entre les deux joueurs, par n'importe quel canal (message, email...) :

1. **L'hôte** clique sur *"Créer une partie"* → un code est généré → il l'envoie à son adversaire.
2. **L'invité** clique sur *"Rejoindre une partie"*, colle le code reçu → un code réponse est généré → il le renvoie à l'hôte.
3. **L'hôte** colle ce code réponse et clique sur *"Connecter"*.
4. Une fois la connexion établie, la partie démarre automatiquement des deux côtés : l'hôte joue **Sud**, l'invité joue **Nord**.

Chaque coup joué est envoyé à l'adversaire et rejoué de son côté avec exactement la même logique déterministe (semis, capture, solidarité), ce qui garantit que les deux plateaux restent synchronisés. "Rejouer" et "Quitter" sont également synchronisés entre les deux joueurs.

> Une connexion `stun:stun.l.google.com:19302` (public, gratuit) est utilisée pour aider à la traversée NAT. **Limite inhérente à une solution 100 % gratuite sans serveur** : sur un réseau très restrictif (NAT symétrique, pare-feu d'entreprise strict), la connexion directe peut échouer faute de serveur de relais TURN — un message d'avertissement à ce sujet est affiché dans la fenêtre de connexion.


##  Fonctionnalités

- **Plateau animé en 3D** (CSS `perspective`/`transform`) avec graines qui apparaissent, se déplacent (animation "graine volante") et disparaissent visuellement lors des captures.
- **Sons synthétisés** via l'API Web Audio (semis, capture, mélodie de victoire) — activables/désactivables dans les paramètres.
- **Thème clair / sombre**, mémorisé d'une session à l'autre.
- **Statistiques persistantes** (parties jouées, victoires solo/duo, matchs nuls, total de graines capturées, meilleur score) sauvegardées en local, avec **export/import au format JSON** pour les transférer d'un appareil ou d'un navigateur à un autre (bouton dans la fenêtre Statistiques).
- **Historique des coups** (20 derniers coups), consultable dans un panneau repliable.
- **Mode en ligne P2P** (voir section dédiée ci-dessus).
- **Écran de règles**, **palmarès**, **statistiques** et **paramètres** accessibles via des modales dédiées.
- **Écran de victoire** récapitulatif (scores finaux, graines restantes, durée de la partie).


## Prise en main

1. Sur l'écran d'accueil, choisir **⚔️ Affronter l'IA**, ** Deux joueurs (local)** ou ** En ligne (P2P)**.
2. En mode IA, sélectionner un niveau de difficulté (Facile → Expert). En mode local, la partie démarre directement. En mode en ligne, suivre les 3 étapes d'échange de code décrites plus haut.
3. Cliquer sur une fosse **active** de son propre camp pour y jouer (les fosses non jouables — camp adverse, fosse vide, tour de l'autre joueur, ou partie en ligne non encore connectée — sont grisées et désactivées).
4. Suivre le déroulement du semis à l'écran ; les captures sont signalées par un effet visuel et sonore.
5. La partie se termine automatiquement selon les règles ci-dessus, avec affichage d'un écran de victoire ou de match nul.


##  Structure du projet

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des écrans (accueil, difficulté, jeu, connexion en ligne) et des modales, styles CSS intégrés (plateau 3D, thèmes, animations, responsive) |
| `server.js` | Logique complète du jeu : état du plateau, règles de semis/capture/solidarité, IA (minimax), rendu du plateau, animations, sons, statistiques, **et connexion multijoueur P2P (WebRTC)** — malgré son nom, ce fichier s'exécute entièrement côté navigateur, ce n'est pas un serveur |

Le tout fonctionne **sans backend ni build** : il suffit d'ouvrir `index.html` dans un navigateur (les deux fichiers doivent rester dans le même dossier).


##  Persistance des données

Les statistiques et préférences (thème, son) sont stockées dans le **`localStorage`** du navigateur sous les clés `songhoStatsV3`, `songhoThemeV3` et `songhoSoundV3` :

- Propres à **chaque navigateur/appareil**.
- Effacées si le cache du navigateur est vidé.
- **Transférables manuellement** entre appareils via le bouton d'export/import JSON dans la fenêtre Statistiques.


##  Prérequis techniques

- Un navigateur moderne supportant l'API Web Audio (sons), `localStorage` (statistiques/préférences) et **WebRTC** (`RTCPeerConnection`/`RTCDataChannel`, pour le mode en ligne) — aucune installation ni dépendance externe requise.


## Limites connues

- **Mode en ligne** : fonctionne de navigateur à navigateur sans serveur, mais peut échouer sur certains réseaux très restrictifs faute de serveur TURN (voir section dédiée). L'échange de code de connexion est manuel (pas de salon de jeu automatique ni de liste de parties publiques).
- Les statistiques restent locales par défaut ; leur synchronisation entre appareils nécessite l'export/import manuel du fichier JSON (pas de compte utilisateur ni de synchronisation automatique).
