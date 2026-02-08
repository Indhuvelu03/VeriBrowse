import React, { useState } from 'react';
import HistoryHeader from './history/HistoryHeader';
import HistorySearchBar from './history/HistorySearchBar';
import HistoryGroup from './history/HistoryGroup';
import HistoryEmptyState from './history/HistoryEmptyState';
import HistoryLoadingState from './history/HistoryLoadingState';
import { useHistory } from './history/useHistory';
import { groupHistoryByDate } from './history/historyUtils';

export default function HistoryPanel({ isOpen, onClose, onNavigate }) {
    const [searchQuery, setSearchQuery] = useState('');
    const { history, loading, searchHistory, clearHistory } = useHistory(isOpen);

    const handleSearch = () => {
        searchHistory(searchQuery);
    };

    const handleClear = async () => {
        const cleared = await clearHistory();
        if (cleared) {
            setSearchQuery('');
        }
    };

    const handleItemClick = (item) => {
        if (onNavigate) {
            onNavigate(item.url);
        }
    };

    if (!isOpen) return null;

    const grouped = groupHistoryByDate(history);

    return (
        <div className="fixed inset-0 bg-forest-950/20 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl w-[90%] max-w-4xl h-[85vh] flex flex-col border border-forest-200/50 overflow-hidden">

                <HistoryHeader
                    itemCount={history.length}
                    onClose={onClose}
                />

                <HistorySearchBar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSearch={handleSearch}
                    onClear={handleClear}
                />

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <HistoryLoadingState />
                    ) : history.length === 0 ? (
                        <HistoryEmptyState />
                    ) : (
                        <div className="space-y-6">
                            {Object.entries(grouped).map(([label, items]) => (
                                <HistoryGroup
                                    key={label}
                                    label={label}
                                    items={items}
                                    onItemClick={handleItemClick}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
