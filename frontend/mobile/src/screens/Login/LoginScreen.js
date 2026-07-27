import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login, getCurrentUser } from '../../api/api';
import { colors, fonts, spacing, radius } from '../../styles/theme';
import Input from '../../components/common/Input';
import PrimaryButton from '../../components/common/PrimaryButton';
import PhoneShell, { LogoMark } from '../../components/common/PhoneShell';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await login(username, password);
      await AsyncStorage.setItem('token', res.data.access_token);
      const userRes = await getCurrentUser();
      const userProfile = userRes.data.user || userRes.data;
      await AsyncStorage.setItem('user', JSON.stringify(userProfile));
      navigation.replace('Main');
    } catch (e) {
      const isNetworkIssue = e.code === 'ECONNABORTED' || !e.response;
      setError(isNetworkIssue ? 'Serveur inaccessible. Vérifiez la connexion API.' : 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PhoneShell scroll={false} contentStyle={styles.content} panelStyle={styles.panel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.headerBlock}>
          <LogoMark size={56} compact />
          <View style={styles.titleBlock}>
            <Text style={styles.screenLabel}>Connexion sécurisée</Text>
            <Text style={styles.heading}>Bienvenue</Text>
            <Text style={styles.subtitle}>Accédez à votre espace médical avec vos identifiants du cabinet.</Text>
          </View>
        </View>

        <View style={styles.formSection}>
          <Input
            label="Identifiant"
            placeholder="Entrez votre identifiant"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            icon={<Feather name="user" size={18} color={colors.mobileMuted} />}
          />
          <Input
            label="Mot de passe"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={error || undefined}
            icon={<Feather name="lock" size={18} color={colors.mobileMuted} />}
          />
          <PrimaryButton
            title="Se connecter"
            onPress={handleLogin}
            loading={loading}
            style={styles.primaryButton}
          />
        </View>

        <Text style={styles.terms}>
          En continuant, vous acceptez les conditions d'utilisation et la politique de confidentialité de SmartHos.
        </Text>
      </KeyboardAvoidingView>
    </PhoneShell>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
  },
  headerBlock: {
    marginBottom: spacing.xl,
    gap: spacing.xl,
  },
  titleBlock: {
    marginTop: spacing.sm,
  },
  screenLabel: {
    color: colors.mobilePrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  heading: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.mobileText,
    letterSpacing: -0.8,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...fonts.caption,
    color: colors.mobileMuted,
    lineHeight: 20,
    maxWidth: 292,
  },
  formSection: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: spacing.md,
  },
  primaryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.mobilePrimary,
    borderRadius: radius.lg,
  },
  terms: {
    ...fonts.caption,
    textAlign: 'center',
    color: colors.mobileMuted,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
    lineHeight: 18,
  },
});
