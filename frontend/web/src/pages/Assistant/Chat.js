import React, { useState, useRef, useEffect } from 'react';
import {
  deleteChatHistoryItem,
  deleteChatSession,
  getChatHistory,
  sendChatMessage,
  sendChatMessageWithAttachment,
} from '../../api/api';
import { ConfirmDialog, SourceCitationPanel } from '../../components/common';
import {
  FiActivity,
  FiAlertCircle,
  FiCalendar,
  FiClock,
  FiCopy,
  FiFileText,
  FiLoader,
  FiMessageSquare,
  FiMic,
  FiPaperclip,
  FiPlus,
  FiRefreshCw,
  FiSend,
  FiTarget,
  FiTrash2,
  FiUser,
  FiZap,
} from 'react-icons/fi';
import './Chat.css';

const generateId = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15);
};

const parseErrorMessage = (error) => {
  if (!error.response) {
    if (error.name === 'AbortError') return 'Requête annulée. Veuillez réessayer.';
    return 'Erreur réseau. Vérifiez votre connexion et réessayez.';
  }
  if (error.response.status >= 400 && error.response.status < 500) {
    if (error.response.status === 401) return 'Session expirée. Reconnectez-vous.';
    if (error.response.status === 403) return 'Accès refusé.';
    if (error.response.status === 404) return 'Ressource non trouvée.';
    if (error.response.status === 422) return 'Données invalides. Vérifiez votre saisie.';
    return error.response.data?.detail || 'Erreur client. Réessayez.';
  }

  if (error.response.status >= 500) return 'Serveur temporairement indisponible. Réessayez dans quelques instants.';
  return error.response.data?.detail || 'Erreur lors de la communication avec l\'IA.';
};

const suggestions = [
  {
    icon: FiFileText,
    title: 'Résumer un dossier',
    description: 'Ex. Mohamed Alami',
    template: 'Résume le dossier médical de ',
  },
  {
    icon: FiActivity,
    title: 'Suggérer un traitement',
    description: 'Ex. une polyarthrite rhumatoïde modérée',
    template: 'Quels traitements recommanderais-tu pour ',
  },
  {
    icon: FiCalendar,
    title: 'Planifier un suivi',
    description: 'Ex. un patient sous Méthotrexate',
    template: 'Quand devrais-je revoir ',
  },
  {
    icon: FiTarget,
    title: 'Aide au diagnostic',
    description: 'Ex. douleurs articulaires symétriques et raideur matinale',
    template: 'Patient avec ',
  },
];

const TITLE_STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'dans', 'sur', 'avec',
  'pour', 'par', 'au', 'aux', 'en', 'et', 'ou', 'the', 'a', 'an', 'of', 'for',
  'to', 'in', 'on', 'with', 'and', 'or', 'please', 'svp', 'stp',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'ce', 'cet', 'cette', 'ces',
  'qui', 'que', 'quoi', 'dont', 'ou', 'y', 'est', 'sont', 'ai', 'as', 'avez', 'ont',
  'voudrais', 'voudrait', 'peux', 'puis', 'faire', 'donner', 'dire', 'svp', 'stp',
]);

const formatConversationTitle = (text = '') => {
  const fallback = 'Nouvelle discussion';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;

  const words = cleaned
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => {
      const normalized = word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalized.length > 1 && !TITLE_STOP_WORDS.has(normalized);
    });

  const selected = (words.length ? words : cleaned.split(/\s+/)).slice(0, 3);
  if (!selected.length) return fallback;

  let title = selected
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  if (title.length > 36) {
    title = `${title.slice(0, 33).trim()}...`;
  }

  return title;
};

const groupHistoryBySession = (rows = []) => {
  const conversations = new Map();

  rows.forEach((row) => {
    const conversationId = row.session_id ? `session-${row.session_id}` : `message-${row.id}`;
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, {
        id: conversationId,
        session_id: row.session_id || null,
        latestMessageId: row.id,
        patient_id: row.patient_id,
        message: row.message,
        response: row.response,
        tokens_used: row.tokens_used,
        model_name: row.model_name || row.model,
        created_at: row.created_at,
        exchanges: [],
      });
    }

    conversations.get(conversationId).exchanges.push({
      id: row.id,
      message: row.message,
      response: row.response,
      tokens_used: row.tokens_used,
      model_name: row.model_name || row.model,
      patient_id: row.patient_id,
      created_at: row.created_at,
    });
  });

  return Array.from(conversations.values()).map((conversation) => ({
    ...conversation,
    exchanges: conversation.exchanges.sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    ),
  }));
};

