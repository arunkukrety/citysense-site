import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Circle, useMap, Marker } from 'react-leaflet';
import { RotateCw, Locate, AlertCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Types for our data points
interface DataPoint {
  lat: number;
  lng: number;
  weight: number;
}

interface Location {
  lat: number;
  lng: number;
}

const INITIAL_DATA_POINTS: DataPoint[] = [
  { lat: 28.6139, lng: 77.2090, weight: 1 },
  { lat: 28.6239, lng: 77.2190, weight: 0.5 },
  { lat: 28.6039, lng: 77.1990, weight: 0.8 },
];

// Custom location control component
function LocationControl({ onLocationFound }: { onLocationFound: (location: Location) => void }) {
  const map = useMap();

  const handleClick = () => {
    map.locate().on('locationfound', (e) => {
      map.flyTo(e.latlng, map.getZoom());
      onLocationFound(e.latlng);
    });
  };

  return (
    <div className="leaflet-top leaflet-right" style={{ zIndex: 1000 }}>
      <div className="leaflet-control leaflet-bar">
        <button
          onClick={handleClick}
          className="w-8 h-8 bg-white rounded-lg shadow-md flex items-center justify-center hover:bg-gray-100 transition-colors"
          title="Find my location"
        >
          <Locate className="w-4 h-4 text-[#1F2A44]" />
        </button>
      </div>
    </div>
  );
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location | null>(null);

  // Simulate data fetching
  const fetchData = useCallback(async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, isRefreshing ? 1500 : 2000));
      setDataPoints(INITIAL_DATA_POINTS);
      setError(null);
    } catch (err) {
      setError('Failed to load map data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle refresh click
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
  };

  return (
    <div className="min-h-screen bg-[#1F2A44] text-white px-4 sm:px-6 py-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{ 
            textShadow: '0 1px 4px rgba(0,196,204,0.5)',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          CitySense
        </h1>
        <span 
          className={`text-sm font-medium ${
            isLoading || isRefreshing ? 'text-yellow-400' : 'text-green-400'
          }`}
        >
          {isLoading || isRefreshing ? 'Fetching urban data...' : 'Live urban data loaded'}
        </span>
      </div>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-base sm:text-lg text-white/80 text-center mb-8 font-medium"
      >
        Real-time urban monitoring for potholes, pollution, and more
      </motion.p>

      {/* Heatmap Card */}
      <div className="bg-[#2A3555] border-2 border-[#00C4CC]/40 rounded-xl shadow-lg min-h-[400px] mb-8 overflow-hidden relative">
        {isLoading || isRefreshing ? (
          <div className="flex flex-col items-center justify-center h-[400px] gap-4">
            <div className="loading-spinner" />
            <p className="text-white/70 font-medium">Loading map data...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[400px] gap-4 text-red-400">
            <AlertCircle className="w-8 h-8" />
            <p className="font-medium">{error}</p>
          </div>
        ) : (
          <MapContainer
            center={[28.6139, 77.2090]}
            zoom={13}
            style={{ height: '400px', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {dataPoints.map((point, index) => (
              <Circle
                key={index}
                center={[point.lat, point.lng]}
                radius={500}
                pathOptions={{
                  fillColor: `rgba(0, 196, 204, ${point.weight * 0.7})`,
                  fillOpacity: 0.7,
                  color: 'transparent',
                }}
              />
            ))}
            {userLocation && (
              <Marker 
                position={[userLocation.lat, userLocation.lng]}
                icon={L.divIcon({
                  className: 'bg-blue-500 w-4 h-4 rounded-full border-2 border-white',
                  iconSize: [16, 16],
                })}
              />
            )}
            <LocationControl onLocationFound={setUserLocation} />
          </MapContainer>
        )}
      </div>

      {/* Buttons */}
      <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/details')}
          className="px-8 py-3 rounded-xl shadow-md font-semibold text-white button-gradient"
        >
          View Details
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="button-gradient px-8 py-3 rounded-xl shadow-md font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <span>Refresh Data</span>
          {isRefreshing ? (
            <div className="loading-spinner w-5 h-5" />
          ) : (
            <RotateCw className="w-5 h-5" />
          )}
        </motion.button>
      </div>
    </div>
  );
};

export default Home;