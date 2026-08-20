/**
 * Diseño: cartografía técnica sobria. Las imágenes del plano se guardan fuera
 * de localStorage para que los controles espaciales no fallen por cuota.
 */
const DATABASE_NAME = 'photovault-media';
const STORE_NAME = 'blueprints';
const ACTIVE_BLUEPRINT_KEY = 'active-blueprint-image';

function openBlueprintDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB no está disponible en este navegador.'));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento de planos.'));
  });
}

export async function saveBlueprintImage(imageUrl: string): Promise<void> {
  const database = await openBlueprintDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(imageUrl, ACTIVE_BLUEPRINT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar la imagen del plano.'));
    transaction.onabort = () => reject(transaction.error || new Error('El almacenamiento del plano fue interrumpido.'));
  });
  database.close();
}

export async function loadBlueprintImage(): Promise<string | null> {
  const database = await openBlueprintDatabase();
  const imageUrl = await new Promise<string | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(ACTIVE_BLUEPRINT_KEY);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => reject(request.error || new Error('No se pudo recuperar la imagen del plano.'));
  });
  database.close();
  return imageUrl;
}

export function isQuotaExceededError(error: unknown): boolean {
  const errorName = error instanceof DOMException ? error.name : '';
  const errorMessage = error instanceof Error ? error.message : String(error || '');
  return errorName === 'QuotaExceededError' || /quota|storage.*full|exceeded/i.test(errorMessage);
}
