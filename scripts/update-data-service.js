const fs = require('fs');

let content = fs.readFileSync('C:/Users/Benja/.gemini/antigravity-ide/scratch/ObraTrack/lib/data-service.ts', 'utf8');

// 1. Agregar importación de supabaseService si no está presente
if (!content.includes("from './supabase/supabase-service'")) {
  content = content.replace(
    "import { firestoreService } from './firebase/firestore';",
    "import { firestoreService } from './firebase/firestore';\nimport { supabaseService } from './supabase/supabase-service';"
  );
}

// 2. Conectar llamadas de Supabase junto a Firestore
content = content.replace(
  "firestoreService.saveUsuario(newUsuario).catch((err) => console.warn('Sync usuario:', err));",
  "firestoreService.saveUsuario(newUsuario).catch(() => {});\n    supabaseService.saveUsuario(newUsuario).catch((err) => console.warn('Sync supabase usuario:', err));"
);

content = content.replace(
  "firestoreService.saveUsuario(usuarios[index]).catch((err) => console.warn('Sync usuario:', err));",
  "firestoreService.saveUsuario(usuarios[index]).catch(() => {});\n    supabaseService.saveUsuario(usuarios[index]).catch((err) => console.warn('Sync supabase usuario:', err));"
);

content = content.replace(
  "firestoreService.saveCliente(newCliente).catch((err) => console.warn('Sync cliente:', err));",
  "firestoreService.saveCliente(newCliente).catch(() => {});\n    supabaseService.saveCliente(newCliente).catch((err) => console.warn('Sync supabase cliente:', err));"
);

content = content.replace(
  "firestoreService.saveCliente(clientes[index]).catch((err) => console.warn('Sync cliente:', err));",
  "firestoreService.saveCliente(clientes[index]).catch(() => {});\n    supabaseService.saveCliente(clientes[index]).catch((err) => console.warn('Sync supabase cliente:', err));"
);

content = content.replace(
  "firestoreService.deleteCliente(id).catch((err) => console.warn('Delete cliente:', err));",
  "firestoreService.deleteCliente(id).catch(() => {});\n    supabaseService.deleteCliente(id).catch((err) => console.warn('Delete supabase cliente:', err));"
);

content = content.replace(
  "firestoreService.saveProyecto(newProyecto).catch((err) => console.warn('Sync proyecto:', err));",
  "firestoreService.saveProyecto(newProyecto).catch(() => {});\n    supabaseService.saveProyecto(newProyecto).catch((err) => console.warn('Sync supabase proyecto:', err));"
);

content = content.replace(
  "firestoreService.saveProyecto(proyectos[index]).catch((err) => console.warn('Sync proyecto:', err));",
  "firestoreService.saveProyecto(proyectos[index]).catch(() => {});\n    supabaseService.saveProyecto(proyectos[index]).catch((err) => console.warn('Sync supabase proyecto:', err));"
);

content = content.replace(
  "firestoreService.deleteProyecto(id).catch((err) => console.warn('Delete proyecto:', err));",
  "firestoreService.deleteProyecto(id).catch(() => {});\n    supabaseService.deleteProyecto(id).catch((err) => console.warn('Delete supabase proyecto:', err));"
);

content = content.replace(
  "firestoreService.saveMaterial(newMat).catch((err) => console.warn('Sync mat:', err));",
  "firestoreService.saveMaterial(newMat).catch(() => {});\n    supabaseService.saveMaterial(newMat).catch((err) => console.warn('Sync supabase mat:', err));"
);

content = content.replace(
  "firestoreService.saveMaterial(all[idx]).catch((err) => console.warn('Sync mat:', err));",
  "firestoreService.saveMaterial(all[idx]).catch(() => {});\n    supabaseService.saveMaterial(all[idx]).catch((err) => console.warn('Sync supabase mat:', err));"
);

content = content.replace(
  "firestoreService.deleteMaterial(id).catch((err) => console.warn('Delete mat:', err));",
  "firestoreService.deleteMaterial(id).catch(() => {});\n    supabaseService.deleteMaterial(id).catch((err) => console.warn('Delete supabase mat:', err));"
);

content = content.replace(
  "firestoreService.saveBitacoraEntrada(newEntry).catch((err) => console.warn('Sync bitacora:', err));",
  "firestoreService.saveBitacoraEntrada(newEntry).catch(() => {});\n    supabaseService.saveBitacora(newEntry).catch((err) => console.warn('Sync supabase bitacora:', err));"
);

content = content.replace(
  "firestoreService.saveBitacoraEntrada(all[index]).catch((err) => console.warn('Sync bitacora:', err));",
  "firestoreService.saveBitacoraEntrada(all[index]).catch(() => {});\n    supabaseService.saveBitacora(all[index]).catch((err) => console.warn('Sync supabase bitacora:', err));"
);

content = content.replace(
  "firestoreService.deleteBitacoraEntrada(id).catch((err) => console.warn('Delete bitacora:', err));",
  "firestoreService.deleteBitacoraEntrada(id).catch(() => {});\n    supabaseService.deleteBitacora(id).catch((err) => console.warn('Delete supabase bitacora:', err));"
);

