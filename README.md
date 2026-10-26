# CoolBlock

**Where Paris needs cooling most, by arrondissement.**

CoolBlock is a web app about heat in Paris. It ranks the 20 arrondissements by how easy it is to reach a cool place: cool green spaces, cool public buildings, drinking fountains and trees. It shows those figures next to the May–June weather, and uses the OpenAI API to explain the numbers and draft recommendations for the city. On a phone, it finds the nearest cool spot and walks you there.

Built for **DevDay Exchange Community: Paris**, a community hackathon (October 2026).

## Features

**For planners**

- **Map** of the 20 arrondissements, coloured by a cooling access score, with layers for cool green spaces, cool facilities and drinking fountains, and a filter for green spaces open at night
- **Weather**: observed daily weather for 1 May – 30 June of recent years, or the live 7-day forecast. Heatwaves are detected automatically
- **Ranking** of the arrondissements, weakest first, and a detail view comparing each one with the Paris median
- **AI recommendation**: one click drafts an action plan for an arrondissement in English or French, based only on its figures, with a printable report (save as PDF)
- **Compare** two arrondissements side by side
- **Ask AI**: a chat about the data, in English or French, with streamed answers

**For people on the street (works on phones)**

- **Nearest cool spot** from your location, with walking directions in Google Maps
- **Share** a spot by WhatsApp, text message or your phone's share menu
- **Food nearby**: Uber Eats and Deliveroo buttons, plus cafés, bakeries and ice-cream shops within 500 m from OpenStreetMap
- **Games while you wait in the shade**: Ludo and Texas Hold'em poker against the computer (play chips only), and Minesweeper

## Tech stack

- **Client:** React 19, TypeScript, Vite, Leaflet (react-leaflet)
- **Server:** Node.js, Express 5, TypeScript (tsx)
- **AI:** OpenAI API (Responses API, with streaming for the chat and structured outputs for recommendations)
- **Data:** Paris open data, Open-Meteo, OpenStreetMap (Overpass API)

## Getting started

