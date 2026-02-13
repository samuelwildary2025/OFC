'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
    Plug,
    Users,
    HelpCircle,
    PlayCircle,
    MessageSquare,
    Info,
    CheckCircle2,
    XCircle
} from 'lucide-react';

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState('overview');

    const [stats, setStats] = useState({
        createdChannels: 0,
        connectedChannels: 0,
        disconnectedChannels: 0,
        totalContacts: 0,
    });

    useEffect(() => {
        const run = async () => {
            try {
                const [instancesRes, statsRes] = await Promise.all([
                    api.getInstances(),
                    api.getStats(),
                ]);

                const instances = (instancesRes.data as Array<{ status?: string }>) || [];
                const connected = instances.filter((i) => i.status === 'connected').length;
                const total = instances.length;

                const contacts = 0;

                setStats({
                    createdChannels: total,
                    connectedChannels: connected,
                    disconnectedChannels: Math.max(0, total - connected),
                    totalContacts: contacts,
                });
            } catch {
                return;
            }
        };
        run();
    }, []);

    return (
        <div className="relative min-h-full pb-20">
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-1">Dashboards</h1>
                    <p className="text-gray-500 text-sm max-w-2xl">
                        Os dashboard geram insights, oferecendo uma visão geral e específica de suas campanhas, fluxos e gatilhos de forma eficiente.
                    </p>
                </div>
                <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-purple-200 transition-colors">
                    <PlayCircle className="w-4 h-4" />
                    Como funciona?
                </button>
            </div>

            <div className="border-b border-gray-200 mb-8">
                <div className="flex gap-8">
                    {['Visão geral', 'Campanhas', 'Gatilhos', 'Fluxos'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab === 'Visão geral' ? 'overview' : tab.toLowerCase())}
                            className={`pb-3 text-sm font-medium transition-colors relative ${
                                (tab === 'Visão geral' && activeTab === 'overview') || activeTab === tab.toLowerCase()
                                    ? 'text-teal-500'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab}
                            {((tab === 'Visão geral' && activeTab === 'overview') || activeTab === tab.toLowerCase()) && (
                                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-teal-500 rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                        <Plug className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-1 text-gray-500 text-xs font-medium mb-1">
                            Canais Criados
                            <HelpCircle className="w-3 h-3 text-gray-400" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{stats.createdChannels}</div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center text-teal-600 relative">
                        <Plug className="w-6 h-6" />
                        <div className="absolute bottom-2 right-2 w-3 h-3 bg-white rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-3 h-3 text-teal-600" />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-1 text-gray-500 text-xs font-medium mb-1">
                            Canais Conectados
                            <HelpCircle className="w-3 h-3 text-gray-400" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{stats.connectedChannels || '-'}</div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 relative">
                        <Plug className="w-6 h-6" />
                        <div className="absolute bottom-2 right-2 w-3 h-3 bg-white rounded-full flex items-center justify-center">
                            <XCircle className="w-3 h-3 text-gray-400" />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-1 text-gray-500 text-xs font-medium mb-1">
                            Canais Desconectados
                            <HelpCircle className="w-3 h-3 text-gray-400" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{stats.disconnectedChannels}</div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-1 text-gray-500 text-xs font-medium mb-1">
                            Total de Contatos
                            <HelpCircle className="w-3 h-3 text-gray-400" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{stats.totalContacts}</div>
                    </div>
                </div>
            </div>

            <div>
                <h2 className="text-lg font-bold text-gray-800 mb-6">Campanhas</h2>
                <div className="bg-white rounded-xl border border-gray-100 p-8 h-96 flex flex-col items-center justify-center shadow-sm relative overflow-hidden">
                    <div className="absolute top-6 left-6 text-sm text-gray-500 font-medium flex items-center gap-2">
                        Mensagens
                        <HelpCircle className="w-4 h-4 text-gray-400" />
                    </div>
                    
                    <div className="text-center">
                         <div className="w-32 h-32 mx-auto mb-4 opacity-20">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full text-gray-400">
                                <path d="M3 3v18h18" />
                                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                            </svg>
                        </div>
                        <p className="text-gray-400 text-lg font-medium">Nenhum dado encontrado</p>
                    </div>
                </div>
            </div>

            <div className="fixed right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%-40px)] hover:translate-x-0 transition-transform duration-300 z-50">
                <div className="flex items-center">
                    <div className="bg-teal-500 text-white py-8 px-2 rounded-l-lg cursor-pointer flex flex-col items-center gap-2 writing-mode-vertical text-xs font-bold tracking-wide shadow-lg">
                        <Info className="w-4 h-4 mb-2" />
                        <span className="transform -rotate-180 whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
                            Informações Úteis
                        </span>
                    </div>
                    <div className="w-64 h-96 bg-white shadow-2xl border-l border-gray-100 p-6">
                        <h3 className="font-bold mb-2">Ajuda</h3>
                        <p className="text-sm text-gray-500">Conteúdo de ajuda aqui...</p>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-6 right-6 flex items-center gap-4 z-50">
                <button className="bg-white hover:bg-gray-50 text-teal-500 px-4 py-3 rounded-full shadow-lg border border-teal-100 flex items-center gap-2 font-medium transition-transform hover:-translate-y-1">
                    <div className="w-6 h-6 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold">ai</div>
                    Primeiros passos
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full absolute -top-1 -right-1 border-2 border-white">4</span>
                </button>
                
                <button className="w-14 h-14 bg-teal-500 hover:bg-teal-600 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:-translate-y-1 hover:shadow-teal-500/30">
                    <MessageSquare className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}
