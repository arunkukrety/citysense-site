import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, useMap, Marker, Polyline, useMapEvents, Circle, Popup } from 'react-leaflet';
import { RotateCw, Locate, AlertCircle, Ruler } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

// Types
type MonitoringType = 'aqi' | 'hygiene' | 'pothole';

interface DataPoint {
  lat: number;
  lng: number;
  aqi: number;
  hygiene?: number;
}

interface WaterLoggingArea {
  center: [number, number];
  radius: number;
  severity: number;
}

interface RoadSegment {
  points: [number, number][];
  hygiene: number;
}

interface Location {
  lat: number;
  lng: number;
}

interface MeasurePoint {
  location: Location;
  index: number;
}

// Constants
const DELHI_CENTER: [number, number] = [28.6139, 77.2090];

const generateDataPoints = (count: number): DataPoint[] => {
  const delhiBounds = {
    north: 28.88,
    south: 28.40,
    east: 77.35,
    west: 76.85
  };

  return Array.from({ length: count }, () => {
    const lat = delhiBounds.south + Math.random() * (delhiBounds.north - delhiBounds.south);
    const lng = delhiBounds.west + Math.random() * (delhiBounds.east - delhiBounds.west);

    const distanceFromCenter = Math.sqrt(
      Math.pow(lat - DELHI_CENTER[0], 2) + Math.pow(lng - DELHI_CENTER[1], 2)
    );

    const baseAqi = Math.floor(Math.random() * 200) + 50;
    let aqi = baseAqi;

    if (distanceFromCenter < 0.05) {
      aqi = Math.min(baseAqi + 200, 500);
    } else if (lat > 28.65 && lng > 77.25) {
      aqi = Math.min(baseAqi + 150, 450);
    } else if (lat < 28.50 && lng < 77.10) {
      aqi = Math.min(baseAqi + 175, 475);
    }

    const hygiene = Math.floor(Math.random() * 80) + 20;
    return { lat, lng, aqi, hygiene };
  });
};

const INITIAL_DATA_POINTS: DataPoint[] = generateDataPoints(500);

function HeatmapLayer({ points }: { points: DataPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const heatmapData = points.map(point => {
      const logIntensity = Math.log(point.aqi) / Math.log(500);
      const intensity = Math.min(Math.max(logIntensity, 0.1), 1);
      return [point.lat, point.lng, intensity];
    });

    map.eachLayer((layer) => {
      if ((layer as any)._heat) {
        map.removeLayer(layer);
      }
    });

    const getDynamicRadius = () => {
      const zoom = map.getZoom();
      const baseRadius = 20;
      const scaleFactor = Math.pow(1.2, zoom - 11);
      return Math.min(Math.max(baseRadius * scaleFactor, 20), 50);
    };

    const heatLayer = (L as any).heatLayer(heatmapData, {
      radius: getDynamicRadius(),
      blur: 15,
      maxZoom: 20,
      max: 1.0,
      gradient: {
        0.1: '#00ff00',
        0.3: '#80ff00',
        0.5: '#ffff00',
        0.7: '#ff8000',
        0.9: '#ff0000'
      },
      minOpacity: 0.35
    }).addTo(map);

    const handleZoomEnd = () => {
      heatLayer.setOptions({ radius: getDynamicRadius() });
      heatLayer.redraw();
    };

    map.on('zoomend', handleZoomEnd);
    map.on('moveend', handleZoomEnd);

    return () => {
      map.off('zoomend', handleZoomEnd);
      map.off('moveend', handleZoomEnd);
      if (map.hasLayer(heatLayer)) {
        map.removeLayer(heatLayer);
      }
    };
  }, [map, points]);

  return null;
}

