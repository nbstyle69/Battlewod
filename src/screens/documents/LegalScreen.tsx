import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme, AppTheme } from '../../context/ThemeContext';

type Tab = 'cgu' | 'privacy';

export default function LegalScreen() {
  const nav = useNavigation();
  const { theme, mode } = useTheme();
  const isDark = mode === 'dark';
  const S = createStyles(theme, isDark);
  const [tab, setTab] = useState<Tab>('cgu');

  return (
    <View style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12}>
          <ArrowLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Mentions légales</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={S.tabs}>
        <TouchableOpacity style={[S.tab, tab === 'cgu' && S.tabActive]} onPress={() => setTab('cgu')}>
          <Text style={[S.tabText, tab === 'cgu' && S.tabTextActive]}>CGU</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.tab, tab === 'privacy' && S.tabActive]} onPress={() => setTab('privacy')}>
          <Text style={[S.tabText, tab === 'privacy' && S.tabTextActive]}>Confidentialité</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={S.scroll} contentContainerStyle={S.content}>
        {tab === 'cgu' ? <CGUContent theme={theme} S={S} /> : <PrivacyContent theme={theme} S={S} />}
      </ScrollView>
    </View>
  );
}

function CGUContent({ theme, S }: { theme: AppTheme; S: any }) {
  return (
    <>
      <Text style={S.h1}>Conditions Générales d'Utilisation</Text>
      <Text style={S.subtitle}>Dernière mise à jour : 23 mars 2026</Text>

      <Text style={S.h2}>1. Objet</Text>
      <Text style={S.p}>
        Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de l'application mobile AthleX,
        éditée par AthleX SAS. En créant un compte, vous acceptez ces CGU dans leur intégralité.
      </Text>

      <Text style={S.h2}>2. Inscription</Text>
      <Text style={S.p}>
        L'inscription est gratuite et ouverte à toute personne physique majeure ou mineure avec autorisation parentale.
        Vous devez fournir un email valide, un pseudo unique et un mot de passe sécurisé (6 caractères minimum).
        Vous êtes responsable de la confidentialité de vos identifiants.
      </Text>

      <Text style={S.h2}>3. Services</Text>
      <Text style={S.p}>AthleX propose les services suivants :</Text>
      <Text style={S.li}>• Suivi de performances sportives (scores WOD, PR)</Text>
      <Text style={S.li}>• Système de classement ELO</Text>
      <Text style={S.li}>• Participation à des tournois et compétitions</Text>
      <Text style={S.li}>• Minuteur vidéo pour l'enregistrement de WODs</Text>
      <Text style={S.li}>• Partage de scores sur les réseaux sociaux (Instagram, WhatsApp, etc.)</Text>
      <Text style={S.li}>• Système de badges et gamification</Text>
      <Text style={S.li}>• Code de parrainage pour inviter d'autres athlètes</Text>
      <Text style={S.li}>• Messagerie et communication entre membres d'une box</Text>
      <Text style={S.li}>• Gestion de box pour les gérants</Text>

      <Text style={S.h2}>4. Comportement</Text>
      <Text style={S.p}>
        L'utilisateur s'engage à ne pas tricher, falsifier ses scores ou adopter un comportement nuisible.
        Tout faux score entraîne une disqualification et perte d'ELO. AthleX se réserve le droit de suspendre
        ou supprimer tout compte enfreignant ces règles.
      </Text>

      <Text style={S.h2}>5. Propriété intellectuelle</Text>
      <Text style={S.p}>
        L'application, son design, code et contenu sont la propriété exclusive d'AthleX SAS.
        Toute reproduction est interdite sans autorisation préalable.
      </Text>

      <Text style={S.h2}>6. Données personnelles</Text>
      <Text style={S.p}>
        Le traitement des données personnelles est décrit dans notre Politique de Confidentialité
        accessible dans l'onglet "Confidentialité" ci-dessus.
      </Text>

      <Text style={S.h2}>7. Suppression de compte</Text>
      <Text style={S.p}>
        Vous pouvez supprimer votre compte à tout moment depuis Profil → Compte → Supprimer mon compte.
        La suppression est irréversible et entraîne l'effacement définitif de toutes vos données.
      </Text>

      <Text style={S.h2}>8. Limitation de responsabilité</Text>
      <Text style={S.p}>
        AthleX est fourni "tel quel". Nous ne garantissons pas la disponibilité permanente du service.
        AthleX ne peut être tenu responsable des blessures survenues lors d'entraînements.
      </Text>

      <Text style={S.h2}>9. Modifications</Text>
      <Text style={S.p}>
        AthleX se réserve le droit de modifier les CGU. Les utilisateurs seront informés des changements
        significatifs via l'application.
      </Text>

      <Text style={S.h2}>10. Droit applicable</Text>
      <Text style={S.p}>
        Les présentes CGU sont soumises au droit français. Tout litige sera porté devant les tribunaux compétents de Paris.
      </Text>

      <Text style={S.h2}>11. Contact</Text>
      <Text style={S.p}>
        Pour toute question : contact@athlex.app
      </Text>

      <Text style={S.footer}>© 2026 AthleX. Tous droits réservés.</Text>
    </>
  );
}