content = content.replace(
  "firestoreService.saveActividad(newAct).catch((err) => console.warn('Sync act:', err));",
  "firestoreService.saveActividad(newAct).catch(() => {});\n    supabaseService.saveActividad(newAct).catch((err) => console.warn('Sync supabase act:', err));"
);

content = content.replace(
  "firestoreService.saveActividad(all[index]).catch((err) => console.warn('Sync act:', err));",
  "firestoreService.saveActividad(all[index]).catch(() => {});\n    supabaseService.saveActividad(all[index]).catch((err) => console.warn('Sync supabase act:', err));"
);

content = content.replace(
  "firestoreService.deleteActividad(id).catch((err) => console.warn('Delete act:', err));",
  "firestoreService.deleteActividad(id).catch(() => {});\n    supabaseService.deleteActividad(id).catch((err) => console.warn('Delete supabase act:', err));"
);

content = content.replace(
  "firestoreService.savePago(newPago).catch((err) => console.warn('Sync pago:', err));",
  "firestoreService.savePago(newPago).catch(() => {});\n    supabaseService.savePago(newPago).catch((err) => console.warn('Sync supabase pago:', err));"
);

content = content.replace(
  "firestoreService.savePago(pagos[index]).catch((err) => console.warn('Sync pago:', err));",
  "firestoreService.savePago(pagos[index]).catch(() => {});\n    supabaseService.savePago(pagos[index]).catch((err) => console.warn('Sync supabase pago:', err));"
);

content = content.replace(
  "firestoreService.deletePago(id).catch((err) => console.warn('Delete pago:', err));",
  "firestoreService.deletePago(id).catch(() => {});\n    supabaseService.deletePago(id).catch((err) => console.warn('Delete supabase pago:', err));"
);

content = content.replace(
  "firestoreService.saveImprevisto(newImp).catch((err) => console.warn('Sync imp:', err));",
  "firestoreService.saveImprevisto(newImp).catch(() => {});\n    supabaseService.saveImprevisto(newImp).catch((err) => console.warn('Sync supabase imp:', err));"
);

// 3. Añadir métodos syncWithSupabase y pullFromSupabase
const supabaseMethods = `
  // --- SINCRONIZACIÓN CON SUPABASE POSTGRESQL ---
  async syncWithSupabase(): Promise<{ success: boolean; message: string; count?: number }> {
    try {
      const proyectos = this.getProyectos();
      const actividades = this.getActividades();
      const pagos = this.getPagos();
      const imprevistos = this.getImprevistos();
      const materiales = this.getMaterialesProyecto();
      const bitacora = this.getBitacora();
      const clientes = this.getClientes();
      const usuarios = this.getUsuarios();

      const result = await supabaseService.bulkSyncToSupabase({
        proyectos,
        actividades,
        pagos,
        imprevistos,
        materiales,
        bitacora,
        clientes,
        usuarios,
      });

      if (result.success) {
        return {
          success: true,
          count: result.count,
          message: \`Sincronización exitosa con Supabase PostgreSQL (\${result.count} registros).\`,
        };
      } else {
        return {
          success: false,
          message: result.error || 'Error al sincronizar con Supabase.',
        };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Error de sincronización con Supabase.' };
    }
  }

  async pullFromSupabase(): Promise<{ success: boolean; message: string }> {
    try {
      const [projs, acts, pgs, clis, usrs, mats, bit, imps] = await Promise.all([
        supabaseService.getProyectos(),
        supabaseService.getActividades(),
        supabaseService.getPagos(),
        supabaseService.getClientes(),
        supabaseService.getUsuarios(),
        supabaseService.getMateriales(),
        supabaseService.getBitacora(),
        supabaseService.getImprevistos(),
      ]);

      if (projs.length > 0) this.setItem(KEYS.PROYECTOS, projs);
      if (acts.length > 0) this.setItem(KEYS.ACTIVIDADES, acts);
      if (pgs.length > 0) this.setItem(KEYS.PAGOS, pgs);
      if (clis.length > 0) this.setItem(KEYS.CLIENTES, clis);
      if (usrs.length > 0) this.setItem(KEYS.USUARIOS, usrs);
      if (mats.length > 0) this.setItem(KEYS.MATERIALES_PROYECTO, mats);
      if (bit.length > 0) this.setItem(KEYS.BITACORA, bit);
      if (imps.length > 0) this.setItem(KEYS.IMPREVISTOS, imps);

      return { success: true, message: 'Datos descargados exitosamente desde Supabase PostgreSQL.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error al obtener datos desde Supabase.' };
    }
  }
`;

if (!content.includes('syncWithSupabase()')) {
  content = content.replace(
    '  // --- SINCRONIZACIÓN CON FIREBASE CLOUD FIRESTORE ---',
    `${supabaseMethods}\n  // --- SINCRONIZACIÓN CON FIREBASE CLOUD FIRESTORE ---`
  );
}

fs.writeFileSync('C:/Users/Benja/.gemini/antigravity-ide/scratch/ObraTrack/lib/data-service.ts', content, 'utf8');
console.log('✅ lib/data-service.ts actualizado con persistencia y sincronización Supabase.');