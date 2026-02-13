'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';

type TagItem = {
    id: string;
    name: string;
    color: string;
    createdAt: string;
};

const STORAGE_KEY = 'ofc_tags';

function loadItems(): TagItem[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as TagItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveItems(items: TagItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function TagsPage() {
    const searchParams = useSearchParams();
    const q = (searchParams.get('q') || '').toLowerCase();
    const openCreate = searchParams.get('create') === '1';

    const [items, setItems] = useState<TagItem[]>(() => loadItems());
    const [showCreate, setShowCreate] = useState(false);
    const [name, setName] = useState('');
    const [color, setColor] = useState('#14b8a6');

    useEffect(() => {
        if (openCreate) setShowCreate(true);
    }, [openCreate]);

    const filtered = useMemo(() => {
        if (!q) return items;
        return items.filter((i) => i.name.toLowerCase().includes(q));
    }, [items, q]);

    const create = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const next: TagItem = {
            id: crypto.randomUUID(),
            name: trimmed,
            color,
            createdAt: new Date().toISOString(),
        };
        const updated = [next, ...items];
        setItems(updated);
        saveItems(updated);
        setName('');
        setColor('#14b8a6');
        setShowCreate(false);
    };

    const remove = (id: string) => {
        const updated = items.filter((i) => i.id !== id);
        setItems(updated);
        saveItems(updated);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Tags</h2>
                    <p className="text-gray-500 text-sm">Organize contatos com etiquetas</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary h-10 px-4">
                    <Plus className="w-4 h-4" />
                    Criar
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">Nenhuma tag encontrada</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filtered.map((t) => (
                            <div key={t.id} className="px-6 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                                    <div>
                                        <div className="font-medium text-gray-900">{t.name}</div>
                                        <div className="text-xs text-gray-500">{t.color}</div>
                                    </div>
                                </div>
                                <button onClick={() => remove(t.id)} className="btn btn-ghost h-9 px-3 text-red-600 hover:bg-red-50">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showCreate && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg border border-gray-100 shadow-xl p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Nova tag</h3>
                        <p className="text-sm text-gray-500 mb-4">Defina nome e cor</p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="Ex: Lead"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="w-full h-[42px] rounded-lg border border-gray-200 bg-white px-2"
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setShowCreate(false)} className="btn btn-ghost h-10 px-4">Cancelar</button>
                            <button onClick={create} className="btn btn-primary h-10 px-4" disabled={!name.trim()}>Criar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
