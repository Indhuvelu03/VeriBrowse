import React, { useState, useEffect } from 'react';

export default function ArcBrowser() {
  const [tabs, setTabs] = useState([{ id: Date.now(), title: 'Start Page' }]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [inputUrl, setInputUrl] = useState('');

  useEffect(() => {
    const firstId = tabs[0].id;
    setActiveTabId(firstId);
    window.ipc.send('new-tab', { id: firstId, url: 'https://google.com' });
  }, []);

  const addTab = () => {
    const newId = Date.now();
    setTabs([...tabs, { id: newId, title: 'New Tab' }]);
    setActiveTabId(newId);
    window.ipc.send('new-tab', { id: newId, url: 'https://google.com' });
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter' && activeTabId) {
      window.ipc.send('navigate', { id: activeTabId, url: inputUrl });
    }
  };

  return (
    <div className="flex h-screen bg-[#f3f0ff] overflow-hidden font-sans">
      {/* 1. SIDE NAVIGATION PANEL (Arc Style) */}
      <div className="w-[70px] bg-white/40 backdrop-blur-xl border-r border-white/20 flex flex-col items-center py-6 gap-6 z-20">
        <div className="w-10 h-10 bg-orange-400 rounded-xl shadow-lg flex items-center justify-center text-white font-bold">V</div>
        
        <div className="flex flex-col gap-4">
          <button className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center hover:scale-110 transition-transform">🏠</button>
          <button className="w-10 h-10 rounded-xl hover:bg-white/50 flex items-center justify-center transition-all">⭐</button>
          <button onClick={addTab} className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">+</button>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-400 border-2 border-white shadow-sm"></div>
          <div className="w-8 h-8 rounded-full bg-pink-400 border-2 border-white shadow-sm"></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative">
        {/* 2. TOP BAR (Floating Search) */}
        <div className="h-[60px] flex items-center px-6 gap-4">
          {/* Back/Forward Controls */}
          <div className="flex gap-2 text-gray-400">
            <button className="hover:text-gray-600">←</button>
            <button className="hover:text-gray-600">→</button>
          </div>

          {/* Search Bar Container */}
          <div className="flex-1 max-w-2xl mx-auto flex items-center bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm border border-white">
            <span className="mr-2 text-gray-400 text-sm">🔒</span>
            <input 
              className="bg-transparent w-full outline-none text-sm text-gray-600"
              placeholder="Search the web..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>

          {/* Tab Management */}
          <div className="flex items-center gap-2">
            {tabs.map(tab => (
              <div 
                key={tab.id}
                onClick={() => { setActiveTabId(tab.id); window.ipc.send('switch-tab', tab.id); }}
                className={`px-3 py-1 rounded-lg text-xs cursor-pointer transition-all ${
                  activeTabId === tab.id ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500 hover:bg-white/40'
                }`}
              >
                {tab.title}
              </div>
            ))}
          </div>
        </div>

        {/* 3. MAIN WEB CONTENT AREA (The Floating Card) */}
        <div className="flex-1 m-3 rounded-3xl bg-white shadow-2xl border border-white/50 overflow-hidden">
          {/* This area is physically covered by the WebContentsView in background.js */}
        </div>
      </div>
    </div>
  );
}