import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiKeySet: Boolean(process.env.OPENAI_API_KEY) });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`CoolBlock API on http://localhost:${port}`));