const WATER_LOGGING_AREAS: WaterLoggingArea[] = [
  { center: [28.6139, 77.2090], radius: 600, severity: 85 }, // Central point
  { center: [28.6250, 77.1950], radius: 550, severity: 70 }, // ~1.5km SW
  { center: [28.5950, 77.2250], radius: 650, severity: 90 }, // ~2.5km SE
  { center: [28.6350, 77.2300], radius: 500, severity: 60 }, // ~3km NE
  { center: [28.5900, 77.1900], radius: 700, severity: 95 }, // ~3.5km SW
  { center: [28.6280, 77.2180], radius: 620, severity: 80 }, // ~1.8km N
  { center: [28.6050, 77.2350], radius: 580, severity: 75 }, // ~2.8km SE
  { center: [28.6450, 77.2000], radius: 640, severity: 88 }, // ~3.5km NW
  { center: [28.6000, 77.2050], radius: 530, severity: 65 }, // ~1.5km S
  { center: [28.6300, 77.2450], radius: 670, severity: 92 }, // ~4km NE
  { center: [28.5850, 77.2150], radius: 590, severity: 78 }, // ~3.2km S
  { center: [28.6200, 77.1850], radius: 610, severity: 83 }, // ~2.5km W
  { center: [28.6380, 77.2100], radius: 560, severity: 72 }, // ~2.7km N
  { center: [28.5950, 77.2450], radius: 680, severity: 87 }, // ~4km SE
  { center: [28.6100, 77.1800], radius: 630, severity: 91 }  // ~3km W
];

