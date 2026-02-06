import React from 'react';
import { Home, Grid, Settings, History, Download, Sparkles, User, Layers } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SideRail({ activeView, onViewChange }) {
    const topActions = [
        { id: 'home', icon: Home, label: 'Home' },
        { id: 'groups', icon: Layers, label: 'Groups' },
        { id: 'apps', icon: Grid, label: 'Apps' },
        { id: 'history', icon: History, label: 'History' },
        { id: 'downloads', icon: Download, label: 'Downloads' },
    ];

    const bottomActions = [
        { id: 'settings', icon: Settings, label: 'Settings' },
        { id: 'profile', icon: User, label: 'Profile' },
    ];

    return (
        <div className="w-16 h-full flex flex-col items-center py-6 bg-white/60 backdrop-blur-3xl border-r border-forest-200/50 z-20 overflow-hidden">
            {/* Logo area */}
            <div className="mb-10 group cursor-pointer relative">
                <div className="absolute inset-0 bg-forest-600 blur-xl opacity-10 group-hover:opacity-20 transition-opacity" />
                <div className="relative w-11 h-11 bg-gradient-to-br from-forest-600 to-forest-400 rounded-2xl flex items-center justify-center text-forest-50 shadow-lg shadow-forest-200/50 transform group-hover:scale-105 transition-transform duration-500">
                    <Sparkles size={22} className="group-hover:rotate-12 transition-transform" />
                </div>
            </div>

            {/* Top Actions */}
            <div className="flex-1 flex flex-col gap-5">
                {topActions.map((action) => (
                    <RailButton
                        key={action.id}
                        icon={action.icon}
                        active={activeView === action.id}
                        onClick={() => onViewChange(action.id)}
                        tooltip={action.label}
                    />
                ))}
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col gap-5 mt-auto">
                {bottomActions.map((action) => (
                    <RailButton
                        key={action.id}
                        icon={action.icon}
                        active={activeView === action.id}
                        onClick={() => onViewChange(action.id)}
                        tooltip={action.label}
                    />
                ))}
            </div>
        </div>
    );
}

function RailButton({ icon: Icon, active, onClick, tooltip }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "group relative p-3 rounded-2xl transition-all duration-500",
                active
                    ? "bg-forest-600 text-forest-50 shadow-lg shadow-forest-950/20 scale-110"
                    : "text-forest-600/70 hover:text-forest-950 hover:bg-forest-100/50"
            )}
        >
            <Icon
                size={20}
                className={cn(
                    "transition-transform",
                    active && "animate-sway"
                )}
            />

            {/* Tooltip placeholder */}
            <span className="absolute left-full ml-4 px-3 py-1.5 bg-white/95 backdrop-blur-md border border-forest-200/60 text-forest-950 text-[10px] font-black rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-x-1 group-hover:translate-x-0 whitespace-nowrap z-50 shadow-2xl">
                {tooltip}
            </span>
        </button>
    );
}
