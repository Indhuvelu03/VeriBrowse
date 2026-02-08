import React from 'react';
import { Clock } from 'lucide-react';

export default function HistoryEmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-forest-400">
            <Clock size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-semibold">No history found</p>
            <p className="text-sm">Your browsing history will appear here</p>
        </div>
    );
}
