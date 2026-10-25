import { TileLayer } from 'react-leaflet';

// CARTO's light map background now needs a key (free, from carto.com/basemaps/apikey).
// Put it in client/.env.local as VITE_CARTO_KEY=... to use it. Without a key,
// OpenStreetMap's own map is shown in grey so the coloured data stays readable.
const cartoKey = (import.meta.env.VITE_CARTO_KEY as string | undefined)?.trim();

export default function BaseMap() {
  if (cartoKey) {
    return (
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`}
      />
    );
  }
  return (
    <TileLayer
      className="osm-grey"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={19}
    />
  );
}