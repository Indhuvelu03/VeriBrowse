import React from 'react';
import { Clock, X } from 'lucide-react';

export default function HistoryHeader({ itemCount, onClose }) {
    return (
        <div className="flex items-center justify-between p-6 border-b border-forest-200/50">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-forest-100 rounded-xl">
                    <Clock className="text-forest-600" size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-forest-950">Browsing History</h2>
                    <p className="text-sm text-forest-600">{itemCount} items</p>
                </div>
            </div>
            <button
                onClick={onClose}
                className="p-2 hover:bg-forest-100 rounded-xl transition-colors"
            >
                <X className="text-forest-600" size={20} />
            </button>
        </div>
    );
}
