/**
 * OpenAI integration.
 *
 * - The API key is read from server/.env and never leaves the server.
 * - Every request sends the full arrondissement table (20 rows) as context,
 *   so answers are grounded in CoolBlock's data without a vector database.
 * - /api/ai/chat streams plain text; /api/ai/recommend returns structured JSON.
 * - Answers can be cached to data/ai-cache.json so a rehearsed demo works offline.
 */
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { DATA_DIR, type Dataset } from './data.js';
import type { Area, Weather } from './types.js';

// ---------- configuration ----------

export class AiConfigError extends Error {}

export function aiConfigured() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return Boolean(key) && !key!.includes('your-key');
}

export function modelName() {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
}

const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;
type Effort = (typeof EFFORTS)[number];

function reasoningOption(): { reasoning?: { effort: Effort } } {
  const effort = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  return EFFORTS.includes(effort as Effort) ? { reasoning: { effort: effort as Effort } } : {};
}

let client: OpenAI | null = null;
function getClient() {
  if (!aiConfigured()) {
    throw new AiConfigError('OPENAI_API_KEY is missing. Copy server/.env.example to server/.env, add your key, then restart `npm run dev`.');
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Turns OpenAI errors into messages a person can act on. */
export function describeAiError(err: unknown): { status: number; message: string } {
  if (err instanceof AiConfigError) return { status: 503, message: err.message };
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) return { status: 502, message: 'OpenAI rejected the API key (401). Check OPENAI_API_KEY in server/.env.' };
    if (err.status === 429) return { status: 502, message: 'OpenAI rate limit or quota reached (429). Check usage and billing on platform.openai.com.' };
    if (err.status === 404) return { status: 502, message: `The model "${modelName()}" isn't available to this key. Change OPENAI_MODEL in server/.env.` };
    if (err.status === 400 && /reasoning/i.test(err.message)) {
      return { status: 502, message: 'This model does not support reasoning effort. Remove OPENAI_REASONING_EFFORT from server/.env.' };
    }
    return { status: 502, message: `OpenAI error${err.status ? ` (${err.status})` : ''}: ${err.message}` };
  }
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}

// ---------- answer cache ----------

const CACHE_FILE = path.join(DATA_DIR, 'ai-cache.json');
const cacheOn = () => (process.env.AI_CACHE ?? 'on').toLowerCase() !== 'off';
let cache: Record<string, string> | null = null;

function loadCache() {
  if (cache) return cache;
  try {
    cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function cacheKey(kind: string, payload: unknown) {
  return createHash('sha256').update(JSON.stringify({ kind, model: modelName(), payload })).digest('hex').slice(0, 32);
}

function cacheGet(key: string) {
  return cacheOn() ? loadCache()[key] : undefined;
}

async function cacheSet(key: string, value: string) {
  if (!cacheOn()) return;
  loadCache()[key] = value;
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2)).catch(() => {});
}

// ---------- context ----------

const SYSTEM_PROMPT = `You are CoolBlock's planning assistant. You help City of Paris staff decide where to act on urban heat and cooling access.

Rules:
- Base every claim about a specific arrondissement on the CoolBlock data below, and quote the figures you use (for example "4.1 fountains per km² against a city median of 6.3").
- You may add general urban-heat practice (tree planting, shade structures, cool roofs, opening schoolyards as "cours Oasis", misting, opening parks at night), but say it is general practice rather than something the data shows.
- Never invent data, datasets or sources. If the data can't answer, say so and name what would be needed (for example surface temperature or the number of residents over 75).
- Keep the caveats in mind and mention one when it changes the conclusion.
- The weather block is either a 7-day forecast or observed weather from May–June of a past year. For past weather, talk about it as what happened (for example "during the 24–28 June heatwave") and use it to explain which areas would have needed cooling most.
- Reply in the language the user writes in (French or English).
- Keep answers under about 200 words unless asked for more. Use short paragraphs or bullets. No tables unless asked.`;

