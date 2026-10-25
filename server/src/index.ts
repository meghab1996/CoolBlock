import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiConfigured, describeAiError, modelName, recommend, sanitizeMessages, streamChat } from './ai.js';
import { getDataset, hasData, MissingDataError } from './data.js';
import { getWeather, historyYears, parseWeatherRequest, WeatherRangeError, type WeatherRequest } from './weather.js';
import type { Weather } from './types.js';
import { foodNear } from './food.js';

const app = express();
app.use(express.json({ limit: '200kb' }));

/** Weather is optional context for the AI: if Open-Meteo is down, answer anyway. */
async function weatherOrNull(req: WeatherRequest): Promise<Weather | null> {
  try {
    return await getWeather(req);
  } catch (err) {
    console.warn('Weather unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}

function parseCode(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasData: hasData(), ai: { configured: aiConfigured(), model: modelName() }, weatherYears: historyYears() });
});

app.get('/api/areas', (_req, res) => {
  const { areas, boundaries } = getDataset();
  res.json({ ...areas, boundaries });
});

app.get('/api/points', (_req, res) => {
  res.json(getDataset().points);
});

app.get('/api/weather', async (req, res) => {
  try {
    res.json(await getWeather(parseWeatherRequest(req.query)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(err instanceof WeatherRangeError ? 400 : 502).json({ error: `Weather unavailable: ${message}` });
  }
});

app.get('/api/food', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: 'Send lat and lng.' });
    return;
  }
  try {
    res.json({ places: await foodNear(lat, lng), source: 'OpenStreetMap contributors' });
  } catch (err) {
    res.status(502).json({ error: `Food places unavailable: ${err instanceof Error ? err.message : String(err)}` });
  }
});



app.post('/api/ai/chat', async (req, res) => {
  const messages = sanitizeMessages(req.body?.messages);
  if (!messages.length || messages.at(-1)!.role !== 'user') {
    res.status(400).json({ error: 'Send at least one user message.' });
    return;
  }
  try {
    const ds = getDataset();
    const weather = await weatherOrNull(parseWeatherRequest(req.body?.weather));
    await streamChat(req, res, { ds, weather, messages, selectedCode: parseCode(req.body?.selectedCode) });
  } catch (err) {
    if (err instanceof MissingDataError) throw err;
    const { status, message } = describeAiError(err);
    console.error('AI chat failed:', message);
    if (res.headersSent) res.end(`\n\n⚠ ${message}`);
    else res.status(status).json({ error: message });
  }
});

app.post('/api/ai/recommend', async (req, res) => {
  const code = parseCode(req.body?.code);
  if (!code) {
    res.status(400).json({ error: 'Pick an arrondissement (1–20).' });
    return;
  }
  try {
    const ds = getDataset();
    const weather = await weatherOrNull(parseWeatherRequest(req.body?.weather));
    const lang = req.body?.lang === 'fr' ? 'fr' : 'en';
    res.json(await recommend({ ds, weather, code, lang }));
  } catch (err) {
    if (err instanceof MissingDataError) throw err;
    const { status, message } = describeAiError(err);
    console.error('AI recommendation failed:', message);
    res.status(status).json({ error: message });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// After `npm run build`, the server also serves the dashboard on one port.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(clientDist, 'index.html')) : next()));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof MissingDataError) {
    res.status(503).json({ error: err.message, code: 'NO_DATA' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`CoolBlock API on http://localhost:${port}`);
  if (!hasData()) console.log('  ⚠ No data yet: run `npm run data`.');
  console.log(aiConfigured() ? `  AI: ${modelName()}` : '  ⚠ AI off: add OPENAI_API_KEY to server/.env');
});