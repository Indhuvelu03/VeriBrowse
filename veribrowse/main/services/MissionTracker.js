import historyService from './HistoryService';

class MissionTracker {
    constructor() {
        this.activeMissions = new Map();
    }

    async startMission(tabId, prompt) {
        this.activeMissions.set(tabId, {
            originalPrompt: prompt,
            startTime: Date.now(),
            steps: [],
            status: 'active'
        });
    }

    async recordStep(tabId, step) {
        const mission = this.activeMissions.get(tabId);
        if (mission) {
            mission.steps.push({
                ...step,
                timestamp: Date.now()
            });
        }
    }

    async completeMission(tabId, result) {
        const mission = this.activeMissions.get(tabId);
        if (mission) {
            mission.status = result.success ? 'completed' : 'failed';
            mission.endTime = Date.now();
            mission.result = result;

            // Save to history via HistoryService
            await historyService.addEntry({
                url: result.url || '',
                title: result.title || 'Mission Result',
                missionContext: JSON.stringify(mission)
            });

            this.activeMissions.delete(tabId);
        }
    }

    async findRelevantMissions(query) {
        const context = await historyService.getRelevantContext(query);
        return context.filter(item => item.mission_context).map(item => ({
            ...item,
            mission_context: JSON.parse(item.mission_context)
        }));
    }

    async resumeMission(prompt) {
        const incomplete = await historyService.getIncompleteMissions();
        // Simple match for now
        const mission = incomplete.find(m =>
            m.title.toLowerCase().includes(prompt.toLowerCase()) ||
            m.url.toLowerCase().includes(prompt.toLowerCase())
        );

        if (mission) {
            return {
                canResume: true,
                message: `Found relevant mission: ${mission.title}`,
                mission: {
                    ...mission,
                    mission_context: JSON.parse(mission.mission_context)
                }
            };
        }

        return { canResume: false, message: 'No relevant missions found to resume.' };
    }
}

export default new MissionTracker();
