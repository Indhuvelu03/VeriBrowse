import React from 'react';
import { Logo } from './Logo';
import SearchBar from './SearchBar';
import { Lightbulb, Filter, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const DefaultHome = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full bg-obsidian relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.02)_0%,_transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="z-10 flex flex-col items-center w-full max-w-2xl px-4"
      >
        <div className="mb-10 relative group">
          <div className="absolute inset-0 bg-white/10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <Logo size={120} float className="relative z-10" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-4 border border-white/5 rounded-full pointer-events-none"
          />
        </div>

        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold tracking-tighter text-metallic mb-3">
            Aeon
          </h1>
          <div className="flex items-center justify-center space-x-2 text-gray-500 tracking-[0.3em] text-[10px] uppercase font-bold">
            <Sparkles size={10} className="text-blue-400/50" />
            <span>Next Gen Intelligence</span>
            <Sparkles size={10} className="text-blue-400/50" />
          </div>
        </div>

        <div className="w-full max-w-xl mb-12">
          <SearchBar />
        </div>

        <div className="flex gap-6">
          <ActionButton icon={Lightbulb} label="Think" delay={0.1} color="hover:text-blue-400" glow="group-hover:bg-blue-500/10" />
          <ActionButton icon={Filter} label="Refine" delay={0.2} color="hover:text-purple-400" glow="group-hover:bg-purple-500/10" />
          <ActionButton icon={ArrowRight} label="Act" delay={0.3} color="hover:text-emerald-400" glow="group-hover:bg-emerald-500/10" />
        </div>
      </motion.div>

      {/* Bottom Credits or Stats */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center opacity-30">
        <p className="text-[10px] text-gray-500 tracking-[0.2em] uppercase">Powered by Aeon AI</p>
      </div>
    </div>
  );
};

const ActionButton = ({ icon: Icon, label, delay, color, glow }) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: 0.5 + delay, duration: 0.5 }}
    className={`flex items-center space-x-3 px-10 py-4 rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm transition-all duration-500 group relative overflow-hidden ${glow}`}
  >
    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <Icon size={18} className={`text-gray-400 transition-colors duration-300 ${color}`} />
    <span className="text-sm font-semibold text-gray-400 group-hover:text-white transition-colors tracking-wide">{label}</span>
  </motion.button>
);

export default DefaultHome;
