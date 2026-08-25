'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  Trash2,
} from 'lucide-react';
import {
  getSupabaseCredentials,
  isSupabaseConfigured,
  saveCustomSupabaseCredentials,
  clearCustomSupabaseCredentials,
  getSupabaseClient,
} from '@/lib/supabase/client';

interface SupabaseConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SupabaseConnectModal({ isOpen, onClose }: SupabaseConnectModalProps) {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [status, setStatus] = useState<'checking' | 'connected' | 'error' | 'disconnected'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [tablesCount, setTablesCount] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      const creds = getSupabaseCredentials();
      setUrl(creds.url.includes('placeholder') ? '' : creds.url);
      setAnonKey(creds.anonKey.includes('placeholder') ? '' : creds.anonKey);
      checkConnection();
    }
  }, [isOpen]);

  const checkConnection = async () => {
    if (!isSupabaseConfigured()) {
      setStatus('disconnected');
      return;
    }

    setIsTesting(true);
    setErrorMessage(null);

    try {
      const client = getSupabaseClient();
      if (!client) {
        setStatus('error');
        setErrorMessage('No se pudo inicializar el cliente de Supabase.');
        setIsTesting(false);
        return;
      }

      // Probar consulta a la tabla empresas o catálogo
      const { data, error } = await client.from('empresas').select('id, nombre').limit(1);

      if (error) {
        setStatus('error');
        setErrorMessage(error.message || 'Error al conectar con las tablas de PostgreSQL.');
      } else {
        setStatus('connected');
        setTablesCount(data ? data.length : 0);
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Error de red al consultar Supabase.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) return;

    saveCustomSupabaseCredentials(url.trim(), anonKey.trim());
    await checkConnection();
  };

  const handleDisconnect = () => {
    clearCustomSupabaseCredentials();
    setUrl('');
    setAnonKey('');
    setStatus('disconnected');
    setTablesCount(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-kraft-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-kraft-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/30 flex items-center justify-center text-[#3ECF8E]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-black text-base text-navy-900">
                Conexión con Supabase
              </h3>
              <p className="text-[11px] text-gray-500 font-sans">
                PostgreSQL en la nube, pgvector y sincronización multi-dispositivo
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Estado actual */}
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            status === 'connected'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : status === 'error'
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {status === 'connected' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : status === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            ) : (
              <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse shrink-0 ml-1" />
            )}
            <div>
              <p className="text-xs font-bold font-heading">
                {status === 'connected'
                  ? '🟢 Conectado con Supabase PostgreSQL'
                  : status === 'error'
                  ? '🔴 Error de Conexión con Supabase'
                  : '🟡 Modo Local / Esperando Credenciales'}
              </p>
              <p className="text-[11px] font-sans mt-0.5 opacity-90">
                {status === 'connected'
                  ? 'Las tablas de obras, clientes, materiales y bitácoras están activas.'
                  : status === 'error'
                  ? errorMessage || 'Verifica la URL y la Anon Key.'
                  : 'Pega tus credenciales de Supabase para activar la base de datos en la nube.'}
              </p>
            </div>
          </div>

          {status === 'connected' && (
            <button
              onClick={checkConnection}
              disabled={isTesting}
              className="p-2 text-emerald-700 hover:bg-emerald-100 rounded-xl transition-colors shrink-0"
              title="Re-probar conexión"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Formulario de credenciales */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
              Project URL de Supabase *
            </label>
            <input
              type="url"
              required
              placeholder="https://xyzabcdefghijklm.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-[#3ECF8E]"
            />
            <span className="text-[10px] text-gray-400 font-mono mt-1 block">
              La encuentras en Supabase: <strong>Project Settings &gt; API &gt; Project URL</strong>
            </span>
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold text-gray-700 uppercase mb-1">
              Project API Anon Key (Pública) *
            </label>
            <input
              type="text"
              required
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              className="w-full px-3.5 py-2 bg-kraft-50 border border-kraft-200 rounded-xl text-xs font-mono focus:outline-none focus:border-[#3ECF8E]"
            />
            <span className="text-[10px] text-gray-400 font-mono mt-1 block">
              La encuentras en Supabase: <strong>Project Settings &gt; API &gt; anon / public key</strong>
            </span>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-kraft-200">
            {status === 'connected' ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1.5 font-heading"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            ) : (
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 font-mono"
              >
                <span>Ir al Dashboard</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-gray-600 hover:text-gray-900"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={isTesting}
                className="px-4 py-2 bg-[#3ECF8E] hover:bg-[#34b27b] text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 font-heading transition-all"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Guardar y Conectar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}
