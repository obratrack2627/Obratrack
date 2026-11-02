import { dataService } from './data-service';

export interface ObraTrackFullBackup {
  version: string;
  fecha_exportacion: string;
  empresa: {
    id?: string;
    nombre: string;
    rut: string;
    plan_activo: string;
  };
  usuario_exportador: {
    nombre?: string;
    email?: string;
    rol?: string;
  };
  proyectos: any[];
  actividades_gantt: any[];
  pagos_finanzas: any[];
  imprevistos: any[];
  materiales: any[];
  bitacora_fotos: any[];
  reclamos_cambios: any[];
  documentos_obra: any[];
  asistencias: any[];
  eventos_agenda: any[];
  cotizaciones: any[];
  reportes_faena: any[];
  clientes: any[];
  equipo_cuadrilla: any[];
}

export const exportService = {
  /**
   * Construye el objeto íntegro de portabilidad de datos de la constructora (Ley 21.719 / Ley 21.663)
   */
  buildFullBackupPayload(): ObraTrackFullBackup {
    const activeUser = dataService.getActiveUser();
    return {
      version: 'ObraTrack 1.1 (Chile Compliance - Ley 21.719 & 21.663)',
      fecha_exportacion: new Date().toISOString(),
      empresa: {
        id: activeUser?.empresa_id,
        nombre: activeUser?.empresa_nombre || 'Constructora',
        rut: activeUser?.rut || 'Sin RUT',
        plan_activo: dataService.getActivePlan(),
      },
      usuario_exportador: {
        nombre: activeUser?.nombre,
        email: activeUser?.email,
        rol: activeUser?.rol,
      },
      proyectos: dataService.getProyectos(),
      actividades_gantt: dataService.getActividades(),
      pagos_finanzas: dataService.getPagos(),
      imprevistos: dataService.getImprevistos(),
      materiales: dataService.getMaterialesProyecto(),
      bitacora_fotos: dataService.getBitacora(),
      reclamos_cambios: dataService.getReclamosCambios(),
      documentos_obra: dataService.getDocumentosObra(),
      asistencias: dataService.getAsistencias(),
      eventos_agenda: dataService.getEventosAgenda(),
      cotizaciones: dataService.getCotizaciones(),
      reportes_faena: dataService.getReportes(),
      clientes: dataService.getClientes(),
      equipo_cuadrilla: dataService.getUsuarios().map((u) => ({
        nombre: u.nombre,
        rol: u.rol,
        rut: u.rut,
        telefono: u.telefono_whatsapp,
      })),
    };
  },

  /**
   * Genera y descarga un respaldo completo e íntegro de todos los datos de la constructora
   */
  exportAllDataAsJSON(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const backup = this.buildFullBackupPayload();
      const jsonContent = JSON.stringify(backup, null, 2);
      const filename = `ObraTrack_Backup_${backup.empresa.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;

      const downloadAnchor = document.createElement('a');
      let objectUrl: string | null = null;

      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
        objectUrl = URL.createObjectURL(blob);
        downloadAnchor.setAttribute('href', objectUrl);
      } else {
        downloadAnchor.setAttribute(
          'href',
          'data:text/json;charset=utf-8,' + encodeURIComponent(jsonContent)
        );
      }

      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000);
      }

      return true;
    } catch (err) {
      console.error('Error al exportar datos de ObraTrack:', err);
      return false;
    }
  },

  /**
   * Elimina de forma segura y completa todos los datos locales (Derecho de Supresión / Olvido)
   */
  eliminarCuentaYDatosLocales(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = 'obratrack_auth_token=; path=/; max-age=0; SameSite=Lax';
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },
};
