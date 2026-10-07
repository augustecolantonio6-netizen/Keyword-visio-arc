# Visio Keyword Alert 0.2.0

Extension Manifest V3 pour Arc Windows.

## Cahier des charges couvert

- Icône dans la toolbar d'Arc.
- Fenêtre de settings.
- Choix du mot/prénom à repérer.
- Choix de la matière :
  Littérature anglaise BFI, Spécialité mathématiques, Histoire,
  Géographie, Philosophie, Maths expertes, Physique chimie, EMC.
- Clé API Gemini réglée une fois.
- Modèle Gemini réglable avec `gemini-3.5-flash-lite` par défaut.
- Prompt automatique modifiable.
- Variables de prompt `{{subject}}` et `{{question}}`.
- Lancement depuis la toolbar.
- Sélection de la fenêtre de visio.
- Surveillance de la fenêtre sélectionnée pendant qu'une autre fenêtre est active.
- Sous-titres quasi temps réel.
- Détection du mot/prénom dans la transcription.
- Gros popup rouge + notification Windows.
- Récupération de la dernière question détectée.
- Capture de la fenêtre de visio au moment du déclenchement.
- Envoi de la question et de la capture au modèle Gemini configuré.
- Ouverture d'un chat séparé avec le contexte déjà affiché.
- Possibilité d'envoyer d'autres questions au même chat.
- Saisie vocale dans le chat.
- Option d'enregistrer la fenêtre de visio en WebM.

## Installation

1. Décompresser le ZIP.
2. Dans Arc, ouvrir `arc://extensions`.
3. Activer le mode développeur.
4. Cliquer sur « Charger l'extension non empaquetée ».
5. Sélectionner le dossier `visio-keyword-alert-v0.2`.
6. Épingler l'extension dans la toolbar.
7. Ouvrir les réglages.
8. Entrer le mot/prénom, la matière, la clé API et le prompt.
9. Cliquer sur « Lancer l'extension sur la visio ».
10. Dans le sélecteur Windows, sélectionner la fenêtre de visio et autoriser l'audio système.

## Prompt par défaut

Je suis en terminale en cours de {{subject}} en visio.
Je n'ai pas écouté correctement le passage et le professeur vient de me poser cette question :
{{question}}

Réponds de façon humaine et brève pour m'aider à comprendre quoi répondre.
Pas de tirets. Pas de virgules. Pas de smiley.
Fais un petit texte compact.

## Important pour l'overlay

Une extension Chromium ne peut pas garantir un élément HTML constamment « always on top » au-dessus de TOUTES les applications Windows. Cette version combine donc une notification Windows avec une fenêtre popup très visible qui reprend le focus.

Pour un vrai overlay natif permanent au-dessus de toutes les applications, il faudrait compléter l'extension avec un petit composant Windows natif.

## Important pour la capture

`getDisplayMedia()` demande une autorisation utilisateur et permet de choisir une fenêtre ou un écran. La capture continue même si l'utilisateur change de fenêtre au premier plan.

## Enregistrement

Quand l'option est activée, le flux capturé est enregistré en WebM. À l'arrêt, l'extension affiche un lien local permettant de sauvegarder l'enregistrement.

## API

La clé API est stockée dans `chrome.storage.local`. Pour un projet distribué, mieux vaut passer par un serveur intermédiaire. Pour une utilisation locale, cette architecture évite d'avoir un serveur obligatoire.

## Note

Le prototype dépend du support par Arc/Chromium de la capture d'affichage et de la disponibilité des codecs audio/vidéo. L'autorisation « partager l'audio » est indispensable aux sous-titres.
