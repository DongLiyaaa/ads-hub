const DATABASE_NAME = 'sharescope-report-cache';
const STORE_NAME = 'reports';
export const REPORT_CACHE_TTL = 2 * 60 * 60 * 1000;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function cacheKey({ userId, tenantId, storeId, reportType }) {
  return `${userId}:${tenantId}:${storeId}:${reportType}`;
}

export async function getCachedReport(identity) {
  let database;
  try {
    database = await openDatabase();
    const entry = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(cacheKey(identity));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      database.close();
      database = null;
      await deleteCachedReport(identity);
      return null;
    }
    return entry;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function setCachedReport(identity, payload) {
  let database;
  try {
    database = await openDatabase();
    const cachedAt = Date.now();
    await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
        key: cacheKey(identity), payload, cachedAt, expiresAt: cachedAt + REPORT_CACHE_TTL,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return { cachedAt, expiresAt: cachedAt + REPORT_CACHE_TTL };
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function deleteCachedReport(identity) {
  let database;
  try {
    database = await openDatabase();
    await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(cacheKey(identity));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Cache failures never block report loading.
  } finally {
    database?.close();
  }
}

export function clearReportCache() {
  return new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve();
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
