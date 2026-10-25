import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Popup, ZoomControl, useMap } from 'react-leaflet';
import L, { type PathOptions } from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import type { Area, CoolingPoint, PointKind } from '../types';
import { POINT_STYLE, SCORE_BINS, SCORE_RAMP, scoreColor } from '../lib/format';
import { directionsUrl, distanceM, formatDistance, locate, nearestPoint } from '../lib/maps';
import SpotShare from './SpotShare';
import FoodNearby from './FoodNearby';
import BaseMap from './BaseMap';
import GamesOverlay from '../games/GamesOverlay';

export interface LayerState {
  green: boolean;
  facility: boolean;
  fountain: boolean;
  nightOnly: boolean;
}

interface Props {
  boundaries: FeatureCollection;
  areas: Area[];
  points: CoolingPoint[];
  selected: number | null;
  onSelect: (code: number | null) => void;
  layers: LayerState;
  onLayersChange: (l: LayerState) => void;
}

interface ActiveSpot {
  point: CoolingPoint;
  /** Metres from the user, once we know where they are. */
  distance?: number;
}

const PARIS: [number, number] = [48.8566, 2.3522];

// One canvas for all shapes and dots, with a larger tap area around each dot
// so cooling spots are easy to tap with a finger.
const renderer = L.canvas({ tolerance: 8 });

