import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../styles/theme';

const appLogo = require('../../../assets/favicon-logo.png');

export function LogoMark({ size = 58, compact = false }) {
  return (
    <View style={[styles.logoRow, compact && styles.logoRowCompact]}>
      <View style={[styles.logoBadge, { width: size, height: size, borderRadius: size * 0.3 }]}>
        <Image source={appLogo} style={styles.logoImage} resizeMode="contain" />
      </View>
      <View>
        <Text style={[styles.logoText, compact && styles.logoTextCompact]}>SMARTHOS</Text>
        <Text style={[styles.logoSubtext, compact && styles.logoSubtextCompact]}>
          ASSISTANT MÉDICAL
        </Text>
      </View>
    </View>
  );
}

export function BackButton({ onPress }) {
  if (!onPress) return <View style={styles.backButtonSpacer} />;

  return (
    <TouchableOpacity style={styles.backButton} onPress={onPress} activeOpacity={0.75}>
      <Feather name="chevron-left" size={22} color={colors.mobileMuted} />
    </TouchableOpacity>
  );
}

export function ScreenHeader({ title, onBack }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} />
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backButtonSpacer} />
    </View>
  );
}

export default function PhoneShell({
  children,
  scroll = true,
  contentStyle,
  panelStyle,
  center = false,
}) {
  const { width } = useWindowDimensions();
  const panelRadius = width < 380 ? 26 : 34;
  const horizontalMargin = width < 380 ? 10 : 16;

  const panel = (
    <View
      style={[
        styles.panel,
        {
          marginHorizontal: horizontalMargin,
          borderRadius: panelRadius,
        },
        center && styles.centerPanel,
        panelStyle,
      ]}
    >
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.staticContent, contentStyle]}>{children}</View>
      )}
    </View>
  );

  return <SafeAreaView style={styles.safe}>{panel}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.mobileBackground,
    paddingVertical: 6,
  },
  panel: {
    flex: 1,
    backgroundColor: colors.mobilePanel,
    overflow: 'hidden',
  },
  centerPanel: {
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.mobileText,
    letterSpacing: -0.4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonSpacer: {
    width: 36,
    height: 36,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoRowCompact: {
    gap: 8,
  },
  logoBadge: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '76%',
    height: '76%',
  },
  logoText: {
    color: colors.mobileText,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  logoTextCompact: {
    fontSize: 18,
  },
  logoSubtext: {
    color: colors.mobileMuted,
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  logoSubtextCompact: {
    fontSize: 5,
  },
});
