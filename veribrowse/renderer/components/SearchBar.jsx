import React, { useState } from 'react';
import { Search, Mic, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SearchBar({ onSearch, onVoiceInput }) {
    const [query, setQuery] = useState('');
    const [isListening, setIsListening] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query);
        }
    };

    const handleVoiceClick = () => {
        setIsListening(!isListening);
        onVoiceInput?.();
    };

    return (
        <div className="w-full">
            <form onSubmit={handleSubmit} className="relative">
                <div className="relative flex items-center card-soft overflow-hidden transition-all duration-200 hover:shadow-soft-lg focus-within:shadow-glow focus-within:border-primary-300 dark:focus-within:border-primary-600">
                    {/* AI Icon */}
                    <div className="pl-4 pr-2">
                        <div className="p-1.5 bg-gradient-to-br from-primary-400 to-accent-purple rounded-lg">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                    </div>

                    {/* Input */}
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask AI or enter a URL..."
                        className="flex-1 bg-transparent py-3.5 pr-3 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none text-sm"
                    />

                    {/* Voice Button */}
                    <button
                        type="button"
                        onClick={handleVoiceClick}
                        className={cn(
                            "mr-2 p-2.5 rounded-xl transition-all duration-200",
                            isListening
                                ? "bg-red-50 dark:bg-red-950 text-red-500 animate-pulse"
                                : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-primary-500"
                        )}
                    >
                        <Mic className="w-4.5 h-4.5" />
                    </button>

                    {/* Search Button */}
                    <button
                        type="submit"
                        className="mr-2 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 rounded-xl transition-all duration-200 hover:shadow-lg active:scale-95"
                    >
                        <Search className="w-4.5 h-4.5 text-white" />
                    </button>
                </div>
            </form>
        </div>
    );
}
