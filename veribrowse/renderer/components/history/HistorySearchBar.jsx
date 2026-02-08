import React from 'react';
import { Search, Trash2 } from 'lucide-react';

export default function HistorySearchBar({
    searchQuery,
    onSearchChange,
    onSearch,
    onClear
}) {
    return (
        <div className="p-4 border-b border-forest-200/50">
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-forest-400" size={18} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                        placeholder="Search history..."
                        className="w-full pl-10 pr-4 py-2.5 bg-forest-50 border border-forest-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-400 text-forest-950 placeholder-forest-400"
                    />
                </div>
                <button
                    onClick={onSearch}
                    className="px-4 py-2.5 bg-forest-600 text-white rounded-xl hover:bg-forest-700 transition-colors font-semibold"
                >
                    Search
                </button>
                <button
                    onClick={onClear}
                    className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors font-semibold flex items-center gap-2"
                >
                    <Trash2 size={16} />
                    Clear
                </button>
            </div>
        </div>
    );
}