function areaRow(a: Area) {
  return {
    code: a.code,
    name: `${a.name} (${a.label})`,
    score: a.index.score,
    gapRank: a.index.gapRank,
    areaKm2: a.areaKm2,
    coolGreenSpaces: a.greenSpaces,
    nightOpenCoolGreenSpaces: a.nightOpenGreenSpaces,
    coolFacilities: a.facilities,
    drinkingFountains: a.fountains,
    cityTrees: a.trees,
    coolGreenSharePct: a.coolGreenSharePct,
    perKm2: a.perKm2,
    indicatorScores: a.index.components,
  };
}

function median(values: (number | null)[]) {
  const s = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

function weatherText(w: Weather | null) {
  if (!w) return 'Weather: unavailable right now.';
  const { stats } = w;
  const lines = [
    `Weather, ${w.periodLabel} (${w.source}):`,
    w.current ? `Now ${Math.round(w.current.temp)} °C (feels like ${Math.round(w.current.feelsLike)} °C), humidity ${w.current.humidity}%.` : '',
    `Heat level: ${w.heat.label}. ${w.heat.detail}`,
    `Days at 30 °C or more: ${stats.hotDays}. Nights at 20 °C or more: ${stats.tropicalNights}. ` +
      `Hottest day: ${stats.hottestDay.date} (${stats.hottestDay.max} °C). Warmest night: ${stats.warmestNight.date} (${stats.warmestNight.min} °C).`,
    `Daily min/max °C: ${w.daily.map((d) => `${d.date.slice(5)} ${Math.round(d.min)}/${Math.round(d.max)}`).join(', ')}.`,
  ];
  return lines.filter(Boolean).join('\n');
}

function weatherKey(w: Weather | null) {
  return w ? `${w.mode}:${w.periodLabel}` : 'none';
}

export function buildContext(ds: Dataset, weather: Weather | null, selectedCode: number | null) {
  const { areas, method, caveats, sources, generatedAt } = ds.areas;
  const selected = areas.find((a) => a.code === selectedCode);
  const medians = {
    score: median(areas.map((a) => a.index.score)),
    coolSpotsPerKm2: median(areas.map((a) => a.perKm2.coolingSpots)),
    fountainsPerKm2: median(areas.map((a) => a.perKm2.fountains)),
    treesPerKm2: median(areas.map((a) => a.perKm2.trees)),
    coolGreenSharePct: median(areas.map((a) => a.coolGreenSharePct)),
  };
  return [
    '# CoolBlock data: Paris, by arrondissement',
    `Built ${generatedAt.slice(0, 10)} from City of Paris open data.`,
    `Method: ${method}`,
    `Caveats:\n- ${caveats.join('\n- ')}`,
    `Sources: ${sources.map((s) => `${s.title} (${s.url})`).join('; ')}`,
    `City medians: ${JSON.stringify(medians)}`,
    weatherText(weather),
    selected
      ? `The user has the ${selected.name} arrondissement (${selected.label}) selected on the map. Assume "here" or "this area" means it.`
      : 'No arrondissement is selected on the map.',
    'Arrondissements (JSON):',
    JSON.stringify(areas.map(areaRow)),
  ].join('\n\n');
}

// ---------- chat (streaming) ----------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m): m is ChatMessage => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

export async function streamChat(
  req: Request,
  res: Response,
  opts: { ds: Dataset; weather: Weather | null; messages: ChatMessage[]; selectedCode: number | null },
) {
  const { ds, weather, messages, selectedCode } = opts;
  const key = cacheKey('chat', { messages, selectedCode, weather: weatherKey(weather), data: ds.areas.generatedAt });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const hit = cacheGet(key);
  if (hit) {
    res.setHeader('X-CoolBlock-Cache', 'hit');
    res.end(hit);
    return;
  }

  // Errors thrown here (bad key, unknown model) reach the route's catch
  // before any bytes are sent, so the client gets a JSON error.
  const stream = await getClient().responses.create({
    model: modelName(),
    instructions: `${SYSTEM_PROMPT}\n\n${buildContext(ds, weather, selectedCode)}`,
    input: messages,
    stream: true,
    ...reasoningOption(),
  });

  // Stop paying for tokens if the person closes the tab or presses Stop.
  res.on('close', () => {
    if (!res.writableEnded) stream.controller.abort();
  });
  req.socket.setNoDelay(true);
  res.flushHeaders();

  let full = '';
  try {
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        full += event.delta;
        res.write(event.delta);
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
  } catch (err) {
    if (!res.writableEnded && !res.destroyed) res.write(`\n\n⚠ The answer was cut off: ${describeAiError(err).message}`);
    res.end();
    return;
  }
  res.end();
  if (full.trim()) await cacheSet(key, full);
}

// ---------- recommendation (structured output) ----------

export interface Recommendation {
  headline: string;
  summary: string;
  findings: { finding: string; evidence: string }[];
  interventions: {
    title: string;
    description: string;
    rationale: string;
    timeframe: 'Quick win (this summer)' | 'Medium term (1–3 years)' | 'Long term (3+ years)';
    cost: 'Low' | 'Medium' | 'High';
  }[];
  dataGaps: string[];
}

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'findings', 'interventions', 'dataGaps'],
  properties: {
    headline: { type: 'string', description: 'One plain sentence, at most 15 words.' },
    summary: { type: 'string', description: 'Two or three sentences for a city planner.' },
    findings: {
      type: 'array',
      description: 'Two to four findings drawn from the data.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['finding', 'evidence'],
        properties: {
          finding: { type: 'string' },
          evidence: { type: 'string', description: 'The exact figures from the data, compared with the city median.' },
        },
      },
    },
    interventions: {
      type: 'array',
      description: 'Three to five interventions, quickest first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'rationale', 'timeframe', 'cost'],
        properties: {
          title: { type: 'string', description: 'Short action, starting with a verb.' },
          description: { type: 'string' },
          rationale: { type: 'string', description: 'Which finding this addresses and why it helps.' },
          timeframe: { type: 'string', enum: ['Quick win (this summer)', 'Medium term (1–3 years)', 'Long term (3+ years)'] },
          cost: { type: 'string', enum: ['Low', 'Medium', 'High'] },
        },
      },
    },
    dataGaps: {
      type: 'array',
      description: 'One to three missing datasets that would make this recommendation more reliable.',
      items: { type: 'string' },
    },
  },
} as const;

