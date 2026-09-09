'use client';

import React, { useState } from 'react';
import { Database, CheckCircle2, RefreshCw, Server, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { dataService } from '@/lib/data-service';

interface FirebaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FirebaseStatusModal({ isOpen, onClose }: FirebaseStatusModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSyncSupabase = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setErrorMsg(null);
    try {
      const res = await dataService.syncWithSupabase();
      if (res.success) {
        setSyncStatus(res.message);
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al conectar con Supabase PostgreSQL.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullSupabase = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setErrorMsg(null);
    try {
      const res = await dataService.pullFromSupabase();
      if (res.success) {
        setSyncStatus(res.message);
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al descargar desde Supabase.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center justify-between p-5 border-b border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-gray-900 dark:text-white">
                Estado de Backend: Supabase (PostgreSQL 17)
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Base Estructurada Relacional (3FN) · Proyecto: guouimnywtmnfzgocksr
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs text-gray-600 dark:text-gray-300">
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-xs">Conexión Supabase PostgreSQL Activa</p>
              <p className="text-[11px] opacity-90">
                Modelo relacional con 12 tablas, llaves foráneas, índices B-Tree y RLS activo.
              </p>
            </div>
          </div>

          <div className="space-y-2 bg-[#FAF8F5] dark:bg-[#0F141C] p-4 rounded-xl border border-[#E5DFC9] dark:border-[#263040] font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Motor DB:</span>
              <span className="font-bold text-gray-900 dark:text-white">PostgreSQL 17 (Supabase Cloud)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Región:</span>
              <span className="text-gray-900 dark:text-white">sa-east-1 (São Paulo, América del Sur)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Storage Bucket:</span>
              <span className="text-gray-900 dark:text-white">bitacora-fotos (Público)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Integridad:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">ACID & 3FN Normalizado</span>
            </div>
          </div>

          {syncStatus && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300">
              {syncStatus}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSyncSupabase}
              disabled={isSyncing}
              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 font-heading transition-all disabled:opacity-50 text-[11px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Subir a Supabase'}</span>
            </button>
            <button
              onClick={handlePullSupabase}
              disabled={isSyncing}
              className="flex-1 py-2.5 px-3 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl flex items-center justify-center gap-2 font-heading transition-all disabled:opacity-50 text-[11px]"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Descargar de Supabase</span>
            </button>
            <button
              onClick={onClose}
              className="py-2.5 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all text-[11px]"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}