/** Fits Paris on load, then zooms to the selected arrondissement. */
function Framing({ boundaries, selected }: { boundaries: FeatureCollection; selected: number | null }) {
  const map = useMap();
  useEffect(() => {
    const all = L.geoJSON(boundaries);
    if (!selected) {
      map.fitBounds(all.getBounds(), { padding: [16, 16] });
      return;
    }
    const f = boundaries.features.find((x) => x.properties?.code === selected);
    if (f) map.flyToBounds(L.geoJSON(f).getBounds(), { padding: [90, 90], maxZoom: 13.25, duration: 0.6 });
  }, [map, boundaries, selected]);
  return null;
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export default function CoolingMap({ boundaries, areas, points, selected, onSelect, layers, onLayersChange }: Props) {
  const mapRef = useRef<L.Map>(null);
  const popupRef = useRef<L.Popup>(null);
  const [active, setActive] = useState<ActiveSpot | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [gamesOpen, setGamesOpen] = useState(false);
  const byCode = useMemo(() => new Map(areas.map((a) => [a.code, a])), [areas]);
  const hasNightData = points.some((p) => p.kind === 'green' && p.nightOpen !== undefined);

  const counts = useMemo(() => {
    const c: Record<PointKind, number> = { green: 0, facility: 0, fountain: 0 };
    points.forEach((p) => c[p.kind]++);
    return c;
  }, [points]);

  const visiblePoints = useMemo(
    () =>
      points.filter((p) => {
        if (!layers[p.kind]) return false;
        if (layers.nightOnly && p.kind === 'green') return p.nightOpen === true;
        return true;
      }),
    [points, layers],
  );

  // Messages disappear on their own after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  // The areas layer is mounted once and restyled in place. Re-mounting it would
  // draw the areas on top of the cooling-spot dots (they share one canvas).
  const geoRef = useRef<L.GeoJSON>(null);
  const latest = useRef({ selected, byCode, onSelect });
  latest.current = { selected, byCode, onSelect };

  const style = (f?: Feature): PathOptions => {
    const code = f?.properties?.code as number;
    const area = latest.current.byCode.get(code);
    const isSel = code === latest.current.selected;
    return {
      fillColor: area ? scoreColor(area.index.score) : '#ccc',
      fillOpacity: 0.55,
      color: isSel ? '#1d2830' : '#ffffff',
      weight: isSel ? 3 : 1.2,
    };
  };

  useEffect(() => {
    geoRef.current?.setStyle(style);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, byCode]);

  const onEachFeature = (f: Feature, layer: L.Layer) => {
    const code = f.properties?.code as number;
    const a = latest.current.byCode.get(code);
    if (a) {
      (layer as L.Path).bindTooltip(`<strong>${a.name}</strong> ${a.label}<br>Score ${a.index.score}/100`, { sticky: true, className: 'map-tip' });
    }
    layer.on({
      click: () => latest.current.onSelect(code),
      mouseover: (e) => (e.target as L.Path).setStyle({ weight: code === latest.current.selected ? 3 : 2.4, color: '#1d2830' }),
      mouseout: (e) => (e.target as L.Path).setStyle(style(f)),
    });
  };

  const toggle = (key: keyof LayerState) => onLayersChange({ ...layers, [key]: !layers[key] });

  // Stable values for the popup: if these changed on every render, the map would
  // close and reopen the card each time anything else on the page updates.
  const activePoint = active?.point;
  const popupPos = useMemo<[number, number] | null>(() => (activePoint ? [activePoint.lat, activePoint.lng] : null), [activePoint]);
  const popupEvents = useMemo(() => ({ remove: () => setActive(null) }), []);

  const openSpot = (point: CoolingPoint) => {
    setActive({ point, distance: userPos ? distanceM(userPos[0], userPos[1], point.lat, point.lng) : undefined });
  };

  /** Finds the user, then shows the closest cooling spot that is on the map. */
  async function findNearest() {
    setNotice(null);
    setLocating(true);
    try {
      const { lat, lng } = await locate();
      setUserPos([lat, lng]);
      // Use the spots currently shown; if every layer is off, use green spaces and facilities.
      const candidates = visiblePoints.length ? visiblePoints : points.filter((p) => p.kind !== 'fountain');
      const best = nearestPoint(candidates, lat, lng);
      if (!best) {
        setNotice('There are no cooling spots on the map to choose from.');
        return;
      }
      mapRef.current?.fitBounds(
        L.latLngBounds([
          [lat, lng],
          [best.point.lat, best.point.lng],
        ]),
        { padding: [80, 80], maxZoom: 16 },
      );
      setActive(best);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setLocating(false);
    }
  }

  return (
    // While a spot's card is open, the corner boxes and buttons are hidden (see styles.css)
    // so they never cover the card.
    <div className={`map-wrap${active ? ' popup-open' : ''}`}>
      <MapContainer
        ref={mapRef}
        center={PARIS}
        zoom={12}
        zoomSnap={0.25}
        preferCanvas
        renderer={renderer}
        zoomControl={false}
        className="map"
        minZoom={10}
      >
        <BaseMap />
        <GeoJSON ref={geoRef} key={`b-${areas.length}`} data={boundaries} style={style} onEachFeature={onEachFeature} />
        {visiblePoints.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={POINT_STYLE[p.kind].radius}
            pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: POINT_STYLE[p.kind].color, fillOpacity: 1 }}
            eventHandlers={{ click: () => openSpot(p) }}
          />
        ))}

        {userPos && (
          <>
            <CircleMarker center={userPos} radius={18} interactive={false} pathOptions={{ stroke: false, fillColor: '#1d2830', fillOpacity: 0.12 }} />
            <CircleMarker center={userPos} radius={7} interactive={false} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1d2830', fillOpacity: 1 }} />
          </>
        )}

        {active && popupPos && (
          <Popup
            ref={popupRef}
            key={active.point.id}
            position={popupPos}
            maxHeight={420}
            autoPanPadding={[16, 16]}
            eventHandlers={popupEvents}
          >
            <div className="spot-popup">
              <strong>{active.point.name}</strong>
              <span className="muted">
                {active.point.type}
                {active.point.nightOpen ? ', open at night' : ''}
              </span>
              {active.distance !== undefined && <span>{formatDistance(active.distance)} from you</span>}
              <a className="navigate" href={directionsUrl(active.point.lat, active.point.lng)} target="_blank" rel="noopener noreferrer">
                Navigate in Google Maps
              </a>
              <SpotShare point={active.point} />
              <FoodNearby point={active.point} onResize={() => popupRef.current?.update()} />
              <section className="play" aria-label="Games">
                <p className="play-title">Bored in the shade?</p>
                <button type="button" className="play-open" onClick={() => setGamesOpen(true)}>
                  Play a game
                </button>
                <p className="play-hint">Ludo, Minesweeper or Poker</p>
              </section>
            </div>
          </Popup>
        )}

        <Framing boundaries={boundaries} selected={selected} />
        <ZoomControl position="topright" />
      </MapContainer>

      <div className="map-card layers" role="group" aria-label="Map layers">
        <p className="map-card-title">Cooling spots</p>
        {(Object.keys(POINT_STYLE) as PointKind[]).map((k) => (
          <label key={k}>
            <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} />
            <i style={{ background: POINT_STYLE[k].color }} />
            {POINT_STYLE[k].label} <span className="muted">{counts[k]}</span>
          </label>
        ))}
        {hasNightData && (
          <label className="sub">
            <input type="checkbox" checked={layers.nightOnly} onChange={() => toggle('nightOnly')} />
            Green spaces open at night only
          </label>
        )}
      </div>

      <div className="map-card legend" aria-label="Score legend">
        <p className="map-card-title">Cooling access score</p>
        <div className="legend-ramp">
          {SCORE_RAMP.map((c, i) => (
            <span key={c}>
              <i style={{ background: c }} />
              <span className="legend-bin">{SCORE_BINS[i]}</span>
            </span>
          ))}
        </div>
        <p className="legend-ends">
          <span>Weaker</span>
          <span>Stronger</span>
        </p>
      </div>

      {notice && (
        <p className="map-notice" role="status">
          {notice}
        </p>
      )}

      <button className="map-locate" onClick={findNearest} disabled={locating}>
        <LocateIcon />
        {locating ? 'Finding you…' : 'Nearest cool spot'}
      </button>

      {selected && (
        <button className="map-reset" onClick={() => onSelect(null)}>
          Show all of Paris
        </button>
      )}

      <GamesOverlay open={gamesOpen} onClose={() => setGamesOpen(false)} />
    </div>
  );
}