/**
 * VaultService.js
 *
 * Provides encrypted storage for sensitive user data (passwords, addresses, etc.)
 * using Electron's safeStorage API and electron-store.
 *
 * This allows the agent to perform "Semantic Autofill" by looking up
 * relevant information from the vault when filling forms.
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';

const store = new Store({ name: 'veribrowse-vault' });

class VaultService {
    /**
     * Store a value in the vault, encrypted.
     */
    set(key, value) {
        if (!safeStorage.isEncryptionAvailable()) {
            // Fallback for systems without encryption (not recommended)
            store.set(key, value);
            return;
        }

        const buffer = Buffer.from(value, 'utf-8');
        const encrypted = safeStorage.encryptString(value);
        // store the encrypted string (which is already encoded for storage by electron-store)
        store.set(key, encrypted);
    }

    /**
     * Retrieve and decrypt a value from the vault.
     */
    get(key) {
        const data = store.get(key);
        if (!data) return null;

        if (!safeStorage.isEncryptionAvailable()) {
            return data;
        }

        try {
            // data is the string/buffer returned by electron-store
            return safeStorage.decryptString(Buffer.from(data));
        } catch (e) {
            console.error(`[VaultService] Decryption failed for key "${key}":`, e.message);
            return null;
        }
    }

    /**
     * Delete a key from the vault.
     */
    delete(key) {
        store.delete(key);
    }

    /**
     * List all keys (for UI display).
     */
    listKeys() {
        return Object.keys(store.store);
    }

    /**
     * Clear the entire vault.
     */
    clear() {
        store.clear();
    }
}

export default new VaultService();
