/**
 * Groups history items by date categories
 * @param {Array} items - History items with timestamp
 * @returns {Object} Grouped items by date label
 */
export function groupHistoryByDate(items) {
    const groups = {};

    items.forEach(item => {
        const date = new Date(item.timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let label;
        if (date.toDateString() === today.toDateString()) {
            label = 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            label = 'Yesterday';
        } else if (date > new Date(today.getTime() - 7 * 86400000)) {
            label = 'This Week';
        } else {
            label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
    });

    return groups;
}
