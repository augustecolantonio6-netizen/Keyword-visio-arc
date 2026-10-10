# Visio Keyword Alert

## Deux fenêtres, selon l'état

Avant détection, seule une petite fenêtre de transcription est ouverte. Elle contient les actions de capture et un panneau « Sous-titres en direct » repliable. Le panneau peut être développé puis passé en plein écran pour lire une longue transcription.

Lorsqu'un mot-clé est détecté :
1. Le service worker enregistre le contexte de l'événement.
2. Il ouvre d'abord une nouvelle fenêtre « Alerte + chat Gemini ».
3. Il ferme ensuite la fenêtre de transcription.
4. Il demande le focus de la fenêtre d'alerte à plusieurs reprises. Une notification Windows cliquable sert de recours si Arc/Windows empêche le focus automatique.

La fenêtre d'alerte contient le bandeau rouge, le contexte transcrit et le chat sur la même page. Le chat demande automatiquement une explication des notions et de la démarche de réflexion, puis reste disponible pour des questions supplémentaires.

## Transcription

L'audio capturé est converti en PCM mono 16 kHz et envoyé à Gemini Live Transcription par WebSocket. La connexion attend `setupComplete` avant d'envoyer les paquets audio. Les transcriptions provisoires et définitives sont affichées.

## Configuration

Mot/prénom, matière, clé API Gemini, modèle de réponse, langue audio et prompt de contexte sont configurables. Le modèle de réponse par défaut est `gemini-3.5-flash-lite`. La transcription utilise `gemini-3.5-transcribe-live`.

## Installation / mise à jour

1. Ouvre `arc://extensions`.
2. Active le mode développeur.
3. Charge le dossier qui contient `manifest.json`, ou remplace les fichiers du dossier local par ceux du dernier ZIP GitHub.
4. Clique sur « Recharger » dans la page des extensions.
5. Configure la clé API et le mot-clé.
6. Clique sur « Lancer l'extension sur la visio », puis sur « Choisir la fenêtre » et sélectionne la visioconférence avec son audio.

## Limites du focus Windows

L'extension crée la fenêtre d'alerte avec le focus demandé, ferme d'abord la fenêtre de transcription et réessaie ensuite d'activer la fenêtre d'alerte. Néanmoins, Windows/Arc peut refuser le vol de focus à une application en arrière-plan. Le recours intégré est de cliquer sur la notification Windows. Un mode garanti « toujours au-dessus » nécessiterait une application compagnon native Windows.
