/**
 * utils.js — Shared pure utility functions for the interactive-learning SPA.
 *
 * Exposes: window.Utils
 *   - shuffle(arr)              Fisher-Yates shuffle, returns a new array
 *   - scorePercent(c, t)        Returns 0–100 integer percentage
 *   - isInputFocused()          True when focus is on a text-input element
 *   - renderMarkdown(text)      Converts simple markdown to safe HTML
 *   - escapeHtml(str)           HTML-escapes a plain string
 */
(function () {
  'use strict';

  var Utils = {

    /**
     * Fisher-Yates shuffle — returns a NEW shuffled array, original is untouched.
     * @param {Array} arr
     * @returns {Array}
     */
    shuffle: function (arr) {
      var copy = arr.slice();
      for (var i = copy.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    },

    /**
     * Returns the percentage of correct answers, rounded to the nearest integer.
     * Returns 0 when total is 0 to avoid division-by-zero.
     * @param {number} correct
     * @param {number} total
     * @returns {number}
     */
    scorePercent: function (correct, total) {
      if (!total) return 0;
      return Math.round((correct / total) * 100);
    },

    /**
     * Returns true when the browser focus is currently inside a text-input
     * element (input, textarea, select, or contenteditable).
     * Use this to guard global keyboard shortcuts.
     * @returns {boolean}
     */
    isInputFocused: function () {
      var el = document.activeElement;
      if (!el) return false;
      var tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    },

    /**
     * Escape a plain string so it is safe to inject into innerHTML.
     * @param {string|*} str
     * @returns {string}
     */
    escapeHtml: function (str) {
      if (typeof str !== 'string') return String(str == null ? '' : str);
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    },

    /**
     * Render simple markdown-like content to HTML.
     * Supports: ### headings, > blockquotes, **bold**, *italic*, `code`, [link](url), newlines.
     * Input is HTML-escaped first to prevent XSS.
     * @param {string} text
     * @returns {string} HTML string
     */
    renderMarkdown: function (text) {
      if (typeof text !== 'string') return '';
      var html = Utils.escapeHtml(text);
      // ### Headings
      html = html.replace(
        /(?:^|\r?\n)###\s*(.+?)(?=\r?\n|$)/g,
        '<h3 class="text-base font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h3>'
      );
      // > Blockquotes
      html = html.replace(
        /(?:^|\r?\n)>\s*(.+?)(?=\r?\n|$)/g,
        '<blockquote class="border-l-4 border-indigo-500 dark:border-indigo-400 pl-4 py-1 my-3 italic text-gray-600 dark:text-gray-300">$1</blockquote>'
      );
      // **Bold**
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // *Italic*
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // `Code`
      html = html.replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-sm">$1</code>');
      // [Link](url)
      html = html.replace(
        /\[(.+?)\]\((.+?)\)/g,
        '<a href="$2" target="_blank" rel="noopener" class="text-blue-600 dark:text-blue-400 underline">$1</a>'
      );
      // Newlines → <br>
      html = html.replace(/\r?\n/g, '<br>');
      return html;
    }
  };

  // Expose globally; also support CommonJS for test environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
  } else {
    window.Utils = Utils;
  }

})();
