import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Search, Plus, X, Sparkles, LayoutGrid, Download, MoreHorizontal, Lock, ChevronDown, Minimize, Maximize } from 'lucide-react';
import { cn } from '../lib/utils';

export default function UnifiedHeader({
    tabs,
    activeTab,
    onTabChange,
    onTabClose,
    onNewTab,
    onSearch,
    isSidebarOpen,
    onToggleSidebar
}) {
    // Download Management
    const [downloads, setDownloads] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [loadingTabs, setLoadingTabs] = useState({});

    React.useEffect(() => {
        const onLoadingStatus = (e, { tabId, isLoading }) => {
            setLoadingTabs(prev => ({ ...prev, [tabId]: isLoading }));
        };
        window.ipc.on('tab:loading-status', onLoadingStatus);

        const onStart = (e, { fileName, totalBytes }) => {
            console.log('Download started:', fileName, totalBytes);
            const id = Date.now().toString();
            setDownloads(prev => [{
                id,
                fileName,
                totalBytes,
                receivedBytes: 0,
                status: 'progressing',
                startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }, ...prev]);
        };

        const onProgress = (e, { fileName, receivedBytes, totalBytes }) => {
            setDownloads(prev => prev.map(d =>
                d.fileName === fileName && d.status === 'progressing'
                    ? { ...d, receivedBytes, totalBytes }
                    : d
            ));
        };

        const onComplete = (e, { fileName, success }) => {
            console.log('Download complete:', fileName, success);
            setDownloads(prev => prev.map(d =>
                d.fileName === fileName && d.status === 'progressing'
                    ? { ...d, status: success ? 'completed' : 'failed', receivedBytes: d.totalBytes }
                    : d
            ));
        };

        window.ipc.on('download:start', onStart);
        window.ipc.on('download:progress', onProgress);
        window.ipc.on('download:complete', onComplete);

        return () => {
            // Cleanup listeners if needed
        };
    }, []);

    const activeDownloads = downloads.filter(d => d.status === 'progressing');
    const latestDownload = downloads[0];
    const isCurrentTabLoading = loadingTabs[activeTab];

    const activeTabData = tabs.find(t => t.id === activeTab);
    const [inputValue, setInputValue] = useState(activeTabData?.url || '');

    // Sync input with active tab URL
    React.useEffect(() => {
        setInputValue(activeTabData?.url || '');
    }, [activeTabData, activeTab]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        onSearch(inputValue);
    };

    return (
        <div className="h-14 flex items-center gap-3 px-4 bg-white/80 backdrop-blur-2xl border-b border-forest-200/50 text-forest-950 relative">
            {/* Premium Download Toast (recent/active) */}
            {latestDownload && (latestDownload.status === 'progressing' || (latestDownload.status === 'completed' && Date.now() - parseInt(latestDownload.id) < 5000)) && (
                <div className="absolute top-16 right-4 bg-white/95 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl p-4 border border-forest-100 flex items-center gap-4 animate-in slide-in-from-top-4 fade-in duration-500 z-50 min-w-[300px]">
                    <div className={cn(
                        "p-3 rounded-xl transition-colors duration-500",
                        latestDownload.status === 'completed' ? "bg-emerald-50 text-emerald-600" : "bg-forest-50 text-forest-600 animate-pulse"
                    )}>
                        {latestDownload.status === 'completed' ? <Sparkles size={20} /> : <Download size={20} className="animate-bounce" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-forest-950 tracking-tight">
                            {latestDownload.status === 'completed' ? 'Downloads saved successfully' : 'Syncing to Meadow...'}
                        </div>
                        <div className="text-xs text-forest-500 truncate mt-0.5 font-medium">
                            {latestDownload.fileName} {latestDownload.status === 'completed' ? 'download done' : ''}
                        </div>
                        {latestDownload.status === 'progressing' && (
                            <div className="h-1.5 w-full bg-forest-100/50 rounded-full mt-3 overflow-hidden border border-forest-100/20">
                                <div
                                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-700 ease-out"
                                    style={{ width: `${latestDownload.totalBytes > 0 ? (latestDownload.receivedBytes / latestDownload.totalBytes) * 100 : 0}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Nav Controls */}
            <div className="flex items-center gap-1 no-drag">
                <button
                    onClick={() => window.ipc.invoke('browser:goBack')}
                    className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors"
                >
                    <ArrowLeft size={16} />
                </button>
                <button
                    onClick={() => window.ipc.invoke('browser:goForward')}
                    className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors"
                >
                    <ArrowRight size={16} />
                </button>
                <button
                    onClick={() => window.ipc.invoke('browser:reload')}
                    className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors"
                >
                    <RotateCw size={16} className={cn(isCurrentTabLoading && "animate-spin text-emerald-500")} />
                </button>
            </div>

            {/* Tabs List */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide max-w-[320px]">
                {tabs.map(tab => (
                    <HeaderTab
                        key={tab.id}
                        tab={tab}
                        active={activeTab === tab.id}
                        onClick={() => onTabChange(tab.id)}
                        onClose={() => onTabClose(tab.id)}
                    />
                ))}
                <button
                    onClick={onNewTab}
                    className="p-1.5 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors"
                >
                    <Plus size={16} />
                </button>
            </div>

            {/* Unified Search / URL Bar */}
            <div className="flex-1 flex justify-center">
                <form
                    onSubmit={handleSearchSubmit}
                    className="w-full max-w-xl group"
                >
                    <div className="relative flex items-center bg-forest-50/40 border border-forest-200/60 rounded-2xl px-4 py-1.5 transition-all duration-500 group-focus-within:border-forest-500/50 group-focus-within:bg-white group-focus-within:shadow-2xl shadow-forest-200/20 group-hover:border-forest-400/50">
                        <Lock size={12} className="text-forest-400 mr-2" />
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Search or enter address"
                            className="flex-1 bg-transparent text-sm text-forest-950 placeholder-forest-400 outline-none"
                        />
                        <div className="flex items-center gap-2">
                            <RotateCw size={12} className="text-forest-400 cursor-pointer hover:text-forest-600" />
                            <ChevronDown size={14} className="text-forest-400" />
                        </div>
                    </div>
                </form>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-1 no-drag ml-2 pl-2 border-l border-forest-200/50">
                <div className="relative">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className={cn(
                            "p-2 rounded-lg transition-all duration-300 relative",
                            activeDownloads.length > 0
                                ? "bg-emerald-50 text-emerald-600 shadow-sm"
                                : "text-forest-600 hover:text-forest-950 hover:bg-forest-100/50"
                        )}
                    >
                        <Download size={18} className={cn(activeDownloads.length > 0 && "animate-bounce")} />
                        {activeDownloads.length > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <svg className="w-8 h-8 -rotate-90">
                                    <circle
                                        cx="16" cy="16" r="14"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeDasharray={88}
                                        strokeDashoffset={88 - (88 * (activeDownloads[0].totalBytes > 0 ? (activeDownloads[0].receivedBytes / activeDownloads[0].totalBytes) : 0))}
                                        className="opacity-20"
                                    />
                                </svg>
                            </div>
                        )}
                    </button>
                    {activeDownloads.length > 0 && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full animate-pulse" />
                    )}

                    {/* Download History Popover */}
                    {showHistory && (
                        <div className="absolute top-12 right-0 w-80 bg-white/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl border border-forest-100 p-2 z-[100] animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                            <div className="px-3 py-2 border-b border-forest-50 flex justify-between items-center bg-forest-50/30 rounded-t-xl">
                                <span className="text-sm font-bold text-forest-950 flex items-center gap-2">
                                    Recent Downloads
                                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded-full font-bold uppercase tracking-wider">Live</span>
                                </span>
                                <button onClick={() => setShowHistory(false)} className="text-forest-400 hover:text-forest-600 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                            <div className="max-h-96 overflow-y-auto mt-1 space-y-1 scrollbar-hide">
                                {downloads.length === 0 ? (
                                    <div className="py-8 text-center text-forest-400 text-xs italic">Meadow is clear (No downloads)</div>
                                ) : (
                                    downloads.map(d => (
                                        <div key={d.id} className="p-3 hover:bg-forest-50 rounded-xl transition-all duration-200 flex items-center gap-3 group">
                                            <div className={cn(
                                                "p-2 rounded-lg flex-shrink-0",
                                                d.status === 'completed' ? "bg-emerald-50 text-emerald-600" :
                                                    d.status === 'failed' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                                            )}>
                                                <Download size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-bold text-forest-900 truncate tracking-tight">{d.fileName}</div>
                                                <div className="text-[10px] text-forest-500 flex justify-between mt-0.5 font-medium">
                                                    <span>{d.status === 'progressing' ? `${Math.round((d.receivedBytes / (d.totalBytes || 1)) * 100)}%` : d.status}</span>
                                                    <span>{d.startTime}</span>
                                                </div>
                                                {d.status === 'progressing' && (
                                                    <div className="h-1 w-full bg-forest-100 rounded-full mt-2 overflow-hidden">
                                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(d.receivedBytes / (d.totalBytes || 1)) * 100}%` }} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <button className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors">
                    <LayoutGrid size={18} />
                </button>
                <button
                    onClick={onToggleSidebar}
                    className={cn(
                        "p-2 rounded-lg transition-all duration-300",
                        isSidebarOpen ? "bg-forest-600 text-forest-50 shadow-lg shadow-forest-200/50" : "text-forest-600 hover:text-forest-950 hover:bg-forest-100/50"
                    )}
                >
                    <Sparkles size={18} className={cn(isSidebarOpen && "animate-pulse")} />
                </button>
                <button className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors">
                    <MoreHorizontal size={18} />
                </button>

                <div className="w-px h-6 bg-forest-200/50 mx-2" />

                {/* Window Controls */}
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => window.ipc?.send('window:minimize')}
                        className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors"
                    >
                        <Minimize size={14} />
                    </button>
                    <button
                        onClick={() => window.ipc?.send('window:maximize')}
                        className="p-2 hover:bg-forest-100/50 rounded-lg text-forest-600 hover:text-forest-950 transition-colors"
                    >
                        <Maximize size={14} />
                    </button>
                    <button
                        onClick={() => window.ipc?.send('window:close')}
                        className="p-2 hover:bg-red-500/10 text-forest-600 hover:text-red-600 rounded-lg transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Navigation Loading Progress Bar */}
            {isCurrentTabLoading && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-forest-100/30 overflow-hidden">
                    <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-loading-bar" />
                </div>
            )}
        </div>
    );
}

function HeaderTab({ tab, active, onClick, onClose }) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer transition-all duration-300 min-w-[100px] max-w-[150px] border",
                active
                    ? "bg-forest-100 text-forest-900 border-forest-200 shadow-sm"
                    : "bg-transparent border-transparent text-forest-600 hover:bg-forest-50 hover:text-forest-900"
            )}
        >
            <div className={cn(
                "w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 transition-colors",
                active ? "bg-white text-forest-600 shadow-sm" : "bg-forest-50 text-forest-400"
            )}>
                <Sparkles size={10} />
            </div>
            <span className="flex-1 text-xs font-bold truncate tracking-tight">
                {tab.title || 'New Tab'}
            </span>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-forest-200 rounded-md transition-all text-forest-800"
            >
                <X size={10} />
            </button>
        </div>
    );
}
