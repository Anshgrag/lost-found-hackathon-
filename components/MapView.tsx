"use client";

import { MapPin, Navigation } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LocationCount {
  location: string;
  count: number;
}

const hotspotLocations = [
  { name: 'Main Canteen', x: 30, y: 40, color: '#f87171' }, // Red-400
  { name: 'Library', x: 50, y: 30, color: '#60a5fa' },      // Blue-400
  { name: 'Block-A', x: 20, y: 60, color: '#34d399' },     // Emerald-400
  { name: 'Block-B', x: 40, y: 70, color: '#fbbf24' },     // Amber-400
  { name: 'Block-C', x: 60, y: 65, color: '#a78bfa' },     // Violet-400
  { name: 'Gym', x: 75, y: 50, color: '#f472b6' },         // Pink-400
  { name: 'Sports Complex', x: 80, y: 35, color: '#22d3ee' }, // Cyan-400
];

export default function MapView() {
  const [locationCounts, setLocationCounts] = useState<LocationCount[]>([]);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch('/api/items');
        const data = await res.json();
        const allItems = [...data.lost, ...data.found];
        
        const counts = allItems.reduce((acc: any, item: any) => {
          acc[item.location] = (acc[item.location] || 0) + 1;
          return acc;
        }, {});

        setLocationCounts(Object.entries(counts).map(([location, count]) => ({ location, count: count as number })));
      } catch (error) {
        console.error("Map fetch error:", error);
      }
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Institutional Hotspots</h4>
        <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 bg-white/[0.02] border border-white/[0.05] px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
          Live Stream
        </div>
      </div>

      <div className="relative h-[450px] bg-zinc-950 rounded-3xl border border-white/[0.03] overflow-hidden group">
        {/* Subtle Grid */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ 
            backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)', 
            backgroundSize: '40px 40px' 
          }} 
        />

        {hotspotLocations.map((spot) => {
          const locationData = locationCounts.find(l => l.location === spot.name);
          const count = locationData?.count || 0;
          const scale = Math.min(1.5, 1 + count * 0.1);

          return (
            <div
              key={spot.name}
              style={{
                position: 'absolute',
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="group/node"
            >
              <div 
                className="relative flex items-center justify-center transition-all duration-500" 
                style={{ transform: `scale(${scale})` }}
              >
                {count > 0 && (
                  <div
                    className="absolute w-12 h-12 rounded-full opacity-10 bg-white animate-ping"
                  />
                )}
                <div
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 border ${
                    count > 0 
                      ? 'bg-white border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' 
                      : 'bg-zinc-900 border-white/[0.05] group-hover/node:border-white/20'
                  }`}
                >
                  <MapPin size={14} className={count > 0 ? 'text-black' : 'text-zinc-700'} />
                </div>
              </div>

              {/* Minimal Tooltip */}
              <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black border border-white/[0.05] px-3 py-2 rounded-xl shadow-2xl pointer-events-none opacity-0 group-hover/node:opacity-100 transition-all duration-300 z-10 whitespace-nowrap translate-y-2 group-hover/node:translate-y-0">
                <p className="text-[11px] font-bold text-white tracking-tight leading-none mb-1">{spot.name}</p>
                <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest leading-none">
                  {count} Active
                </p>
              </div>
            </div>
          );
        })}

        <div className="absolute bottom-6 left-6 flex items-center gap-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
          <Navigation size={12} className="text-zinc-700" />
          <span>Spatial Correlation Matrix</span>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
