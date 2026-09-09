import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseStorageService } from './config';

export class StorageService {
  private get storage() {
    return getFirebaseStorageService();
  }

  /**
   * Sube un archivo a Firebase Storage y retorna la URL pública de descarga
   */
  async uploadFile(file: File, folder: 'bitacora' | 'imprevistos' | 'pagos' | 'planos' = 'bitacora'): Promise<string> {
    try {
      const extension = file.name.split('.').pop() || 'jpg';
      const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
      const fileName = `${Date.now()}_${randomSuffix}.${extension}`;
      const storageRef = ref(this.storage, `${folder}/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error al subir archivo a Firebase Storage:', error);
      throw error;
    }
  }

  /**
   * Elimina un archivo de Firebase Storage dado su URL
   */
  async deleteFileByUrl(url: string): Promise<void> {
    try {
      const storageRef = ref(this.storage, url);
      await deleteObject(storageRef);
    } catch (error) {
      console.warn('Error al eliminar archivo de Firebase Storage:', error);
    }
  }
}

export const storageService = new StorageService();
