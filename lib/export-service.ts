import { dataService } from './data-service';

export interface ObraTrackFullBackup {
  version: string;
  fecha_exportacion: string;
  empresa: any;
  usuario_exportador: any;
  proyectos: any[];
  actividades_gantt: any[];
  pagos_finanzas: any[];
  imprevistos: any[];
  materiales: any[];
  bitacora_fotos: any[];
  reportes_faena: any[];
  clientes: any[];
  equipo_cuadrilla: any[];
}

export const exportService = {
  /**
   * Genera y descarga un respaldo completo e íntegro de todos los datos de la constructora (Ley 21.663 - Portabilidad)
   */
  exportAllDataAsJSON(): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const activeUser = dataService.getActiveUser();
      const backup: ObraTrackFullBackup = {
        version: 'ObraTrack 1.0 (Chile Compliance)',
        fecha_exportacion: new Date().toISOString(),
        empresa: {
          nombre: activeUser?.empresa_nombre || 'Constructora',
          rut: activeUser?.rut || 'Sin RUT',
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
        materiales: dataService.getItem('obratrack_materiales_proyecto_v6', []),
        bitacora_fotos: dataService.getBitacora(),
        reportes_faena: dataService.getReportes(),
        clientes: dataService.getClientes(),
        equipo_cuadrilla: dataService.getUsuarios().map((u) => ({
          nombre: u.nombre,
          rol: u.rol,
          rut: u.rut,
          telefono: u.telefono_whatsapp,
        })),
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
      const downloadAnchor = document.createElement('a');
      const filename = `ObraTrack_Backup_${(activeUser?.empresa_nombre || 'Constructora').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

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
      document.cookie = 'obratrack_auth_token=; path=/; max-age=0';
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },
};