'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Settings,
    Zap,
    Users,
    Phone,
    MessageSquare,
    ChevronDown
} from 'lucide-react';

export function Sidebar() {
    const pathname = usePathname();

    const isActive = (path: string) => {
        if (path === '/dashboard' && pathname === '/dashboard') return true;
        if (path !== '/dashboard' && pathname.startsWith(path)) return true;
        return false;
    };

    const menuGroups = [
        {
            icon: LayoutDashboard,
            title: 'Dados',
            items: [
                { label: 'Dashboards', path: '/dashboard' }
            ]
        },
        {
            icon: Zap,
            title: 'Automação',
            items: [
                { label: 'Campanhas', path: '/dashboard/campaigns' },
                { label: 'Gatilhos', path: '/dashboard/triggers' },
                { label: 'Fluxos', path: '/dashboard/flows' },
                { label: 'Campos', path: '/dashboard/fields' },
                { label: 'Tags', path: '/dashboard/tags' },
                { label: 'Templates de mensagem', path: '/dashboard/templates' },
            ]
        },
        {
            icon: Users,
            title: 'Contatos',
            items: [
                { label: 'Meus contatos', path: '/dashboard/contacts' },
                { label: 'Agendamentos', path: '/dashboard/schedules' },
            ]
        },
        {
            icon: Phone,
            title: 'Telefones',
            items: [
                { label: 'Meus números', path: '/dashboard/instances' },
            ]
        },
        {
            icon: MessageSquare,
            title: 'Mensagens',
            items: [
                { label: 'Bate-papo', path: '/dashboard/chats' },
            ]
        },
        {
            icon: Settings,
            title: 'Configurações',
            items: [
                { label: 'Configurações', path: '/dashboard/settings' },
            ]
        }
    ];

    return (
        <aside className="w-64 border-r border-[var(--border)] bg-white flex flex-col h-screen sticky top-0 transition-all duration-300 z-20">
            {/* Logo Area */}
            <div className="h-16 flex items-center px-6 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <h1 className="font-bold text-2xl tracking-tight text-gray-800">
                        dispara <span className="text-white bg-teal-500 rounded-full px-2 py-0.5 text-lg">ai</span>
                    </h1>
                    <div className="w-2 h-2 rounded-full bg-teal-500 mt-2"></div>
                </div>
            </div>

            {/* Scrollable Navigation */}
            <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-6 custom-scrollbar">
                
                {/* Workspace Button */}
                <div className="px-2">
                    <button className="w-full bg-teal-400 hover:bg-teal-500 text-white rounded-full py-2 px-4 flex items-center justify-between font-medium text-sm transition-colors shadow-sm">
                        <span>Meu Workspace</span>
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>

                {menuGroups.map((group, index) => (
                    <div key={index}>
                        <h3 className="px-4 text-xs font-bold text-gray-800 mb-2 flex items-center gap-2">
                            <group.icon className="w-4 h-4 text-gray-500" />
                            {group.title}
                        </h3>
                        <div className="space-y-0.5">
                            {group.items.map((item) => (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    className={`group flex items-center justify-between px-4 py-2 rounded-lg transition-all duration-200 text-sm ${isActive(item.path)
                                            ? 'text-teal-500 font-medium'
                                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span>{item.label}</span>
                                    </div>
                                    {isActive(item.path) && <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>}
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
        </aside>
    );
}
