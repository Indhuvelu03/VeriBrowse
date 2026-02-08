import React from 'react';
import { Calendar } from 'lucide-react';
import HistoryItem from './HistoryItem';

export default function HistoryGroup({ label, items, onItemClick }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3 sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-10">
                <Calendar size={16} className="text-forest-500" />
                <h3 className="text-sm font-black text-forest-700 uppercase tracking-wide">{label}</h3>
            </div>
            <div className="space-y-2">
                {items.map((item) => (
                    <HistoryItem
                        key={item.id}
                        item={item}
                        onClick={onItemClick}
                    />
                ))}
            </div>
        </div>
    );
}
