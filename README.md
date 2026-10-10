# Visio Keyword Alert

## Fonctionnement

L'extension ouvre un tableau de bord unique depuis l'icône. Tu choisis explicitement la fenêtre ou l'onglet de visioconférence dans le sélecteur système et autorises le partage audio. Le tableau de bord affiche les sous-titres en direct, l'alerte et le chat Gemini sur la même page.

L'audio capturé est converti en PCM mono 16 kHz et envoyé à Gemini Live Transcription par WebSocket. La connexion attend `setupComplete` avant l'envoi des paquets audio. Les transcriptions provisoires et définitives sont affichées.

## Détection et chat

Le mot/prénom configuré est ajouté au vocabulaire de transcription. La détection vérifie les segments provisoires et définitifs avec un délai anti-répétition. Lorsqu'il est détecté, le tableau de bord revient au premier plan, affiche un bandeau d'alerte, capture une image et déclenche automatiquement une demande d'explication dans le chat pour aider à comprendre la question et les notions utiles. Le chat permet ensuite de poser d'autres questions par écrit ou à la voix.

Le retour automatique vise l'explication des notions et de la démarche de réflexion, pas une réponse à réciter.

## Configuration

Mot/prénom, matière, clé API Gemini, modèle de réponse, langue audio et prompt de contexte sont configurables. Le modèle de réponse par défaut est `gemini-3.5-flash-lite`. La transcription utilise `gemini-3.5-transcribe-live`.

## Enregistrement

Une option permet d'enregistrer le flux capturé en WebM. Le fichier est préparé lorsque la surveillance est arrêtée.

## Installation ou mise à jour locale

1. Ouvre `arc://extensions`.
2. Active le mode développeur.
3. Charge le dossier de l'extension, ou clique sur « Recharger » si elle est déjà installée.
4. Épingle l'icône.
5. Configure la clé API et le mot/prénom.
6. Clique sur « Lancer l'extension sur la visio ».
7. Dans le tableau de bord, clique sur « Choisir la fenêtre » et sélectionne la visio avec son audio.
8. Le tableau de bord se réduit pendant la surveillance et revient au premier plan lorsqu'un mot-clé est détecté.

## Interface et alertes

Le tableau de bord permet maintenant le défilement vertical de toute la page et le chat dispose de son propre défilement des messages. Lors d'une alerte, l'extension tente plusieurs fois de restaurer et focaliser sa fenêtre, puis fait défiler la page vers le bandeau. Les notifications Windows restent un recours si Arc ou Windows bloque le focus automatique.

## Limites

Le partage audio dépend des options proposées par Windows/Arc dans le sélecteur. Le tableau de bord est restauré et focalisé lors d'une alerte, mais l'API standard des fenêtres d'extension ne permet pas de garantir qu'il reste toujours au-dessus de toutes les applications, notamment en plein écran.
