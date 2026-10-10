# Visio Keyword Alert

## Fonctionnement

L'extension ouvre un seul tableau de bord. En haut, les actions permettent de choisir la source de visioconférence et d'arrêter la surveillance. La transcription est dans un panneau repliable; un bouton permet de la développer en plein écran. Avant une alerte, le reste de la page reste vide.

Quand le mot-clé est détecté, un bandeau rouge s'affiche et le chat Gemini apparaît juste en dessous, dans le même document et sans iframe séparée. Les messages ont leur propre zone de défilement.

L'audio capturé est converti en PCM mono 16 kHz et envoyé à Gemini Live Transcription par WebSocket. La connexion attend `setupComplete` avant l'envoi des paquets audio.

## Alertes et mise au premier plan

À la détection, la page envoie l'ID exact de sa fenêtre au service worker. Celui-ci tente de restaurer et de focaliser cette fenêtre plusieurs fois; la page effectue aussi ses propres tentatives. Une notification Windows avec interaction requise sert de secours et permet de ramener le tableau de bord au premier plan par clic.

L'API Chromium propose `windows.update({focused:true})`, mais une extension ne peut pas imposer un mode natif `always-on-top` au-dessus de toutes les applications. Si Windows/Arc empêche le changement de focus malgré les tentatives, une petite application compagnon Windows serait nécessaire pour tenter une gestion native de la fenêtre.

## Détection et chat

Le mot/prénom configuré est ajouté au vocabulaire de transcription. La détection vérifie les segments provisoires et définitifs avec un délai anti-répétition. Une alerte déclenche automatiquement une demande d'explication des notions et de la démarche de réflexion; le chat reste ensuite disponible pour les questions supplémentaires par écrit ou à la voix.

## Configuration

Mot/prénom, matière, clé API Gemini, modèle de réponse, langue audio et prompt de contexte sont configurables. Le modèle de réponse par défaut est `gemini-3.5-flash-lite`. La transcription utilise `gemini-3.5-transcribe-live`.

## Enregistrement

Une option permet d'enregistrer le flux capturé en WebM. Le fichier est préparé lorsque la surveillance est arrêtée.

## Installation ou mise à jour locale

1. Ouvre `arc://extensions`.
2. Active le mode développeur.
3. Charge le dossier contenant `manifest.json`, ou clique sur « Recharger » si l'extension est déjà installée.
4. Configure la clé API et le mot/prénom.
5. Clique sur « Lancer l'extension sur la visio », puis « Choisir la fenêtre » dans le tableau de bord.
6. Sélectionne la source de la visio et son audio.

Important : si tu utilises une copie locale décompressée, télécharger ou modifier les fichiers sur GitHub ne met pas automatiquement cette copie à jour. Il faut copier les nouveaux fichiers dans le dossier local puis recharger l'extension.

## Limites

Le partage audio dépend des options proposées par Windows/Arc dans le sélecteur système. Le focus et l'affichage en premier plan ont été renforcés, mais le comportement réel dépend de la version d'Arc et des politiques de fenêtres de Windows.