const ROAD_SEGMENTS: RoadSegment[] = [
  // Main North-South Corridor
  { points: [[28.6139, 77.2090], [28.6189, 77.2140], [28.6239, 77.2190]], hygiene: 20 },
  { points: [[28.6239, 77.2190], [28.6289, 77.2240], [28.6339, 77.2290]], hygiene: 45 },
  { points: [[28.6339, 77.2290], [28.6389, 77.2340], [28.6439, 77.2390]], hygiene: 30 },
  { points: [[28.6050, 77.2050], [28.6100, 77.2100], [28.6150, 77.2150]], hygiene: 50 },
  { points: [[28.6150, 77.2150], [28.6200, 77.2200], [28.6250, 77.2250]], hygiene: 65 },

  // Additional North-South Routes
  { points: [[28.6100, 77.2000], [28.6150, 77.2050], [28.6200, 77.2100]], hygiene: 70 },
  { points: [[28.6200, 77.2100], [28.6250, 77.2150], [28.6300, 77.2200]], hygiene: 35 },
  { points: [[28.6300, 77.2200], [28.6350, 77.2250], [28.6400, 77.2300]], hygiene: 85 },
  { points: [[28.6050, 77.2150], [28.6100, 77.2200], [28.6150, 77.2250]], hygiene: 55 },
  { points: [[28.6400, 77.2350], [28.6450, 77.2400], [28.6500, 77.2450]], hygiene: 25 },

  // East-West Connections
  { points: [[28.6189, 77.2140], [28.6139, 77.2190], [28.6089, 77.2240]], hygiene: 85 },
  { points: [[28.6289, 77.2240], [28.6239, 77.2290], [28.6189, 77.2340]], hygiene: 75 },
  { points: [[28.6389, 77.2340], [28.6339, 77.2390], [28.6289, 77.2440]], hygiene: 60 },
  { points: [[28.6150, 77.2050], [28.6100, 77.2100], [28.6050, 77.2150]], hygiene: 40 },
  { points: [[28.6250, 77.2150], [28.6200, 77.2200], [28.6150, 77.2250]], hygiene: 90 },

  // Additional East-West Routes
  { points: [[28.6350, 77.2250], [28.6300, 77.2300], [28.6250, 77.2350]], hygiene: 50 },
  { points: [[28.6100, 77.2200], [28.6050, 77.2250], [28.6000, 77.2300]], hygiene: 80 },
  { points: [[28.6200, 77.2300], [28.6150, 77.2350], [28.6100, 77.2400]], hygiene: 30 },
  { points: [[28.6400, 77.2400], [28.6350, 77.2450], [28.6300, 77.2500]], hygiene: 45 },
  { points: [[28.6300, 77.2100], [28.6250, 77.2150], [28.6200, 77.2200]], hygiene: 95 },

  // Diagonal Routes
  { points: [[28.6139, 77.2190], [28.6189, 77.2240], [28.6239, 77.2290]], hygiene: 90 },
  { points: [[28.6239, 77.2290], [28.6289, 77.2340], [28.6339, 77.2390]], hygiene: 40 },
  { points: [[28.6089, 77.2240], [28.6139, 77.2290], [28.6189, 77.2340]], hygiene: 70 },
  { points: [[28.6050, 77.2100], [28.6100, 77.2150], [28.6150, 77.2200]], hygiene: 55 },
  { points: [[28.6350, 77.2300], [28.6400, 77.2350], [28.6450, 77.2400]], hygiene: 25 },

  // Additional Diagonal Routes
  { points: [[28.6150, 77.2050], [28.6200, 77.2100], [28.6250, 77.2150]], hygiene: 60 },
  { points: [[28.6250, 77.2200], [28.6300, 77.2250], [28.6350, 77.2300]], hygiene: 85 },
  { points: [[28.6100, 77.2250], [28.6150, 77.2300], [28.6200, 77.2350]], hygiene: 35 },
  { points: [[28.6300, 77.2350], [28.6350, 77.2400], [28.6400, 77.2450]], hygiene: 75 },
  { points: [[28.6050, 77.2150], [28.6100, 77.2200], [28.6150, 77.2250]], hygiene: 45 },

  // Cross-Connecting Routes
  { points: [[28.6150, 77.2200], [28.6200, 77.2250], [28.6250, 77.2300]], hygiene: 95 },
  { points: [[28.6250, 77.2300], [28.6300, 77.2350], [28.6350, 77.2400]], hygiene: 40 },
  { points: [[28.6100, 77.2250], [28.6150, 77.2300], [28.6200, 77.2350]], hygiene: 75 },
  { points: [[28.6200, 77.2100], [28.6250, 77.2150], [28.6300, 77.2200]], hygiene: 60 },
  { points: [[28.6300, 77.2250], [28.6350, 77.2300], [28.6400, 77.2350]], hygiene: 50 },

  // Peripheral Routes
  { points: [[28.6100, 77.2100], [28.6150, 77.2150], [28.6200, 77.2200]], hygiene: 65 },
  { points: [[28.6400, 77.2400], [28.6350, 77.2450], [28.6300, 77.2500]], hygiene: 30 },
  { points: [[28.6000, 77.2050], [28.6050, 77.2100], [28.6100, 77.2150]], hygiene: 80 },
  { points: [[28.6450, 77.2300], [28.6500, 77.2350], [28.6550, 77.2400]], hygiene: 20 },
  { points: [[28.6050, 77.2350], [28.6100, 77.2400], [28.6150, 77.2450]], hygiene: 70 }
];

// Control Components
function LocationControl({ onLocationFound }: { onLocationFound: (location: Location) => void }) {
  const map = useMap();

  const handleClick = () => {
    map.locate().on('locationfound', (e) => {
      map.flyTo(e.latlng, map.getZoom());
      onLocationFound(e.latlng);
    });
  };

  return (
    <div className="leaflet-top leaflet-right" style={{ zIndex: 1000, marginTop: '10px', marginRight: '10px' }}>
      <div className="leaflet-control leaflet-bar">
        <button
          onClick={handleClick}
          className="w-8 h-8 bg-white rounded-lg shadow-md flex items-center justify-center hover:bg-gray-100 transition-colors"
          title="Find my location"
        >
          <Locate className="w-4 h-4 text-[#1b212c]" />
        </button>
      </div>
    </div>
  );
}

