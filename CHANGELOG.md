# Changelog

## v1.0.27 — 5 avril 2026

### Android — Réécriture complète du module vidéo (Camera2 API)

**Remplacement de CameraX par Camera2 API** pour le module `realtime-recorder` Android.
Décomposition du fichier monolithique `RecorderEngine.kt` (~800 lignes) en 8 classes modulaires :

- **`EglCore.kt`** — Gestion EGL14 (contexte, display, config, surfaces, setPresentationTime)
- **`CameraTextureRenderer.kt`** — Double shader OpenGL : OES (caméra) + 2D (overlay avec alpha blending)
- **`VideoEncoder.kt`** — Wrapper MediaCodec H.264 (Surface input, 10 Mbps, 1080x1920, 30 FPS)
- **`VideoMuxer.kt`** — Wrapper thread-safe autour de MediaMuxer (sync vidéo + audio)
- **`AudioEncoder.kt`** — AudioRecord → MediaCodec AAC (44100 Hz mono, 128 kbps)
- **`CameraController.kt`** — Camera2 API : openCamera, CameraCaptureSession, TEMPLATE_RECORD
- **`VideoRecorderEngine.kt`** — Orchestrateur singleton, remplace RecorderEngine.kt
- **`RecordingForegroundService.kt`** — Service Android foreground pour les enregistrements longs (20+ min)

**Fichiers modifiés :**
- `RealtimeRecorderModule.kt` — RecorderEngine → VideoRecorderEngine
- `RealtimeRecorderHostView.kt` — idem
- `build.gradle` — Suppression des dépendances CameraX
- `AndroidManifest.xml` — Permissions FOREGROUND_SERVICE (camera + microphone) + déclaration du service

**Fichiers dépréciés (vidés) :**
- `RecorderEngine.kt`, `TextureRenderer.kt`, `CodecInputSurface.kt`

**API JS inchangée** : `updateOverlayState`, `startRecording`, `stopRecording`, `switchCamera`

---

### Suppression des modules natifs inutilisés

- **`modules/screen-recorder`** — Supprimé entièrement (build.gradle, AndroidManifest, Kotlin, package.json)
- **`modules/video-overlay`** — Supprimé entièrement (Android + iOS : Kotlin, Swift, podspec, package.json)
- Nettoyage de `package.json` et `package-lock.json`

---

### Back-Office — Nouvelle page Infos Box (`BOBoxInfoScreen.tsx`)

Nouvel écran BO pour gérer les informations de la box :
- Nom, description, adresse, téléphone, email de contact
- URL site web, URL Google Maps
- Date de fondation (date picker)
- Upload du logo de la box (bucket Supabase `box-logos`)

---

### Mobile — Nouvelle page Infos Box (`BoxInfoScreen.tsx`)

Nouvel écran mobile affichant les infos publiques de la box :
- Adresse (lien Google Maps cliquable)
- Téléphone (appel direct)
- Email (envoi direct)
- Site web (ouverture navigateur)
- Date de fondation
- Logo de la box

---

### Home Screen — Améliorations

- **`AutoScrollCarousel.tsx`** — Nouveau composant carrousel auto-scroll pour bannières
- **`Toast.tsx`** — Nouveau composant Toast personnalisé
- **`haptics.ts`** — Nouveau module utilitaire pour retours haptiques
- Améliorations UI du HomeScreen (192 lignes modifiées)

---

### Authentification & Onboarding

- **`LoginScreen.tsx`** / **`RegisterScreen.tsx`** — Améliorations UI (icônes, layout)
- **`OnboardingTutorialScreen.tsx`** — Mise à jour des slides d'onboarding
- **`AuthContext.tsx`** — Refactoring et améliorations de la gestion d'authentification

---

### Réservations

- **`MyReservationsScreen.tsx`** — Améliorations UI et fonctionnelles
- **`ReservationScreen.tsx`** — Corrections mineures

---

### Compétitions & Tournois

- **`PhysicalCompetitionScreen.tsx`** — Améliorations (32 lignes modifiées)
- **`InterScoreSubmitScreen.tsx`** — Corrections mineures
- **`CompetitionScreen.tsx`** / **`TournamentScreen.tsx`** — Corrections mineures
- **`BOTournamentScreen.tsx`** — Améliorations BO tournois
- **`DailyTournamentDetailScreen.tsx`** — Améliorations mini-tournois

---

### Whiteboard & WOD

- **`WhiteboardScreen.tsx`** — Refactoring important (109 lignes modifiées)
- **`WODDetailScreen.tsx`** — Améliorations affichage
- **`BOWODsScreen.tsx`** — Améliorations BO WODs
- **`WodGeneratorCard.tsx`** / **`WODGeneratorScreen.tsx`** — Améliorations générateur WOD

---

### Profil & Social

- **`ProfileScreen.tsx`** — Améliorations affichage profil
- **`PublicProfileScreen.tsx`** — Corrections mineures
- **`FriendsScreen.tsx`** — Corrections mineures
- **`MessagesScreen.tsx`** — Corrections mineures

---

### Timer & Vidéo

- **`TimerRunScreen.tsx`** — Améliorations timer
- **`VideoPlaybackScreen.tsx`** — Améliorations lecture vidéo

---

### Gamification

- **`gamification.ts`** — Refactoring du service gamification (59 lignes modifiées)

---

### Deep Linking — Fichiers serveur

- **`.well-known/apple-app-site-association`** — iOS Universal Links
- **`.well-known/assetlinks.json`** — Android App Links

---

### Migrations SQL

- **`20260402_wod_sort_order.sql`** — Colonne `sort_order` sur `box_wods` pour réordonner par drag & drop
- **`20260403_changelog_maintenance.sql`** — Entrées changelog pour le sprint maintenance (catch vides → captureError, modules supprimés, deep linking, boutons partage)
- **`20260405_box_info.sql`** — Colonnes infos box (address, phone, email, google_maps_url, founded_at), bucket storage `box-logos`, fix `check_weekly_limit` pour réservation semaine suivante
- **`20260405_fix_multibox_rls.sql`** — Réécriture complète des RLS policies multi-box avec fonctions SECURITY DEFINER (fix récursion infinie)

---

### Corrections de bugs

- **Kotlin 2.1 compat** — Remplacement de `break`/`continue` dans les inline lambdas (`AudioEncoder.kt`, `VideoEncoder.kt`) par des chaînes `if/else` avec flag `finished`
- **`VideoRecorderEngine.kt`** — Fix `return@apply` invalides remplacés par des blocs null-safe `if`
- **`VideoRecorderEngine.kt`** — Ajout de `signalEndOfInputStream()` avant le drain final vidéo (fix vidéo tronquée)
- **`check_weekly_limit`** — Utilise la date cible au lieu de `CURRENT_DATE` pour permettre la réservation de la semaine suivante

---

### Build & Déploiement

- **Version** : `1.0.27`
- **Android** : `versionCode 23` — APK preview disponible
- **iOS** : `buildNumber 18` — Soumis sur TestFlight (processing Apple)
- Permissions Android ajoutées : `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MICROPHONE`

---

**78 fichiers modifiés, +4246 lignes, -2073 lignes**