function Chat({ patientId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [attachment, setAttachment] = useState(null);
  
  const messageEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const activePatientIdRef = useRef(patientId || null);
  const activeSessionIdRef = useRef(null);
  const activeConversationIdRef = useRef(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    let isMounted = true;
    activePatientIdRef.current = patientId || null;

    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        setHistoryError('');
        const res = await getChatHistory(patientId, 50);
        if (isMounted) setHistoryItems(groupHistoryBySession(res.data || []));
      } catch (err) {
        console.error('Failed to load chat history:', err);
        if (isMounted) setHistoryError("Impossible de charger l'historique.");
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  const handleCopyMessage = async (messageId, content) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        setCopiedMessageId(messageId);
        copyTimeoutRef.current = setTimeout(() => setCopiedMessageId(null), 2000);
      } else {
        throw new Error("Clipboard API not available");
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleAttachmentChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('La pièce jointe dépasse la limite de 8 Mo.');
      event.target.value = '';
      return;
    }
    setAttachment(file);
    setError('');
    event.target.value = '';
  };

  const clearAttachment = () => {
    setAttachment(null);
  };

  const internalHandleSend = async (textToSend, fileToSend = null) => {
    const cleanText = textToSend.trim();
    if ((!cleanText && !fileToSend) || loading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const currentMsgId = generateId();
    const fallbackConversationId = activeConversationIdRef.current || `local-${generateId()}`;
    activeConversationIdRef.current = fallbackConversationId;
    
    const userMsg = {
      id: currentMsgId,
      role: 'user',
      content: fileToSend
        ? `${cleanText || 'Analyse cette pièce jointe.'}\n\nPièce jointe: ${fileToSend.name}`
        : cleanText,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachment(null);
    setLoading(true);
    setError('');

    try {
      const activePatientId = activePatientIdRef.current || patientId;
      const res = fileToSend
        ? await sendChatMessageWithAttachment({
            message: cleanText,
            patientId: activePatientId,
            sessionId: activeSessionIdRef.current,
            language: 'fr',
            file: fileToSend,
            signal: abortControllerRef.current.signal,
          })
        : await sendChatMessage(
            cleanText,
            activePatientId,
            'fr',
            {
              signal: abortControllerRef.current.signal,
              sessionId: activeSessionIdRef.current,
            }
          );

      const resolvedPatientId = res?.data?.patient_id || activePatientIdRef.current || patientId || null;
      if (resolvedPatientId) {
        activePatientIdRef.current = resolvedPatientId;
      }

      const aiMsg = {
        id: generateId(),
        role: 'assistant',
        content: res?.data?.response || "Le serveur n'a pas renvoyé de réponse valide.",
        tokens: res?.data?.tokens || res?.data?.metadata?.tokens || 0,
        model: res?.data?.model || res?.data?.metadata?.model || 'RhumatoAI',
        sources: res?.data?.sources || [],
        confidence: res?.data?.confidence || 'low',
        warnings: res?.data?.warnings || [],
        retrieval_type: res?.data?.retrieval_type || 'none',
        patient_id: resolvedPatientId,
        patient_name: res?.data?.patient_name || null,
        timestamp: new Date()
      };

      const storedHistoryId = Number(res?.data?.message_id) || currentMsgId;
      const storedSessionId = Number(res?.data?.session_id) || null;
      if (storedSessionId) {
        activeSessionIdRef.current = storedSessionId;
      }
      const historyConversationId = storedSessionId ? `session-${storedSessionId}` : fallbackConversationId;
      const previousConversationId = activeConversationIdRef.current;
      activeConversationIdRef.current = historyConversationId;
      const newExchange = {
        id: storedHistoryId,
        message: userMsg.content,
        response: aiMsg.content,
        tokens_used: aiMsg.tokens,
        model_name: aiMsg.model,
        patient_id: resolvedPatientId,
        created_at: userMsg.timestamp.toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setSelectedHistoryId(historyConversationId);
      setHistoryItems(prev => {
        const existing = prev.find(item => item.id === historyConversationId);
        if (existing) {
          const updated = {
            ...existing,
            latestMessageId: storedHistoryId,
            response: aiMsg.content,
            tokens_used: aiMsg.tokens,
            model_name: aiMsg.model,
            patient_id: resolvedPatientId,
            created_at: newExchange.created_at,
            exchanges: [...(existing.exchanges || []), newExchange],
          };
          return [updated, ...prev.filter(item => item.id !== historyConversationId)].slice(0, 30);
        }

        const previousLocal = previousConversationId
          ? prev.find(item => item.id === previousConversationId)
          : null;
        if (previousLocal) {
          const updated = {
            ...previousLocal,
            id: historyConversationId,
            session_id: storedSessionId,
            latestMessageId: storedHistoryId,
            response: aiMsg.content,
            tokens_used: aiMsg.tokens,
            model_name: aiMsg.model,
            patient_id: resolvedPatientId,
            created_at: newExchange.created_at,
            exchanges: [...(previousLocal.exchanges || []), newExchange],
          };
          return [updated, ...prev.filter(item => item.id !== previousConversationId)].slice(0, 30);
        }

        return [{
          id: historyConversationId,
          session_id: storedSessionId,
          latestMessageId: storedHistoryId,
          patient_id: resolvedPatientId,
          message: userMsg.content,
          response: aiMsg.content,
          tokens_used: aiMsg.tokens,
          model_name: aiMsg.model,
          created_at: newExchange.created_at,
          exchanges: [newExchange],
        }, ...prev].slice(0, 30);
      });
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        console.log("Request aborted.");
        return; 
      }

      const errorMsg = parseErrorMessage(err);
      setError(errorMsg);
      const errorChatMsg = {
        id: generateId(),
        role: 'error',
        content: errorMsg,
        timestamp: new Date(),
        failedPrompt: cleanText
      };
      setMessages(prev => [...prev, errorChatMsg]);
      
    } finally {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
         setLoading(false);
         abortControllerRef.current = null;
      }
    }
  };

  const handleSend = () => internalHandleSend(input, attachment);

  const handleSuggestionClick = (template) => {
    setInput(template);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const pos = template.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleRetryFailed = (promptText, msgId) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    internalHandleSend(promptText);
  };

  const handleNewChat = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setMessages([]);
    setInput('');
    setError('');
    setLoading(false);
    setSelectedHistoryId(null);
    activePatientIdRef.current = patientId || null;
    activeSessionIdRef.current = null;
    activeConversationIdRef.current = null;
  };

  const handleSelectHistory = (item) => {
    const timestamp = new Date(item.created_at);
    const safeTimestamp = isNaN(timestamp.getTime()) ? new Date() : timestamp;

    const exchanges = item.exchanges?.length ? item.exchanges : [item];
    setMessages(exchanges.flatMap((exchange) => {
      const exchangeTimestamp = new Date(exchange.created_at);
      const safeExchangeTimestamp = isNaN(exchangeTimestamp.getTime()) ? safeTimestamp : exchangeTimestamp;
      return [
        {
          id: `${exchange.id}-user`,
          role: 'user',
          content: exchange.message,
          timestamp: safeExchangeTimestamp,
        },
        {
          id: `${exchange.id}-assistant`,
          role: 'assistant',
          content: exchange.response,
          tokens: exchange.tokens_used,
          model: exchange.model_name || 'RhumatoAI',
          timestamp: safeExchangeTimestamp,
        },
      ];
    }));
    setSelectedHistoryId(item.id);
    activeConversationIdRef.current = item.id;
    activeSessionIdRef.current = item.session_id || null;
    activePatientIdRef.current = item.patient_id || patientId || null;
    setInput('');
    setError('');
  };

  const requestDeleteHistory = (event, item) => {
    event.stopPropagation();
    setDeleteTarget(item);
  };

  const handleConfirmDeleteHistory = async () => {
    if (!deleteTarget) return;

    const target = deleteTarget;
    const previousItems = historyItems;
    setDeleteTarget(null);
    setHistoryItems(prev => prev.filter(historyItem => historyItem.id !== target.id));

    if (selectedHistoryId === target.id) {
      handleNewChat();
    }

    if (target.session_id) {
      try {
        await deleteChatSession(target.session_id);
      } catch (err) {
        console.error('Failed to delete chat session:', err);
        setHistoryItems(previousItems);
        setHistoryError('Impossible de supprimer cette conversation.');
      }
    } else if (typeof target.latestMessageId === 'number') {
      try {
        await deleteChatHistoryItem(target.latestMessageId);
      } catch (err) {
        console.error('Failed to delete chat history item:', err);
        setHistoryItems(previousItems);
        setHistoryError('Impossible de supprimer cette conversation.');
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageTime = (timestamp) => {
    if (!timestamp || isNaN(timestamp.getTime())) return '';
    return `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatHistoryDate = (dateValue) => {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  };

  const doctorLabel = ((currentUser?.last_name || currentUser?.username) || 'En ligne');

  return (
    <div className="assistant-shell">
      <aside className="assistant-rail">
        <div className="assistant-status-card">
          <div className="assistant-status-icon">
            <FiActivity />
          </div>
          <div>
            <strong>RhumatoAI</strong>
            <span>En ligne</span>
          </div>
          <span className="assistant-status-dot" aria-label="Assistant en ligne" />
        </div>

        <button className="assistant-new-chat-btn" onClick={handleNewChat} disabled={loading}>
          <FiPlus />
          Nouvelle conversation
        </button>

        <div className="assistant-history-header">
          <div>
            <p className="assistant-rail-label">Mes conversations</p>
            <span><FiUser /> {doctorLabel}</span>
          </div>
        </div>

        <div className="assistant-history-list">
          {historyLoading && (
            <div className="assistant-history-state">
              <FiLoader className="spinning" />
              <span>Chargement...</span>
            </div>
          )}

          {!historyLoading && historyError && (
            <div className="assistant-history-state assistant-history-error">
              <FiAlertCircle />
              <span>{historyError}</span>
            </div>
          )}

          {!historyLoading && !historyError && historyItems.length === 0 && (
            <div className="assistant-history-empty">
              <FiMessageSquare />
              <span>Aucune conversation récente</span>
            </div>
          )}

          {!historyLoading && !historyError && historyItems.map((item) => (
            <div
              key={item.id}
              className={`assistant-history-row ${selectedHistoryId === item.id ? 'active' : ''}`}
            >
              <button
                className="assistant-history-item"
                onClick={() => handleSelectHistory(item)}
                title={item.message}
              >
                <span className="assistant-history-title">{formatConversationTitle(item.message)}</span>
                <span className="assistant-history-meta">
                  <FiClock />
                  {formatHistoryDate(item.created_at)}
                </span>
              </button>
              <button
                className="assistant-history-delete"
                onClick={(event) => requestDeleteHistory(event, item)}
                aria-label="Supprimer la conversation"
                title="Supprimer"
              >
                <FiTrash2 />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="assistant-panel">
        <header className="assistant-header">
          <div className="assistant-title-block">
            <h1>Assistant IA</h1>
            <p>Posez vos questions médicales</p>
          </div>
          <div className="assistant-header-actions">
            <span>{doctorLabel}</span>
            <button onClick={handleNewChat} aria-label="Nouvelle conversation">
              <FiRefreshCw />
            </button>
          </div>
        </header>

        <main className="assistant-conversation">
          {messages.length === 0 && !loading && (
            <div className="assistant-welcome">
              <p className="assistant-suggestion-kicker">Essayez une de ces suggestions :</p>
              <div className="assistant-suggestion-grid">
                {suggestions.map(({ icon: Icon, title, description, template }) => (
                  <button key={title} type="button" onClick={() => handleSuggestionClick(template)}>
                    <span className="suggestion-icon"><Icon /></span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="assistant-message-list">
            {messages.length === 0 && !loading && (
              <div className="assistant-message assistant-message-bot assistant-intro-message">
                <div className="assistant-avatar"><FiActivity /></div>
                <div className="assistant-bubble">
                  <div className="assistant-message-heading">
                    <strong>RhumatoAI</strong>
                    <span>{formatMessageTime(new Date())}</span>
                  </div>
                  <p>Bonjour Dr. {doctorLabel} ! Je suis votre assistant IA médical. Comment puis-je vous aider aujourd'hui ?</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`assistant-message assistant-message-${msg.role}`}>
                <div className="assistant-avatar">
                  {msg.role === 'user' ? 'DR' : msg.role === 'error' ? <FiAlertCircle /> : <FiActivity />}
                </div>
                <div className="assistant-bubble">
                  <div className="assistant-message-heading">
                    <strong>{msg.role === 'user' ? 'Vous' : msg.role === 'error' ? 'Erreur' : 'RhumatoAI'}</strong>
                    <span>{formatMessageTime(msg.timestamp)}</span>
                  </div>
                  <p>{msg.content}</p>
                  {msg.role === 'error' && msg.failedPrompt && (
                    <button className="assistant-retry-btn" onClick={() => handleRetryFailed(msg.failedPrompt, msg.id)}>
                      <FiRefreshCw /> Réessayer
                    </button>
                  )}
                  {msg.role === 'assistant' && (msg.patient_name || msg.patient_id) && (
                    <div className="assistant-patient-context" title="Patient identifié pour cette réponse">
                      <FiUser />
                      <span>{msg.patient_name || `Patient #${msg.patient_id}`}</span>
                      {msg.sources?.length > 0 && (
                        <span className="assistant-patient-context-meta">
                          {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <>
                      <SourceCitationPanel
                        sources={msg.sources}
                        confidence={msg.confidence}
                        warnings={msg.warnings}
                        retrieval_type={msg.retrieval_type}
                        locale="fr"
                      />
                      <div className="assistant-message-tools">
                        <span>{msg.model || 'RhumatoAI'}</span>
                        {msg.tokens ? <span>{msg.tokens} tokens</span> : null}
                        <button onClick={() => handleCopyMessage(msg.id, msg.content)}>
                          <FiCopy /> {copiedMessageId === msg.id ? 'Copié' : 'Copier'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="assistant-message assistant-message-bot" aria-live="polite">
                <div className="assistant-avatar"><FiLoader className="spinning" /></div>
                <div className="assistant-bubble assistant-loading-bubble">
                  <div className="loading-dots">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messageEndRef} />
          </div>
        </main>

        {error && (
          <div className="assistant-error-banner" role="alert">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}

        <footer className="assistant-composer-wrap">
          {attachment && (
            <div className="assistant-attachment-chip" title={attachment.name}>
              <FiPaperclip />
              <span>{attachment.name}</span>
              <small>{Math.ceil(attachment.size / 1024)} Ko</small>
              <button type="button" onClick={clearAttachment} aria-label="Retirer la pièce jointe">
                ×
              </button>
            </div>
          )}
          <div className="assistant-composer">
            <input
              ref={fileInputRef}
              type="file"
              className="assistant-file-input"
              accept=".pdf,.txt,.md,.csv,.json,.xml,.html,.log,text/*,application/pdf"
              onChange={handleAttachmentChange}
            />
            <button
              type="button"
              className="composer-icon-btn"
              aria-label="Joindre un fichier"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              <FiPaperclip />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question médicale..."
              disabled={loading}
              maxLength={2000}
              rows="1"
              aria-label="Zone de saisie de message"
            />
            <button type="button" className="composer-icon-btn" aria-label="Dictée vocale">
              <FiMic />
            </button>
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && !attachment)}
              className="composer-send-btn"
              aria-label="Envoyer le message"
            >
              {loading ? <FiLoader className="spinning" aria-hidden="true" /> : <FiSend aria-hidden="true" />}
            </button>
          </div>
          <p><FiZap /> RhumatoAI peut faire des erreurs. Vérifiez les informations importantes.</p>
        </footer>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer la conversation"
        message="Êtes-vous sûr de vouloir supprimer cette conversation ? Cette action est irréversible."
        onConfirm={handleConfirmDeleteHistory}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default Chat;
