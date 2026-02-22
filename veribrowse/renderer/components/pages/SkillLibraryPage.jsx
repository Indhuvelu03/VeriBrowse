'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Trash2, Play, Globe, Search, RefreshCw, Layers, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useTabStore } from '../../store/tabStore';
import { useWorkflowStore } from '../../store/workflowStore';
import { useUIStore } from '../../store/uiStore';

export default function SkillLibraryPage() {
    const [skills, setSkills] = useState([]);
    const [loading, setLoading] = useState(true);
    const { startWorkflow } = useWorkflowStore();
    const { setActiveView, openAgentPanel } = useUIStore();
    const { addToast } = useUIStore();

    const fetchSkills = async () => {
        setLoading(true);
        try {
            const data = await window.electronAPI.skills.getAll();
            setSkills(data || []);
        } catch (e) {
            console.error('[SkillLibrary] Failed to fetch skills:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSkills();
    }, []);

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this skill?')) return;

        await window.electronAPI.skills.delete(id);
        setSkills(skills.filter(s => s.id !== id));
        addToast('Skill deleted permanently.', 'info');
    };

    const handleRun = (skill) => {
        // Switch to browser if not already there
        setActiveView('browser');
        // Open agent panel
        openAgentPanel();
        // Start workflow with the skill's goal
        // SkillMemory in main will automatically recall the steps for this goal
        startWorkflow(skill.goal, 'act');
    };

    return (
        <div className="flex-1 h-full overflow-hidden flex flex-col bg-obsidian">
            <header className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Zap className="text-amber-400" />
                        Skill Library
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Reusable AI workflows for common domain-specific tasks.
                    </p>
                </div>
                <button
                    onClick={fetchSkills}
                    className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto px-8 py-8">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                        <RefreshCw size={32} className="animate-spin text-white/20" />
                        <p className="text-sm font-medium tracking-widest uppercase text-white/20">Syncing Skills...</p>
                    </div>
                ) : skills.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-20 opacity-40">
                        <Zap size={48} className="text-white/10" />
                        <div>
                            <p className="text-lg font-bold text-white">No skills saved yet</p>
                            <p className="text-sm text-gray-400 mt-1 max-w-xs">
                                Successfully complete a task with the AI agent to save it as a reusable skill.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <AnimatePresence>
                            {skills.map((skill, i) => (
                                <SkillCard
                                    key={skill.id || i}
                                    skill={skill}
                                    onDelete={(e) => handleDelete(e, skill.id)}
                                    onRun={() => handleRun(skill)}
                                    index={i}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}

function SkillCard({ skill, onDelete, onRun, index }) {
    const stepCount = Array.isArray(skill.steps) ? skill.steps.length : 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group relative bg-white/[0.03] border border-white/10 rounded-2xl p-5 hover:bg-white/[0.05] hover:border-white/20 transition-all cursor-pointer overflow-hidden"
            onClick={onRun}
        >
            {/* Run Overlay on Hover */}
            <div className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                    <Zap size={20} />
                </div>
                <button
                    onClick={onDelete}
                    className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete Skill"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            <h3 className="text-white font-bold leading-tight line-clamp-2 min-h-[2.5rem]">
                {skill.goal}
            </h3>

            <div className="flex items-center gap-2 mt-4 text-[11px] text-gray-500 font-bold uppercase tracking-widest">
                <Globe size={12} className="text-sky-400" />
                <span className="truncate flex-1">{skill.domain}</span>
            </div>

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                    <Layers size={12} className="text-violet-400" />
                    <span className="text-[10px] text-gray-400 font-bold">{stepCount} STEPS</span>
                </div>

                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                    Run Workflow
                    <Play size={10} fill="currentColor" />
                </div>
            </div>
        </motion.div>
    );
}
