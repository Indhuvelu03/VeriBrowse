import React from 'react';
import { motion } from 'framer-motion';

export const Logo = ({ size = 48, spinning = false, float = false, className = '' }) => {
  // 3D rotation animation for "spinning" mode
  const spinTransition = {
    repeat: Infinity,
    duration: 3,
    ease: 'linear',
  };

  // Floating animation
  const floatTransition = {
    repeat: Infinity,
    repeatType: 'reverse',
    duration: 2,
    ease: 'easeInOut',
  };

  return (
    <div className={`perspective-1000 ${className}`} style={{ width: size, height: size }}>
      <motion.div
        animate={
          spinning
            ? { rotateY: 360, rotateX: [0, 10, 0, -10, 0], scale: [1, 1.1, 1] }
            : float
              ? { y: [0, -10, 0], rotateX: [0, 5, 0] }
              : {}
        }
        transition={spinning ? spinTransition : float ? floatTransition : {}}
        className="relative flex items-center justify-center w-full h-full preserve-3d"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Main Logo Layer */}
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]"
          style={{ backfaceVisibility: 'visible' }}
        >
          <defs>
            <linearGradient id="metallic-3d" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f3f4f6" />
              <stop offset="50%" stopColor="#9ca3af" />
              <stop offset="100%" stopColor="#374151" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g transform="translate(50,50)">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
              <path
                key={angle}
                d="M0,0 C20,-30 40,-30 40,0 C40,30 20,30 0,0"
                fill="url(#metallic-3d)"
                transform={`rotate(${angle}) translate(0, -5)`}
                className="opacity-90"
                style={{ filter: 'blur(0.5px)' }}
              />
            ))}
            <circle cx="0" cy="0" r="12" fill="#1f2937" />
            <circle cx="0" cy="0" r="8" fill="url(#metallic-3d)" opacity="0.8" />
          </g>
        </svg>

        {/* Simulated depth/shadow layer for 3D feel */}
        {spinning && (
          <motion.div
            className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </motion.div>
    </div>
  );
};
