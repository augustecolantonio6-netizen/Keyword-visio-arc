# Visio Keyword Alert

## Fenêtre de transcription

Avant détection, une petite fenêtre de transcription reste ouverte. Elle contient les commandes de capture et un panneau « Sous-titres en direct » repliable, avec un bouton plein écran. Le bouton « Télécharger .txt » exporte tous les segments définitifs de la session en UTF-8, même si la zone visible n'affiche que les derniers segments.

La transcription complète est conservée dans `chrome.storage.local` pendant la session et peut être téléchargée après l'arrêt ou le rechargement de la page.

## Détection des mots-clés

Pour limiter les fausses alertes :
- la détection est faite sur les segments définitifs de transcription, pas sur les hypothèses provisoires ;
- le mot-clé doit être présent comme mot ou expression complète, pas comme sous-chaîne d'un mot plus long ;
- le texte historique qui précède le segment courant ne déclenche plus une alerte à lui seul.

Comme toute transcription automatique, la reconnaissance vocale peut parfois mal entendre un mot. Le bouton « Fausse alerte — fermer cette fenêtre » ferme uniquement la fenêtre alerte + chat ; il ne stoppe pas la capture audio ni la transcription.

## Fenêtre d'alerte et chat

Lorsqu'un mot-clé est détecté, une fenêtre « Alerte + chat Gemini » s'ouvre. La fenêtre de transcription reste ouverte en arrière-plan et continue à fonctionner. Le service worker demande plusieurs fois le focus de la fenêtre d'alerte, et une notification Windows cliquable sert de recours si Arc/Windows ne permet pas de basculer automatiquement au premier plan.

La fenêtre d'alerte contient un bandeau rouge, le contexte récent transcrit et le chat Gemini. Le chat demande automatiquement une explication des notions et de la démarche de réflexion, puis reste disponible pour des questions supplémentaires.

## Transcription technique

L'audio capturé est converti en PCM mono 16 kHz et envoyé à Gemini Live Transcription par WebSocket. La connexion attend `setupComplete` avant d'envoyer les paquets audio. Les transcriptions provisoires et définitives sont affichées, mais seules les définitives déclenchent une alerte.

## Configuration

Mot/prénom, matière, clé API Gemini, modèle de réponse, langue audio et prompt de contexte sont configurables. Le modèle de réponse par défaut est `gemini-3.5-flash-lite`. La transcription utilise `gemini-3.5-transcribe-live`.

## Installation / mise à jour

1. Ouvre `arc://extensions`.
2. Charge le dossier qui contient `manifest.json`, ou remplace les fichiers du dossier local par ceux du dernier ZIP GitHub.
3. Clique sur « Recharger » dans la page des extensions.
4. Configure la clé API et le mot-clé.
5. Clique sur « Lancer l'extension sur la visio », puis sur « Choisir la fenêtre » et sélectionne la visioconférence avec son audio.

