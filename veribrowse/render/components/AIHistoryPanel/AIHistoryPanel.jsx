import React from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';

const AIHistoryPanel = ({
  isOpen,
  onClose,
  history,
  onSelectSession,
  onDeleteSession,
}) => {
  if (!isOpen) return null;

  const groupByDate = (sessions) => {
    const groups = {};
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    sessions.forEach((session) => {
      const date = new Date(session.updated_at);
      let groupKey;

      if (date > sevenDaysAgo) {
        groupKey = 'Last 7 days';
      } else {
        groupKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(session);
    });

    return groups;
  };

  const groupedHistory = groupByDate(history);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="absolute inset-0 bg-[#2d2d2d] z-50 flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-[#404040]">
        <button onClick={onClose} className="p-1 hover:bg-[#404040] rounded transition-colors" title="Back">
          <ArrowLeft size={20} className="text-gray-300" />
        </button>
        <h2 className="text-white font-semibold text-lg">History</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.keys(groupedHistory).length === 0 ? (
          <div className="p-4 text-gray-400 text-center">No chat history yet</div>
        ) : (
          Object.entries(groupedHistory).map(([group, sessions]) => (
            <div key={group} className="mb-2">
              <div className="px-4 py-2 text-gray-400 text-sm">{group}</div>
              {sessions.map((session) => (
                <div
                  key={session.session_id}
                  className="group flex items-center justify-between px-4 py-3 hover:bg-[#404040] cursor-pointer transition-colors border-l-2 border-transparent hover:border-purple-500"
                  onClick={() => onSelectSession(session.session_id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 text-sm truncate pr-2">{session.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(session.updated_at)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.session_id);
                      }}
                      className="p-1 hover:bg-[#505050] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AIHistoryPanel;
