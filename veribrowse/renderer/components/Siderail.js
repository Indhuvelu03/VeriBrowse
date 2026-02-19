import React from 'react';
import { Home, History, Settings, User, Compass } from 'lucide-react';
import { Logo } from './Logo';
import { useUIStore } from '../store/uiStore';
import { motion } from 'framer-motion';

const Siderail = () => {
  const { openHome } = useUIStore();

  return (
    <div
      className="w-full h-full bg-obsidian border-r border-white/5 flex flex-col items-center py-8 flex-shrink-0 relative"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

      <div className="mb-12 flex flex-col items-center relative z-10 transition-transform hover:scale-110 duration-500 cursor-pointer" onClick={openHome}>
        <Logo size={42} float />
      </div>

      <nav className="flex-1 w-full flex flex-col items-center space-y-6 relative z-10">
        <MenuButton icon={Home} label="Home" onClick={openHome} active />
        <MenuButton icon={Compass} label="Browse" />
        <MenuButton icon={History} label="History" />
        <div className="w-8 h-[1px] bg-white/5 mx-auto my-2" />
        <MenuButton icon={User} label="Profile" />
        <MenuButton icon={Settings} label="Settings" />
      </nav>

      <div className="mt-auto relative z-10">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors cursor-pointer">
          <User size={18} />
        </div>
      </div>
    </div>
  );
};

const MenuButton = ({ icon: Icon, label, onClick, active }) => (
  <div className="relative group">
    <button
      onClick={onClick}
      title={label}
      className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-500 relative overflow-hidden ${active ? "text-white bg-white/10" : "text-gray-500 hover:text-white hover:bg-white/5"
        }`}
    >
      {active && (
        <motion.div
          layoutId="side-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full"
        />
      )}
      <Icon size={22} className="relative z-10" />
    </button>

    {/* Tooltip on hover */}
    <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 border border-white/10 rounded-lg text-[10px] font-bold text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
      {label}
    </div>
  </div>
);

export default Siderail;
