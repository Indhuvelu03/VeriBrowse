import React from 'react';
import { History } from 'lucide-react';

const AIHistoryButton = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="p-2 hover:bg-[#404040] rounded-lg transition-colors"
      title="Chat History"
    >
      <History size={18} className="text-gray-300 hover:text-white" />
    </button>
  );
};

export default AIHistoryButton;
