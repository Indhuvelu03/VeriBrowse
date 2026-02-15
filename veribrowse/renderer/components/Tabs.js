import React from 'react';
import { useTabStore } from '../store/tabStore';
import TabItem from './TabItem';

const Tabs = () => {
  const { tabs } = useTabStore();

  if (tabs.length === 0) return null;

  return (
    // Removed overflow-x-auto to prevent scrolling.
    // Added overflow-hidden to ensure containment.
    // The tabs inside will now shrink to fit this container.
    <div className="flex items-center h-full space-x-1 w-full overflow-hidden px-2">
      {tabs.map((tab) => (
        <TabItem key={tab.id} tab={tab} />
      ))}
    </div>
  );
};

export default Tabs;
