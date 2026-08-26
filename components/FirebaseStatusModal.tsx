'use client';

import React, { useState } from 'react';
import { Database, CheckCircle2, RefreshCw, Server, X, AlertCircle } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { firebaseConfig } from '@/lib/firebase/config';

interface FirebaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FirebaseStatusModal({ isOpen, onClose }: FirebaseStatusModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setErrorMsg(null);
    try {
      const res = await dataService.syncWithFirestore();
      if (res.success) {
        setSyncStatus(res.message);
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al conectar con Firestore.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center justify-between p-5 border-b border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5] dark:bg-[#0F141C]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/15 flex items-center justify-center text-[#FF6A00]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-gray-900 dark:text-white">
                Estado de Firebase Backend
              </h3>
              <p className="text-xs text-gray-500 font-mono">
                Cloud Firestore & Firebase Auth ({firebaseConfig.projectId})
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
              <p className="font-bold text-xs">Conexión con Firebase Activa</p>
              <p className="text-[11px] opacity-90">
                La aplicación está integrada con el backend de Google Firebase.
              </p>
            </div>
          </div>

          <div className="space-y-2 bg-[#FAF8F5] dark:bg-[#0F141C] p-4 rounded-xl border border-[#E5DFC9] dark:border-[#263040] font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Proyecto:</span>
              <span className="font-bold text-gray-900 dark:text-white">{firebaseConfig.projectId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Auth Domain:</span>
              <span className="text-gray-900 dark:text-white">{firebaseConfig.authDomain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Storage Bucket:</span>
              <span className="text-gray-900 dark:text-white">{firebaseConfig.storageBucket}</span>
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

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex-1 py-2.5 px-4 bg-[#FF6A00] hover:bg-[#E55F00] text-white font-bold rounded-xl flex items-center justify-center gap-2 font-heading transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Datos Locales a Firestore'}</span>
            </button>
            <button
              onClick={onClose}
              className="py-2.5 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
