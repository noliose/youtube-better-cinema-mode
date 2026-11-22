# Better Cinema Mode (YouTube)

Extension Chrome (Manifest V3) qui masque la barre de navigation de YouTube en mode cinéma,
avec un bouton dans le lecteur pour l'afficher ou la masquer.

- Bouton présent uniquement en mode cinéma, à droite de « Mode cinéma ».
- Choix mémorisé et synchronisé entre onglets ; navbar normale hors mode cinéma, en plein écran, sur l'accueil, en mini-lecteur.
- Lecteur agrandi à toute la hauteur ; « / » affiche la barre le temps d'une recherche, Échap la referme.

## Tester en local

1. `chrome://extensions` → activer le mode développeur.
2. « Charger l'extension non empaquetée » → choisir ce dossier.
3. Après une modification : « Recharger » l'extension, puis recharger les onglets YouTube.

## Publier une version

1. Augmenter `version` dans `manifest.json` (le store refuse une version déjà envoyée).
2. `./build.sh` → `dist/youtube-better-cinema-mode-<version>.zip`.
3. Commit, puis tag `v<version>`.
4. Envoyer le zip depuis le tableau de bord du Chrome Web Store.