function PrivacyContent({ theme, S }: { theme: AppTheme; S: any }) {
  return (
    <>
      <Text style={S.h1}>Politique de Confidentialité</Text>
      <Text style={S.subtitle}>Dernière mise à jour : 21 mars 2026</Text>

      <Text style={S.h2}>1. Introduction</Text>
      <Text style={S.p}>
        AthleX (« nous », « notre ») est une application mobile de compétition functional fitness & hybrid.
        Cette politique décrit comment nous collectons, utilisons et protégeons vos données personnelles.
      </Text>

      <Text style={S.h2}>2. Données collectées</Text>
      <Text style={S.li}>• Informations de compte : email, pseudo, mot de passe (chiffré), niveau</Text>
      <Text style={S.li}>• Données de profil : photo, bio, personal records (PR)</Text>
      <Text style={S.li}>• Données de performance : scores WOD, classement ELO, vidéos</Text>
      <Text style={S.li}>• Données de compétition : participations, résultats</Text>
      <Text style={S.li}>• Communications : messages dans les chats de box</Text>
      <Text style={S.li}>• Données techniques : type d'appareil, OS, token push</Text>
      <Text style={S.li}>• Données de gamification : badges obtenus, streaks, compteurs d'activité</Text>

      <Text style={S.h2}>3. Utilisation des données</Text>
      <Text style={S.li}>• Fournir et améliorer les fonctionnalités</Text>
      <Text style={S.li}>• Gérer votre compte et profil athlète</Text>
      <Text style={S.li}>• Calculer et afficher les classements ELO</Text>
      <Text style={S.li}>• Permettre la participation aux compétitions</Text>
      <Text style={S.li}>• Envoyer des notifications push (si autorisées)</Text>
      <Text style={S.li}>• Attribuer des badges et suivre votre progression</Text>
      <Text style={S.li}>• Analyser l'usage de l'application de manière anonyme</Text>

      <Text style={S.h2}>4. Stockage et sécurité</Text>
      <Text style={S.p}>
        Vos données sont stockées via Supabase, hébergé sur des serveurs conformes aux standards de sécurité.
        Les mots de passe sont chiffrés. Les communications utilisent le protocole HTTPS.
      </Text>

      <Text style={S.h2}>5. Caméra et galerie</Text>
      <Text style={S.p}>
        L'application peut accéder à votre caméra pour enregistrer vos performances et à votre galerie
        pour sauvegarder les vidéos ou choisir une photo de profil. Ces accès nécessitent votre autorisation.
      </Text>

      <Text style={S.h2}>6. Notifications push</Text>
      <Text style={S.p}>
        Les notifications vous informent des résultats et rappels. Vous pouvez les désactiver dans les paramètres.
      </Text>

      <Text style={S.h2}>7. Partage des données</Text>
      <Text style={S.p}>
        Nous ne vendons jamais vos données. Sont visibles par les membres de votre box :
        pseudo, niveau, scores, classement. Le gérant a accès aux données de ses membres.
      </Text>
      <Text style={S.p}>
        Lorsque vous partagez un score via la fonctionnalité de partage, une image contenant votre pseudo,
        score et nom de box est générée localement et partagée via le système natif de votre appareil.
        Aucune donnée n'est envoyée à nos serveurs lors du partage.
      </Text>

      <Text style={S.h2}>8. Services tiers</Text>
      <Text style={S.p}>Nous utilisons les services tiers suivants :</Text>
      <Text style={S.li}>• Supabase : hébergement des données et authentification</Text>
      <Text style={S.li}>• Mixpanel : statistiques d'usage anonymisées</Text>
      <Text style={S.li}>• Sentry : détection et correction des erreurs techniques (données anonymisées)</Text>
      <Text style={S.li}>• Expo : distribution des mises à jour de l'application</Text>

      <Text style={S.h2}>9. Vos droits (RGPD)</Text>
      <Text style={S.li}>• Accéder à vos données personnelles</Text>
      <Text style={S.li}>• Rectifier vos informations via votre profil</Text>
      <Text style={S.li}>• Supprimer votre compte et toutes vos données</Text>
      <Text style={S.li}>• Exporter vos données sur demande</Text>
      <Text style={S.li}>• Retirer votre consentement aux notifications</Text>

      <Text style={S.h2}>10. Conservation</Text>
      <Text style={S.p}>
        Vos données sont conservées tant que votre compte est actif. En cas de suppression,
        vos données sont effacées immédiatement.
      </Text>

      <Text style={S.h2}>11. Contact</Text>
      <Text style={S.p}>
        Pour toute question : contact@athlex.app
      </Text>

      <Text style={S.footer}>© 2026 AthleX. Tous droits réservés.</Text>
    </>
  );
}

function createStyles(t: AppTheme, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: t.text },
    tabs: {
      flexDirection: 'row', marginHorizontal: 16, marginTop: 12,
      backgroundColor: isDark ? t.surface : t.card, borderRadius: 12,
      padding: 4, borderWidth: 1, borderColor: t.border,
    },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    tabActive: { backgroundColor: t.accent },
    tabText: { fontSize: 13, fontWeight: '700', color: t.textMuted },
    tabTextActive: { color: '#fff' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 60 },
    h1: { fontSize: 22, fontWeight: '900', color: t.text, marginBottom: 4 },
    subtitle: { fontSize: 12, color: t.textMuted, marginBottom: 24 },
    h2: { fontSize: 16, fontWeight: '700', color: t.accent, marginTop: 20, marginBottom: 8 },
    p: { fontSize: 14, color: t.textSecondary, lineHeight: 22, marginBottom: 8 },
    li: { fontSize: 14, color: t.textSecondary, lineHeight: 22, marginBottom: 4, paddingLeft: 8 },
    footer: { fontSize: 12, color: t.textMuted, marginTop: 32, textAlign: 'center' },
  });
}
