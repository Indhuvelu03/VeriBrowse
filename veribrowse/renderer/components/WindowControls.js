import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import clsx from 'clsx';

const WindowControls = () => {
  const handleMinimize = () => {
    if (typeof window !== 'undefined' && window.ipc) {
      window.ipc.send('window-minimize');
    }
  };

  const handleMaximize = () => {
    if (typeof window !== 'undefined' && window.ipc) {
      window.ipc.send('window-maximize');
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.ipc) {
      window.ipc.send('window-close');
    }
  };

  return (
    <div className="flex items-center space-x-2 pl-4 border-l border-glass-border ml-2 no-drag cursor-pointer">
      <ControlButton icon={Minus} onClick={handleMinimize} className="hover:bg-white/10" />
      <ControlButton icon={Square} onClick={handleMaximize} size={14} className="hover:bg-white/10" />
      <ControlButton icon={X} onClick={handleClose} className="hover:bg-red-500 hover:text-white" />
    </div>
  );
};

const ControlButton = ({ icon: Icon, onClick, className, size = 16 }) => (
  <button
    onClick={onClick}
    className={clsx(
      "p-1.5 rounded-md transition-colors duration-200 text-gray-500 hover:text-white",
      className
    )}
  >
    <Icon size={size} />
  </button>
);

export default WindowControls;
