'use client';

import { 
    Search, 
    Bell, 
    ChevronDown, 
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export function Header() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentQ = searchParams.get('q') || '';
    const [q, setQ] = useState(currentQ);
    const [createOpen, setCreateOpen] = useState(false);

    useEffect(() => {
        setQ(currentQ);
    }, [currentQ]);

    const nextSearch = useMemo(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (q.trim()) params.set('q', q.trim());
        else params.delete('q');
        return params.toString();
    }, [q, searchParams]);

    const applySearch = () => {
        const qs = nextSearch;
        router.push(qs ? `${pathname}?${qs}` : pathname);
    };

    useEffect(() => {
        const onClick = () => setCreateOpen(false);
        if (!createOpen) return;
        window.addEventListener('click', onClick);
        return () => window.removeEventListener('click', onClick);
    }, [createOpen]);

    const goCreate = (path: string) => {
        setCreateOpen(false);
        router.push(`${path}?create=1`);
    };

    return (
        <header className="h-16 bg-white border-b border-[var(--border)] px-6 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-8">
                <div className="relative w-64 max-w-md">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <Search className="w-4 h-4 text-gray-400" />
                    </div>
                    <input 
                        type="text" 
                        className="block w-full p-2 pl-10 text-sm text-gray-900 border border-gray-100 rounded-lg bg-gray-50 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all" 
                        placeholder="Pesquisa ai" 
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                applySearch();
                            }
                        }}
                    />
                </div>
            </div>

            <div className="hidden md:block">
                <a href="#" className="btn btn-secondary text-xs px-4 py-1.5 h-8">
                    Clique e acesse nossa comunidade no whatsapp
                </a>
            </div>

            <div className="flex items-center gap-4">
                <div className="text-xs text-gray-500 font-medium">
                    Plano: <span className="text-gray-900 font-bold">SCALE</span>
                </div>

                <div className="relative">
                    <button
                        className="btn btn-outline h-8 px-3 py-0 gap-2 rounded-full text-teal-500 border-teal-500 hover:bg-teal-50"
                        onClick={(e) => {
                            e.stopPropagation();
                            setCreateOpen((v) => !v);
                        }}
                    >
                        Criar
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    {createOpen && (
                        <div
                            className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/instances')}>
                                Novo canal
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/campaigns')}>
                                Nova campanha
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/contacts')}>
                                Novo contato
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/templates')}>
                                Novo template
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/tags')}>
                                Nova tag
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/triggers')}>
                                Novo gatilho
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/flows')}>
                                Novo fluxo
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/fields')}>
                                Novo campo
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => goCreate('/dashboard/schedules')}>
                                Novo agendamento
                            </button>
                        </div>
                    )}
                </div>

                <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                </button>

                <div className="relative group cursor-pointer">
                    <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center border-2 border-purple-100 font-semibold text-sm">
                        {user?.name ? user.name.substring(0, 2).toUpperCase() : 'SW'}
                    </div>
                    
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 hidden group-hover:block animate-fade-in">
                        <div className="px-4 py-2 border-b border-gray-50">
                            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        </div>
                        <button 
                            onClick={logout}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                            Sair
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
