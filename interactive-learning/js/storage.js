/**
 * storage.js — Simple localStorage wrapper
 * Exposes: save(key, value), load(key, defaultVal), remove(key)
 */
(function () {
  'use strict';

  var Storage = {
    /**
     * Save a value to localStorage under the given key.
     * Serializes non-string values as JSON.
     * @param {string} key
     * @param {*} value
     */
    save: function (key, value) {
      try {
        var data = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, data);
      } catch (e) {
        console.warn('[storage] Failed to save key "' + key + '":', e);
      }
    },

    /**
     * Load a value from localStorage.
     * Returns defaultVal if the key doesn't exist or on error.
     * Attempts to parse JSON; falls back to raw string.
     * @param {string} key
     * @param {*} defaultVal
     * @returns {*}
     */
    load: function (key, defaultVal) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return defaultVal;
        // Try JSON parse first
        try {
          return JSON.parse(raw);
        } catch (_) {
          return raw;
        }
      } catch (e) {
        console.warn('[storage] Failed to load key "' + key + '":', e);
        return defaultVal;
      }
    },

    /**
     * Remove a key from localStorage.
     * @param {string} key
     */
    remove: function (key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn('[storage] Failed to remove key "' + key + '":', e);
      }
    }
  };

  // Export for browser and module environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
  } else {
    window.Storage = Storage;
  }
})();
