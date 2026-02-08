import React from 'react';
import { Clock, ExternalLink, Sparkles } from 'lucide-react';

export default function HistoryItem({ item, onClick }) {
    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div
            onClick={() => onClick(item)}
            className="group p-4 bg-white border border-forest-200/50 rounded-xl hover:border-forest-400 hover:shadow-lg transition-all cursor-pointer"
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-forest-100 rounded-lg flex items-center justify-center group-hover:bg-forest-200 transition-colors">
                    <ExternalLink size={18} className="text-forest-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-forest-950 truncate group-hover:text-forest-600 transition-colors">
                        {item.title || 'Untitled'}
                    </h4>
                    <p className="text-sm text-forest-500 truncate mt-0.5">{item.url}</p>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-forest-400 flex items-center gap-1">
                            <Clock size={12} />
                            {formatTimestamp(item.timestamp)}
                        </span>
                        {item.visit_count > 1 && (
                            <span className="text-xs bg-forest-100 text-forest-600 px-2 py-0.5 rounded-full font-semibold">
                                {item.visit_count} visits
                            </span>
                        )}
                        {item.mission_context && (
                            <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <Sparkles size={10} />
                                Mission
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