function MeasureControl({ onMeasureToggle, isMeasuring }: { onMeasureToggle: () => void; isMeasuring: boolean }) {
  return (
    <div className="leaflet-top leaflet-right" style={{ zIndex: 1000, marginTop: '58px', marginRight: '10px' }}>
      <div className="leaflet-control leaflet-bar">
        <button
          onClick={onMeasureToggle}
          className={`w-8 h-8 bg-white rounded-lg shadow-md flex items-center justify-center hover:bg-gray-100 transition-colors ${isMeasuring ? 'bg-[#c1daff]' : ''}`}
          title="Measure distance"
        >
          <Ruler className={`w-4 h-4 ${isMeasuring ? 'text-[#1b212c]' : 'text-[#1b212c]'}`} />
        </button>
      </div>
    </div>
  );
}

function MeasureEventHandler({ isMeasuring, onPointSelect }: { isMeasuring: boolean; onPointSelect: (location: Location) => void }) {
  useMapEvents({
    click(e) {
      if (isMeasuring) {
        onPointSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    }
  });
  return null;
}

function HeatmapLegend() {
  return (
    <div className="leaflet-bottom leaflet-right" style={{ zIndex: 1000, marginBottom: '20px', marginRight: '10px' }}>
      <div className="bg-white bg-opacity-90 p-2 rounded-lg shadow-md">
        <p className="text-xs font-semibold mb-1 text-[#1b212c]">AQI Levels</p>
        <div className="flex flex-col xs:flex-row flex-wrap gap-1">
          <div className="flex items-center gap-1 mr-2">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-xs text-[#1b212c]">Good</span>
          </div>
          <div className="flex items-center gap-1 mr-2">
            <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
            <span className="text-xs text-[#1b212c]">Moderate</span>
          </div>
          <div className="flex items-center gap-1 mr-2">
            <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
            <span className="text-xs text-[#1b212c]">Unhealthy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
            <span className="text-xs text-[#1b212c]">Hazardous</span>
          </div>
        </div>
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
  const [monitoringType, setMonitoringType] = useState<MonitoringType>('aqi');
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  const [mapHeight, setMapHeight] = useState('400px');

  const adjustMapHeight = useCallback(() => {
    const vh = window.innerHeight;
    if (window.innerWidth < 768) {
      setMapHeight(`${vh * 0.6}px`);
    } else {
      setMapHeight('500px');
    }
  }, []);

  useEffect(() => {
    adjustMapHeight();
    window.addEventListener('resize', adjustMapHeight);
    return () => window.removeEventListener('resize', adjustMapHeight);
  }, [adjustMapHeight]);

  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setDataPoints(INITIAL_DATA_POINTS);
      setError(null);
    } catch (err) {
      setError('Failed to load map data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const newData = generateDataPoints(500);
    setDataPoints(newData);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRefreshing(false);
  };

  const handleMeasureToggle = () => {
    setIsMeasuring(!isMeasuring);
    if (isMeasuring) {
      setMeasurePoints([]);
    }
  };

  const handlePointSelect = (location: Location) => {
    if (measurePoints.length < 2) {
      setMeasurePoints([...measurePoints, { location, index: measurePoints.length + 1 }]);
    }
  };

  const findNearestRoadPoint = (point: Location) => {
    let nearestPoint = null;
    let minDistance = Infinity;

    ROAD_SEGMENTS.forEach(segment => {
      segment.points.forEach(([lat, lng]) => {
        const distance = Math.sqrt(
          Math.pow(point.lat - lat, 2) + Math.pow(point.lng - lng, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = { lat, lng };
        }
      });
    });

    return nearestPoint;
  };

  const findRoadPath = (start: Location, end: Location): Array<[number, number]> => {
    const startRoadPoint = findNearestRoadPoint(start);
    const endRoadPoint = findNearestRoadPoint(end);

    if (!startRoadPoint || !endRoadPoint) return [];

    const path: Array<[number, number]> = [[startRoadPoint.lat, startRoadPoint.lng]];
    let currentPoint: Location = startRoadPoint;
    let found = false;

    const visited = new Set<string>();

    const findNextSegment = (point: Location): boolean => {
      for (const segment of ROAD_SEGMENTS) {
        const segmentKey = JSON.stringify(segment.points);
        if (visited.has(segmentKey)) continue;

        const pointInSegment = segment.points.find(
          ([lat, lng]) => Math.abs(lat - point.lat) < 0.0001 && Math.abs(lng - point.lng) < 0.0001
        );

        if (pointInSegment) {
          visited.add(segmentKey);
          segment.points.forEach(([lat, lng]) => {
            if (Math.abs(lat - endRoadPoint.lat) < 0.0001 && Math.abs(lng - endRoadPoint.lng) < 0.0001) {
              found = true;
            }
            if (!path.some(([plat, plng]) => Math.abs(plat - lat) < 0.0001 && Math.abs(plng - lng) < 0.0001)) {
              path.push([lat, lng]);
              currentPoint = { lat, lng };
            }
          });
          return true;
        }
      }
      return false;
    };

    while (!found && findNextSegment(currentPoint)) { }

    if (!found) {
      path.push([endRoadPoint.lat, endRoadPoint.lng]);
    }

    return path;
  };

  const calculateDistance = (point1: Location, point2: Location) => {
    const path = findRoadPath(point1, point2);
    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const [lat1, lng1] = path[i];
      const [lat2, lng2] = path[i + 1];

      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistance += R * c;
    }

    return totalDistance.toFixed(2);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 20
      }
    }
  };

  const mapVariants = {
    hidden: { scale: 0.95, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 20,
        delay: 0.4
      }
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-[#1b212c] text-[#c1daff] px-3 sm:px-6 py-2 sm:py-4"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Header */}
      <header className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
          <motion.div variants={itemVariants} className="flex items-center gap-4">
            <h1
              className="text-xl sm:text-3xl font-bold tracking-tight"
              style={{ textShadow: '0 1px 4px rgba(193, 218, 255, 0.3)', fontFamily: 'Inter, sans-serif' }}
            >
              <span className="text-[#c1daff]">City</span>
              <span className="text-white">Sense</span>
            </h1>
          </motion.div>

          <div className="flex items-center gap-2">
            <select
              value={monitoringType}
              onChange={(e) => setMonitoringType(e.target.value as MonitoringType)}
              className="bg-[#2a3240] text-[#c1daff] border border-[#c1daff]/40 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#c1daff]/50 w-auto"
            >
              <option value="aqi">Air Quality</option>
              <option value="hygiene">Road Hygiene</option>
              <option value="pothole">Water Logging</option>
            </select>

            <motion.span
              variants={itemVariants}
              className={`text-sm font-medium ${isLoading || isRefreshing ? 'text-yellow-400' : 'text-green-400'}`}
            >
              {isLoading || isRefreshing ? 'Fetching urban data...' : 'Live urban data loaded'}
            </motion.span>
          </div>
        </div>
      </header>

      <motion.p
        variants={itemVariants}
        className="text-sm sm:text-lg text-[#c1daff]/80 text-center mb-4 sm:mb-8 font-medium"
      >
        Real-time urban monitoring for water logging, pollution, and more
      </motion.p>

      <motion.div
        variants={mapVariants}
        className="bg-[#2a3240] border-2 border-[#c1daff]/40 rounded-xl shadow-lg overflow-hidden relative"
        style={{ minHeight: '300px', marginBottom: '1rem' }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center" style={{ height: mapHeight }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            >
              <RotateCw className="w-8 h-8 text-[#c1daff]" />
            </motion.div>
            <p className="text-[#c1daff]/70 font-medium mt-4">Loading map data...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center" style={{ height: mapHeight }}>
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ yoyo: true, repeat: Infinity, duration: 2 }}
            >
              <AlertCircle className="w-8 h-8 text-red-400" />
            </motion.div>
            <p className="font-medium text-red-400 mt-4">{error}</p>
          </div>
        ) : (
          <div style={{ height: mapHeight }}>
            <MapContainer
              center={DELHI_CENTER}
              zoom={11}
              style={{ height: '100%', width: '100%', filter: 'brightness(0.9)' }}
              maxZoom={20}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                maxZoom={20}
              />

              {monitoringType === 'aqi' && (
                <>
                  <HeatmapLayer points={dataPoints} />
                  <HeatmapLegend />
                </>
              )}

              {monitoringType === 'hygiene' && ROAD_SEGMENTS.map((segment, index) => (
                <Polyline
                  key={`road-${index}`}
                  positions={segment.points}
                  pathOptions={{
                    color: segment.hygiene < 40 ? '#ff0000' : segment.hygiene < 70 ? '#ffa500' : '#00ff00',
                    weight: 5,
                    opacity: 0.8
                  }}
                />
              ))}

              {monitoringType === 'pothole' && WATER_LOGGING_AREAS.map((area, index) => (
                <Circle
                  key={`water-${index}`}
                  center={area.center}
                  radius={area.radius}
                  pathOptions={{
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 0.15,
                    weight: 2
                  }}
                >
                  <Popup>
                    <div className="font-medium text-[#1b212c]">
                      Water Logging Risk: {area.severity}%
                    </div>
                  </Popup>
                </Circle>
              ))}

              {userLocation && (
                <Marker
                  position={[userLocation.lat, userLocation.lng]}
                  icon={L.divIcon({
                    className: 'bg-[#c1daff] w-4 h-4 rounded-full border-2 border-white',
                    iconSize: [16, 16],
                  })}
                />
              )}

              <LocationControl onLocationFound={setUserLocation} />
              <MeasureControl onMeasureToggle={handleMeasureToggle} isMeasuring={isMeasuring} />
              <MeasureEventHandler isMeasuring={isMeasuring} onPointSelect={handlePointSelect} />

              {measurePoints.map((point, index) => (
                <Marker
                  key={`measure-${index}`}
                  position={[point.location.lat, point.location.lng]}
                  icon={L.divIcon({
                    className: 'flex items-center justify-center',
                    html: `<div class="px-1.5 py-0.5 rounded-full font-bold text-xs text-[#1b212c] bg-[#c1daff] shadow-lg">${point.index}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                  })}
                />
              ))}

              {measurePoints.length === 2 && (
                <>
                  <Polyline
                    positions={measurePoints.map(p => [p.location.lat, p.location.lng])}
                    pathOptions={{ color: '#c1daff', weight: 3, dashArray: '5, 10' }}
                  />
                  <Marker
                    position={[
                      (measurePoints[0].location.lat + measurePoints[1].location.lat) / 2,
                      (measurePoints[0].location.lng + measurePoints[1].location.lng) / 2
                    ]}
                    icon={L.divIcon({
                      className: 'bg-white px-2 py-1 rounded shadow-lg text-xs',
                      html: `<div class="font-medium text-[#1b212c]">${calculateDistance(measurePoints[0].location, measurePoints[1].location)} km</div>`,
                      iconSize: [60, 24],
                      iconAnchor: [30, 12]
                    })}
                  />
                </>
              )}
            </MapContainer>
          </div>
        )}

        {isRefreshing && !isLoading && (
          <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            >
              <RotateCw className="w-6 h-6 text-[#c1daff]" />
            </motion.div>
          </div>
        )}
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row justify-center gap-4"
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="px-4 py-3 sm:px-6 sm:py-2 rounded-lg shadow-md font-medium text-[#1b212c] bg-gradient-to-r from-[#c1daff] to-[#8aa9e6] hover:from-[#d1e4ff] hover:to-[#9bb8f0] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
        >
          <span>Refresh Data</span>
          {isRefreshing ? (
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-[#1b212c]"></div>
          ) : (
            <RotateCw className="w-4 h-4 text-[#1b212c]" />
          )}
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

export default Home;