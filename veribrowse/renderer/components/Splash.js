import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './Logo';

export const Splash = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 800); // Wait for exit animation
    }, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-obsidian text-white"
        >
          <motion.div
            initial={{ scale: 0.5, rotateY: -180, opacity: 0 }}
            animate={{ scale: 1, rotateY: 0, opacity: 1 }}
            transition={{
              type: 'spring',
              stiffness: 50,
              damping: 15,
              duration: 1.5,
            }}
          >
            <Logo size={200} spinning />
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="mt-12 text-center"
          >
            <h1 className="text-5xl font-bold tracking-tighter text-metallic">VeriBrowse</h1>
            <p className="mt-2 text-gray-500 uppercase tracking-[0.4em] text-xs">
              Secure Intelligence
            </p>
          </motion.div>

          <motion.div
            className="absolute bottom-20 w-48 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 2 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
