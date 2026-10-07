# Visio Keyword Alert

## Fonctionnement

L'extension ouvre un petit contrôleur dédié depuis l'icône de la toolbar. Tu choisis explicitement la fenêtre de visioconférence via le sélecteur système. Une fois le partage démarré, le contrôleur peut être réduit et la fenêtre sélectionnée reste la source surveillée pendant que tu changes d'application.

L'audio de la fenêtre est converti en PCM mono 16 kHz et envoyé à Gemini Live Transcription par WebSocket. La connexion attend `setupComplete` avant le premier paquet audio. Les transcriptions provisoires et définitives sont toutes deux utilisées.

## Détection

Le mot/prénom est ajouté au vocabulaire personnalisé de la transcription. La détection fonctionne sur les hypothèses provisoires à faible latence ainsi que sur les segments finaux. Un cooldown évite les alertes répétées.

Après détection, l'extension :
- affiche une notification Windows ;
- ouvre un popup d'alerte très visible ;
- capture une image de la fenêtre surveillée ;
- transmet le contexte récent au chat.

Le chat reste séparé de la visioconférence et les demandes supplémentaires sont déclenchées manuellement.

## Configuration

Mot/prénom, matière, clé API Gemini, modèle de réponse, langue audio et prompt de contexte sont configurables. Le modèle de réponse par défaut est `gemini-3.5-flash-lite`. La transcription utilise `gemini-3.5-transcribe-live`.

## Enregistrement

Une option permet d'enregistrer le flux capturé en WebM. Le fichier est généré lorsque la surveillance est arrêtée.

## Installation

1. Ouvre `arc://extensions`.
2. Active le mode développeur.
3. Charge le dossier de l'extension.
4. Épingle l'icône.
5. Configure la clé API et le mot/prénom.
6. Clique sur l'icône puis sur « Choisir la fenêtre ».
7. Sélectionne la fenêtre de visio et partage son audio.
8. Le contrôleur peut être réduit pendant l'utilisation.

## Limites

Le partage audio dépend des options proposées par Windows/Arc dans le sélecteur. Une extension Chromium ne peut pas garantir un vrai « always on top » natif au-dessus de chaque application Windows.