export async function recommend(opts: { ds: Dataset; weather: Weather | null; code: number; lang: 'en' | 'fr' }) {
  const { ds, weather, code, lang } = opts;
  const area = ds.areas.areas.find((a) => a.code === code);
  if (!area) throw new Error(`Unknown arrondissement ${code}`);

  const key = cacheKey('recommend', { code, lang, weather: weatherKey(weather), data: ds.areas.generatedAt });
  const hit = cacheGet(key);
  if (hit) return { recommendation: JSON.parse(hit) as Recommendation, cached: true };

  const response = await getClient().responses.create({
    model: modelName(),
    instructions: `${SYSTEM_PROMPT}\n\n${buildContext(ds, weather, code)}`,
    input: `Draft a short planning recommendation for the ${area.name} arrondissement (${area.label}). Compare it with the city medians, focus on its weakest indicators, relate it to the heat in the weather period provided, and suggest realistic interventions for the City of Paris. Write every field in ${lang === 'fr' ? 'French' : 'English'}.`,
    text: { format: { type: 'json_schema', name: 'recommendation', strict: true, schema: RECOMMENDATION_SCHEMA } },
    ...reasoningOption(),
  });

  const recommendation = JSON.parse(response.output_text) as Recommendation;
  await cacheSet(key, JSON.stringify(recommendation));
  return { recommendation, cached: false };
}