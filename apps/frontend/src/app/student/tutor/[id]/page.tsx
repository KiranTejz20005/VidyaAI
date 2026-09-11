'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Send,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  BrainCircuit,
  Lightbulb,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useTutorStore } from '@/store/tutor.store';
import { useTutorSocket } from '@/hooks/useTutorSocket';
import { Card } from '@/design-system/Card';
import { Button } from '@/design-system/Button';
import { LoadingState } from '@/design-system/LoadingState';
import { ErrorState } from '@/design-system/ErrorState';
import type { TutorSessionDetail, TutorMessage } from '@/types/tutor.types';
import { getSession, sendChatMessage, closeSession, generateFlashcards } from '@/services/tutor.service';
import { FlashcardModal } from '@/components/ui/FlashcardModal';
import {
  Message,
  MessageAvatar,
  MessageStack,
  MessageContent,
  MessageMarkdown,
  MessageActions,
  MessageActionGroup,
  MessageAction,
} from '@/components/ui/Message';
import {
  Citation,
  CitationTrigger,
  CitationContent,
  CitationItem,
  CitationSource,
} from '@/components/ui/Citation';
import { FeedbackBar } from '@/components/ui/FeedbackBar';
import { TextShimmer } from '@/components/ui/TextShimmer';

export default function TutorChatPage() {
  const { id } = useParams() as { id: string };
  const { user } = useAuthStore();
  const router = useRouter();

  const lastQueryRef = useRef('');

  const activeStream = useTutorStore((s) => s.activeStream);
  const startStream = useTutorStore((s) => s.startStream);
  const resetStream = useTutorStore((s) => s.resetStream);

  const [session, setSession] = useState<TutorSessionDetail | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'standard' | 'hint' | 'socratic'>('standard');
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);

  const socketCallbacks = useMemo(
    () => ({
      onStreamComplete: (message: TutorMessage) => {
        setMessages((prev) => [...prev, message]);
        setIsSending(false);
      },
      onStreamError: async (error: string) => {
        try {
          if (lastQueryRef.current) {
            const res = await sendChatMessage(id, lastQueryRef.current, mode);
            const assistantMsg: TutorMessage = {
              id: res.messageId || 'msg-fallback',
              sessionId: id,
              role: 'ASSISTANT',
              content: res.message,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
        } catch {
          toast.error(error || 'Streaming failed');
        } finally {
          useTutorStore.getState().resetStream();
          setIsSending(false);
        }
      },
    }),
    [id, mode]
  );

  const { streamQuery } = useTutorSocket(id, socketCallbacks);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSession(id);
      setSession(data);
      setMessages(data.messages || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load tutor session');
      toast.error('Could not load session');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user) {
      fetchSession();
    }
  }, [fetchSession, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeStream?.content]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = inputValue.trim();
    if (!query || isSending) return;

    const reqId = `req-${Date.now()}`;
    const optimisticId = `msg-${Date.now()}`;

    lastQueryRef.current = query;
    setInputValue('');
    setIsSending(true);

    const userMessage: TutorMessage = {
      id: `temp-${Date.now()}`,
      sessionId: id,
      role: 'USER',
      content: query,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      startStream(reqId, optimisticId);
      const transport = await streamQuery(query, mode, reqId);
      if (transport === 'http') {
        const res = await sendChatMessage(id, query, mode);
        const assistantMsg: TutorMessage = {
          id: res.messageId || `msg-${Date.now()}`,
          sessionId: id,
          role: 'ASSISTANT',
          content: res.message,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        resetStream();
        setIsSending(false);
      }
    } catch {
      try {
        const res = await sendChatMessage(id, query, mode);
        const assistantMsg: TutorMessage = {
          id: res.messageId || `msg-${Date.now()}`,
          sessionId: id,
          role: 'ASSISTANT',
          content: res.message,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        toast.error('Failed to send message');
      } finally {
        resetStream();
        setIsSending(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCloseSession = async () => {
    if (!confirm('Are you sure you want to end this tutor session?')) return;
    try {
      await closeSession(id);
      toast.success('Session ended');
      fetchSession();
    } catch {
      toast.error('Failed to end session');
    }
  };

  const streamingMessage: TutorMessage | null = activeStream
    ? {
        id: 'streaming-assistant',
        sessionId: id,
        role: 'ASSISTANT',
        content: activeStream.content,
        isStreaming: true,
        createdAt: new Date().toISOString(),
        sources: activeStream.sources,
        ragReferences: activeStream.ragReferences,
      }
    : null;

  const displayMessages = (streamingMessage ? [...messages, streamingMessage] : messages).filter(
    (m) => m.isStreaming || Boolean(m.content && m.content.trim().length > 0)
  );

  if (isLoading) return <LoadingState lines={8} />;
  if (error || !session) return <ErrorState message={error || 'Session not found'} onRetry={fetchSession} />;

  return (
    <div className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6 -mb-4 sm:-mb-6 flex flex-col h-[calc(100vh-65px)] bg-neutral-50/60 overflow-hidden">
      {/* ── 1. Top Glassmorphic Navigation Header ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-3.5 bg-white/90 backdrop-blur-md border-b border-neutral-200/80 shadow-xs">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href="/student/tutor"
            className="w-9 h-9 rounded-xl bg-neutral-100 hover:bg-neutral-200/80 text-neutral-600 flex items-center justify-center transition-all shrink-0 active:scale-95"
            title="Back to AI Tutor Sessions"
          >
            <ArrowLeft size={18} />
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-neutral-900 truncate tracking-tight">{session.subject}</h1>
              {session.status === 'ACTIVE' ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200 shrink-0">
                  Closed
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 truncate mt-0.5">
              AI Tutor &middot; <span className="font-medium text-neutral-700 capitalize">{session.tutorMode}</span> Mode
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFlashcardModalOpen(true)}
            className="text-amber-700 bg-amber-50/80 hover:bg-amber-100 border-amber-200 text-xs font-semibold rounded-xl h-9 px-3 transition-all"
          >
            <Lightbulb size={14} className="mr-1.5 text-amber-600" /> Flashcards
          </Button>

          {session.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseSession}
              className="text-rose-700 bg-rose-50/80 hover:bg-rose-100 border-rose-200 text-xs font-semibold rounded-xl h-9 px-3 transition-all"
            >
              End Session
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { restartSession } = await import('@/services/tutor.service');
                  await restartSession(id);
                  toast.success('Session restarted');
                  fetchSession();
                } catch {
                  toast.error('Failed to restart session');
                }
              }}
              className="text-xs font-semibold rounded-xl h-9 px-3"
            >
              <RotateCcw size={14} className="mr-1.5" /> Restart Session
            </Button>
          )}
        </div>
      </header>

      {/* ── 2. Scrollable Chat Canvas ── */}
      <div className="flex-1 overflow-y-auto w-full px-4 sm:px-8 py-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {displayMessages.length === 0 ? (
            <div className="m-auto text-center text-neutral-500 py-20 bg-white rounded-3xl border border-neutral-200/80 p-8 shadow-xs max-w-lg">
              <div className="w-16 h-16 bg-orange-100 text-[#e05934] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                <Sparkles size={32} />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 mb-1.5">Ready to learn together?</h3>
              <p className="text-sm text-neutral-600 max-w-md mx-auto leading-relaxed">
                Ask any question about <span className="font-semibold text-neutral-900">{session.subject}</span> to begin your personalized learning session. Toggle Standard, Hint, or Socratic mode below.
              </p>
            </div>
          ) : (
            displayMessages.map((msg, idx) => {
              const isUser = msg.role === 'USER';
              const sources = msg.sources ?? [];

              return (
                <Message key={msg.id || idx} from={isUser ? 'user' : 'assistant'} className="text-sm sm:text-base">
                  {!isUser && <MessageAvatar isAssistant={true} className="w-9 h-9" />}

                  <MessageStack className="max-w-full">
                    <MessageContent from={isUser ? 'user' : 'assistant'} className="text-neutral-800 leading-relaxed text-sm sm:text-base">
                      <MessageMarkdown>{msg.content}</MessageMarkdown>

                      {msg.isStreaming && !msg.content && (
                        <TextShimmer className="text-xs sm:text-sm italic">Tutor is generating thoughtful explanation...</TextShimmer>
                      )}

                      {/* RAG Grounded Sources Citations */}
                      {!isUser && sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-neutral-200/80 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-neutral-500">Verified Curriculum Sources:</span>
                          {sources.map((s, sIdx) => {
                            const citation: CitationSource = {
                              title: s.filename,
                              description: s.excerpt,
                              chapter: s.topic,
                            };
                            return (
                              <Citation key={s.chunkId || sIdx} citations={[citation]} index={sIdx + 1}>
                                <CitationTrigger className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs px-2.5 py-1 rounded-lg">
                                  <BookOpen className="w-3 h-3 text-orange-600" />
                                  <span>{s.filename}</span>
                                </CitationTrigger>
                                <CitationContent>
                                  <CitationItem />
                                </CitationContent>
                              </Citation>
                            );
                          })}
                        </div>
                      )}

                      {!isUser && !sources.length && !!msg.ragReferences && (
                        <div className="mt-3 pt-2.5 border-t border-neutral-100 text-xs text-neutral-400 flex items-center gap-1.5">
                          <AlertCircle size={13} className="text-orange-500" /> Sourced from verified institution curriculum
                        </div>
                      )}
                    </MessageContent>

                    {/* Actions & Feedback */}
                    {!isUser && !msg.isStreaming && msg.content && (
                      <MessageActions className="pt-1">
                        <MessageActionGroup>
                          <MessageAction icon="copy" tooltip="Copy answer" />
                          <MessageAction icon="regenerate" tooltip="Regenerate explanation" onClick={() => handleSend()} />
                        </MessageActionGroup>
                        <FeedbackBar
                          targetId={msg.id}
                          targetType="tutor_message"
                          showCommentOption={false}
                          className="ml-auto"
                        />
                      </MessageActions>
                    )}
                  </MessageStack>

                  {isUser && (
                    <MessageAvatar
                      className="w-9 h-9"
                      src={user?.avatar || user?.avatarUrl || undefined}
                      fallback={user?.firstName?.[0]?.toUpperCase() || 'S'}
                    />
                  )}
                </Message>
              );
            })
          )}

          {isSending && !activeStream && (
            <div className="flex items-center gap-3 text-sm text-neutral-600 py-3 px-4 bg-orange-50/60 rounded-2xl border border-orange-100 max-w-md">
              <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#e05934] flex items-center justify-center shrink-0">
                <BrainCircuit size={16} className="animate-pulse" />
              </div>
              <TextShimmer className="text-xs sm:text-sm font-medium">Connecting to AI Tutor neural stream...</TextShimmer>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── 3. Bottom Dock & Mode Selector Bar ── */}
      <footer className="sticky bottom-0 z-20 bg-white border-t border-neutral-200/80 px-4 sm:px-8 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto space-y-3">
          {session.status === 'ACTIVE' ? (
            <>
              {/* Mode Switcher Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setMode('standard')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    mode === 'standard'
                      ? 'bg-[#e05934] text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80'
                  }`}
                >
                  <Sparkles size={13} /> Standard
                </button>
                <button
                  type="button"
                  onClick={() => setMode('hint')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    mode === 'hint'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80'
                  }`}
                >
                  <Lightbulb size={13} /> Hint Mode
                </button>
                <button
                  type="button"
                  onClick={() => setMode('socratic')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    mode === 'socratic'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80'
                  }`}
                >
                  <BrainCircuit size={13} /> Socratic Mode
                </button>
              </div>

              {/* Prompt Input Form */}
              <form onSubmit={handleSend} className="relative flex items-end gap-2">
                <div className="relative flex-1">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask a question in ${mode} mode...`}
                    disabled={isSending}
                    rows={1}
                    className="w-full resize-none rounded-2xl border border-neutral-300 bg-neutral-50/50 px-4 py-3.5 text-sm sm:text-base text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:outline-none max-h-36 min-h-[52px] transition-all"
                  />
                  <span className="hidden sm:inline-block absolute right-3 bottom-2.5 text-[11px] font-medium text-neutral-400 pointer-events-none">
                    Press <kbd className="px-1 py-0.5 bg-neutral-200/70 rounded text-[10px] text-neutral-600 font-sans">Enter ↵</kbd> to send
                  </span>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={!inputValue.trim() || isSending}
                  className="h-[52px] w-[52px] bg-[#e05934] hover:bg-[#c94a2a] text-white rounded-2xl shrink-0 flex items-center justify-center shadow-md transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Send size={18} />
                </Button>
              </form>
            </>
          ) : (
            <div className="p-3 text-center text-xs sm:text-sm font-medium text-neutral-500 bg-neutral-100 rounded-xl border border-neutral-200">
              This session has ended. Click &quot;Restart Session&quot; above to continue learning.
            </div>
          )}
        </div>
      </footer>

      <FlashcardModal
        open={isFlashcardModalOpen}
        onClose={() => setIsFlashcardModalOpen(false)}
        fetchFlashcards={() => generateFlashcards(id)}
      />
    </div>
  );
}
