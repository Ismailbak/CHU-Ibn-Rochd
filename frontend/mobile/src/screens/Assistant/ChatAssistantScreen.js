import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  Platform, TouchableOpacity, ActivityIndicator, TextInput, Keyboard,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { sendChatMessage } from '../../api/api';
import { colors, fonts, spacing } from '../../styles/theme';

const SUGGESTED_PROMPTS = [
  'Signes de la polyarthrite rhumatoïde ?',
  'Traitement de l\'arthrose',
  'Interpréter un bilan inflammatoire',
];

const parseErrorMessage = (error) => {
  if (!error.response) return 'Erreur réseau. Vérifiez votre connexion et réessayez.';
  if (error.response.status === 401) return 'Session expirée. Reconnectez-vous.';
  if (error.response.status === 403) return 'Accès refusé.';
  if (error.response.status === 422) return 'Données invalides. Vérifiez votre saisie.';
  if (error.response.status >= 500) return 'Serveur temporairement indisponible. Réessayez dans quelques instants.';
  return error.response.data?.detail || "Erreur lors de la communication avec l'IA.";
};

export default function ChatAssistantScreen({ navigation, route }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const patientId = route?.params?.patientId || null;
  const flatListRef = useRef(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelRadius = width < 380 ? 26 : 34;
  const horizontalMargin = width < 380 ? 10 : 16;

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      scrollToBottom(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  const bottomSpacer = keyboardHeight > 0
    ? keyboardHeight + spacing.xs
    : Math.max(insets.bottom, spacing.sm);

  const sendMessage = useCallback(async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setInput('');
    Keyboard.dismiss();

    const newMessages = [
      ...messages,
      { id: Date.now().toString(), role: 'user', text: userMsg },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await sendChatMessage(userMsg, patientId, 'fr', { sessionId });
      if (res.data?.session_id) {
        setSessionId(res.data.session_id);
      }
      setMessages([
        ...newMessages,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: res.data?.response || "Le serveur n'a pas renvoyé de réponse valide.",
          sources: res.data?.sources || [],
          warnings: res.data?.warnings || [],
          confidence: res.data?.confidence || 'low',
          retrievalType: res.data?.retrieval_type || 'none',
          patientName: res.data?.patient_name || null,
          tokens: res.data?.tokens || 0,
          model: res.data?.model || 'SmartHos',
        },
      ]);
    } catch (error) {
      setMessages([
        ...newMessages,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: parseErrorMessage(error),
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom(true);
    }
  }, [input, messages, patientId, sessionId, scrollToBottom]);

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    const sourceCount = item.sources?.length || 0;
    const hasWarnings = item.warnings?.length > 0;

    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
        {!isUser && <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>AI</Text></View>}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble, item.error && styles.errorBubble]}>
          <Text style={[styles.messageText, isUser && styles.userText]}>{String(item.text)}</Text>
          {!isUser && !item.error && (sourceCount > 0 || hasWarnings || item.patientName) ? (
            <View style={styles.groundingMeta}>
              {item.patientName ? <Text style={styles.metaText}>Patient: {item.patientName}</Text> : null}
              {sourceCount > 0 ? <Text style={styles.metaText}>{sourceCount} source{sourceCount > 1 ? 's' : ''}</Text> : null}
              {hasWarnings ? <Text style={styles.warningText}>{item.warnings[0]}</Text> : null}
            </View>
          ) : null}
        </View>
        {isUser && <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>Dr</Text></View>}
      </View>
    );
  };

  const listData = messages.length > 0 ? messages : [
    { id: 'time', role: 'system', text: '09:41 AM' },
    { id: 'hello', role: 'assistant', text: 'Bonjour, je suis votre assistant SmartHos. Posez-moi une question clinique ou demandez un résumé patient.' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View
        style={[
          styles.panel,
          {
            marginHorizontal: horizontalMargin,
            borderRadius: panelRadius,
            paddingBottom: bottomSpacer,
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.75}>
            <Feather name="chevron-left" size={22} color={colors.mobileMuted} />
          </TouchableOpacity>
          <View style={styles.assistantAvatar}><Text style={styles.assistantAvatarText}>AI</Text></View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerName}>Assistant SmartHos</Text>
            <Text style={styles.headerRole}>{loading ? 'Réponse en cours...' : 'Réponses médicales contextualisées'}</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.8}
            onPress={() => {
              setMessages([]);
              setSessionId(null);
              setInput('');
            }}
          >
            <Feather name="plus" size={17} color={colors.mobilePrimary} />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={flatListRef}
          style={styles.messageList}
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.role === 'system') {
              return <Text style={styles.timeText}>{item.text}</Text>;
            }
            return renderMessage({ item });
          }}
          ListFooterComponent={
            <>
              {messages.length === 0 && (
                <View style={styles.suggestionWrap}>
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <TouchableOpacity key={prompt} style={styles.suggestionChip} onPress={() => sendMessage(prompt)}>
                      <Text style={styles.suggestionText}>{prompt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {loading && (
                <View style={styles.typingRow}>
                  <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>AI</Text></View>
                  <Text style={styles.typingText}>L'assistant analyse...</Text>
                  <ActivityIndicator size="small" color={colors.mobileMuted} style={{ marginLeft: spacing.sm }} />
                </View>
              )}
            </>
          }
          contentContainerStyle={[
            styles.messagesList,
            messages.length === 0 && styles.messagesListEmpty,
          ]}
          onContentSizeChange={() => scrollToBottom(false)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Votre question médicale..."
            placeholderTextColor={colors.mobileMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => sendMessage()}
            onFocus={() => scrollToBottom(true)}
            returnKeyType="send"
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.attachButton, (!input.trim() || loading) && styles.attachButtonDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Feather name="send" size={18} color={colors.mobileText} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#A9DCE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantAvatarText: {
    color: colors.mobilePrimaryDark,
    fontWeight: '900',
    fontSize: 13,
  },
  headerCopy: {
    flex: 1,
  },
  headerName: {
    fontSize: 14,
    color: colors.mobileText,
    fontWeight: '900',
  },
  headerRole: {
    ...fonts.caption,
    color: colors.mobileMuted,
    fontSize: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E9F7F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    flex: 1,
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: spacing.md,
  },
  messagesListEmpty: {
    justifyContent: 'center',
  },
  timeText: {
    ...fonts.caption,
    alignSelf: 'center',
    color: colors.mobileMuted,
    marginBottom: spacing.md,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  smallAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D8E7EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: {
    fontSize: 9,
    color: colors.mobilePrimaryDark,
    fontWeight: '900',
  },
  bubble: {
    maxWidth: '74%',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  userBubble: {
    backgroundColor: colors.surface,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
  },
  errorBubble: {
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  messageText: {
    fontSize: 13,
    color: colors.mobileText,
    fontWeight: '600',
    lineHeight: 18,
  },
  userText: {
    color: colors.mobileText,
  },
  groundingMeta: {
    marginTop: spacing.xs,
    gap: 2,
  },
  metaText: {
    fontSize: 10,
    color: colors.mobileMuted,
  },
  warningText: {
    fontSize: 10,
    color: '#B45309',
  },
  suggestionWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
  },
  suggestionText: {
    fontSize: 12,
    color: colors.mobileText,
    fontWeight: '700',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  typingText: {
    ...fonts.caption,
    color: colors.mobileMuted,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  composerInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 24,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    color: colors.mobileText,
    fontSize: 14,
  },
  attachButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButtonDisabled: {
    opacity: 0.7,
  },
});