You need **Node.js 20.19 or newer** (`node -v`) and an **OpenAI API key** from [platform.openai.com](https://platform.openai.com/api-keys).

```bash
git clone <this repository's URL>
cd coolblock
npm install
```

Create `server/.env` from the example:

```bash
# Windows (PowerShell)
Copy-Item server\.env.example server\.env
# macOS / Linux
cp server/.env.example server/.env
```

Open `server/.env` and paste your key after `OPENAI_API_KEY=`. Then:

```bash
npm run data   # downloads Paris open data and builds the score (about a minute)
npm run dev    # starts the server and the app
```

Open **http://localhost:5173**.

### Use it on your phone

Your phone and computer must be on the same Wi-Fi.

```bash
npm run dev:phone
```

Open the **Network** address it prints (`https://192.168.x.x:5173`) on your phone. It uses a self-signed certificate, so accept the browser warning once. HTTPS is needed for location and sharing.

### One-port build

```bash
npm run build
npm start      # everything on http://localhost:3001
```

## Configuration

`server/.env`:

| Variable | What it does | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Your OpenAI key. It stays on the server and never reaches the browser. | required |
| `OPENAI_MODEL` | Any model your account can use | `gpt-5.4-mini` |
| `OPENAI_REASONING_EFFORT` | For reasoning models: `none` to `high`. Delete it if your model doesn't support it. | `low` |
| `AI_CACHE` | `on` saves AI answers to `server/data/ai-cache.json` and replays identical questions instantly, even offline | `on` |
| `PORT` | Server port | `3001` |
| `OVERPASS_URL` | Another Overpass API server for food places, if the main one is busy | overpass-api.de |

`client/.env.local` (optional):

| Variable | What it does |
| --- | --- |
| `VITE_CARTO_KEY` | Free key from [CARTO](https://carto.com/basemaps/apikey) for CARTO's light map background. Without it, the map uses OpenStreetMap's map in grey. |

## How it works

### The cooling access score

`npm run data` (`server/scripts/build-data.ts`) downloads these City of Paris datasets and places every point in its arrondissement:

- [Arrondissements](https://opendata.paris.fr/explore/dataset/arrondissements/) (boundaries)
- [Îlots de fraîcheur: espaces verts frais](https://opendata.paris.fr/explore/dataset/ilots-de-fraicheur-espaces-verts-frais/) (cool green spaces, with night opening)
- [Îlots de fraîcheur: équipements et activités](https://opendata.paris.fr/explore/dataset/ilots-de-fraicheur-equipements-activites/) (pools, misting points, museums and more)
- [Fontaines à boire](https://opendata.paris.fr/explore/dataset/fontaines-a-boire/) (drinking fountains, leaving out those marked unavailable)
- [Les arbres](https://opendata.paris.fr/explore/dataset/les-arbres/) (city-managed trees, counted per arrondissement)

Each arrondissement gets four indicators: cool spots per km², fountains per km², share of land that is cool green space, and trees per km². Each indicator becomes a percentile rank among the 20 arrondissements. The score out of 100 is their average, so it is relative to the rest of Paris: higher means better access to cooling.

### Weather

Daily weather for central Paris comes from [Open-Meteo](https://open-meteo.com/): the historical archive for May–June (saved to `server/data/weather/`, so a year you've opened once works offline) and the forecast for the next 7 days. A heatwave is flagged when there are at least 3 days in a row at 31 °C or more by day and 21 °C or more at night, a simplified version of Météo-France's thresholds for Paris.

### AI

All OpenAI calls happen on the server (`server/src/ai.ts`), so the key never reaches the browser.

- With only 20 arrondissements, every request sends the whole table as context: scores, indicators, city medians, method, caveats and the selected weather. There's no vector database.
- The system prompt tells the model to quote the figures and never invent data.
- `POST /api/ai/chat` streams the answer as it is written.
- `POST /api/ai/recommend` returns JSON that matches a schema, so the app can lay out findings, actions, timing and cost reliably.

### Food places

`GET /api/food` asks OpenStreetMap's Overpass API for named restaurants, cafés, fast food, ice-cream shops, bakeries and pastry shops within 500 m, keeps the nearest 8 and caches the answer for 30 minutes. Uber Eats and Deliveroo don't offer public APIs for listing restaurants, so the app links to them instead.

## Record a demo video

With the app running (`npm run dev`), this script clicks through every feature with captions and saves `demo/coolblock-demo.mp4`, about 2 minutes long:

```bash
npm install -D playwright ffmpeg-static   # once
npx playwright install chromium           # once
node demo/record-demo.mjs
```

Run it twice: the second time the AI answers come from the cache, so there are no pauses. Edit the captions in `TEXT` at the top of the script.

## Project structure

```
coolblock/
  package.json              npm run dev / dev:phone / data / build / start / typecheck
  demo/record-demo.mjs      records the demo video
  server/
    .env.example            copy to .env and add your key
    scripts/build-data.ts   downloads open data and computes the score
    src/index.ts            Express routes (/api/...)
    src/ai.ts               OpenAI: prompt, context, chat stream, recommendations, cache
    src/weather.ts          Open-Meteo history and forecast
    src/food.ts             food places from OpenStreetMap
    src/data.ts             loads the generated data
    src/types.ts            types shared with the client
    data/                   generated files (safe to delete and rebuild)
  client/
    src/App.tsx             layout and state
    src/components/         map, weather, ranking, area, compare, AI chat, report, share, food
    src/games/              Ludo, Minesweeper and Poker (rules and screens)
    src/lib/                formatting, maps and directions, sharing, food
    src/styles.css
```

## Limitations

- The score is relative: it compares arrondissements with each other, not with a fixed standard.
- It only counts places listed in the City's datasets. Private air-conditioned spaces, shaded streets and courtyards aren't included.
- The 12e and 16e include the Bois de Vincennes and the Bois de Boulogne, which lowers their densities.
- There's no surface temperature or population data yet, so the score shows access to cooling, not who is most at risk.
- AI recommendations are drafts to check, not official advice.

## Data and credits

- City of Paris open data, [opendata.paris.fr](https://opendata.paris.fr/)
- Weather data by [Open-Meteo.com](https://open-meteo.com/)
- Map data and food places © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- AI by the [OpenAI API](https://platform.openai.com/)

Built by **Megha Bhatt** ([github.com/meghab1996](https://github.com/meghab1996)).
