import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Markdown from 'react-markdown';
import { api } from '../api';
import type { Area, ChatMessage, Weather, WeatherSelection } from '../types';

interface Props {
  aiReady: boolean;
  model?: string;
  selectedArea: Area | null;
  weather: Weather | null;
  weatherSel: WeatherSelection;
}

export default function AiAssistant({ aiReady, model, selectedArea, weather, weatherSel }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const suggestions = [
    'Which three arrondissements should the city help first during a heatwave, and why?',
    selectedArea ? `Why does the ${selectedArea.name} score the way it does?` : 'Where are drinking fountains most lacking?',
    "Quels arrondissements manquent le plus d'espaces verts ouverts la nuit ?",
  ];

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput('');
    const history: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.chat(
        { messages: history, selectedCode: selectedArea?.code ?? null, weather: weatherSel },
        (chunk) =>
          setMessages((m) => {
            const next = [...m];
            next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + chunk };
            return next;
          }),
        controller.signal,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages((m) => (m.at(-1)?.content ? m : m.slice(0, -1)));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const context = [weather ? `weather for ${weather.periodLabel}` : null, selectedArea ? `the ${selectedArea.name} selected` : null]
    .filter(Boolean)
    .join(' and ');

  return (
    <div className="assistant">
      <div className="assistant-head">
        <h2>Ask about the data</h2>
        <p className="muted small">
          Answers use the figures for all 20 arrondissements{context ? `, plus ${context}` : ''}.{model ? ` Model: ${model}.` : ''}
        </p>
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="suggestions">
            <p className="muted small">Try one of these:</p>
            {suggestions.map((s) => (
              <button key={s} className="suggestion" onClick={() => send(s)} disabled={!aiReady || busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <p className="msg-who">{m.role === 'user' ? 'You' : 'CoolBlock AI'}</p>
            {m.role === 'assistant' ? (
              m.content ? (
                <div className="md">
                  <Markdown>{m.content}</Markdown>
                </div>
              ) : (
                <p className="muted">Thinking…</p>
              )
            ) : (
              <p>{m.content}</p>
            )}
          </div>
        ))}
      </div>

      {error && <p className="notice">{error}</p>}
      {!aiReady && <p className="notice">Add your OpenAI key to server/.env and restart the server to use the assistant.</p>}

      <form className="chat-form" onSubmit={onSubmit}>
        <label className="visually-hidden" htmlFor="ask">
          Your question
        </label>
        <textarea
          id="ask"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask in English or French"
          disabled={!aiReady}
        />
        <div className="chat-actions">
          {messages.length > 0 && !busy && (
            <button type="button" className="ghost" onClick={() => setMessages([])}>
              Clear
            </button>
          )}
          {busy ? (
            <button type="button" className="ghost" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!aiReady || !input.trim()}>
              Ask
            </button>
          )}
        </div>
      </form>
    </div>
  );
}