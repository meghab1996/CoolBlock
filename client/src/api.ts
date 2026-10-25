import type { AreasResponse, ChatMessage, CoolingPoint, Health, Recommendation, Weather, WeatherSelection } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Can't reach the CoolBlock server. Is `npm run dev` still running?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (HTTP ${res.status})`, body.code);
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<Health>('/api/health'),
  areas: () => request<AreasResponse>('/api/areas'),
  points: () => request<CoolingPoint[]>('/api/points'),
  weather: (w: WeatherSelection) => request<Weather>(`/api/weather?mode=${w.mode}&year=${w.year}`),

  recommend: (body: { code: number; lang: 'en' | 'fr'; weather: WeatherSelection }) =>
    request<{ recommendation: Recommendation; cached: boolean }>('/api/ai/recommend', post(body)),

  /** Streams the assistant's answer, calling onText with each new piece. */
  async chat(
    body: { messages: ChatMessage[]; selectedCode: number | null; weather: WeatherSelection },
    onText: (chunk: string) => void,
    signal: AbortSignal,
  ) {
    let res: Response;
    try {
      res = await fetch('/api/ai/chat', { ...post(body), signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      throw new ApiError("Can't reach the CoolBlock server. Is `npm run dev` still running?");
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new ApiError(j.error ?? `Request failed (HTTP ${res.status})`);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onText(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') throw err;
    }
  },
};