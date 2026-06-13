/**
 * alpine-init.js — Alpine.js store definitions and data components
 * for the interactive learning SPA.
 *
 * Depends on: Alpine.js (via CDN), Storage (./storage.js)
 */
(function () {
  'use strict';

  document.addEventListener('alpine:init', function () {

    /* ------------------------------------------------------------------ */
    /*  Global store: app                                                  */
    /* ------------------------------------------------------------------ */
    Alpine.store('app', {
      // --- Pages ---
      pages: [],
      currentPageIndex: 0,
      searchQuery: '',
      filteredPageIndices: null,  // null = show all, array = filtered indices

      // --- UI State ---
      darkMode: false,
      isLoading: false,
      error: null,
      showShortcuts: false,
      showDashboard: false,  // progress dashboard overlay
      sidebarOpen: false,  // mobile sidebar toggle
      _renamingIndex: null,  // index of page being renamed (null = none)
      _contextMenu: null,    // { index, x, y } or null

      // --- Content Dedup ---
      pageHashes: {},  // hash -> true mapping for duplicate detection

      // --- Progress ---
      progress: {
        viewedPages: new Set(),
        quizScores: {}
      },

      /* ---- Computed-like getters (called as methods in templates) ---- */

       /**
        * Returns the number of completed pages.
        */
       get completedCount() {
         var count = 0;
         for (var i = 0; i < this.pages.length; i++) {
           if (this.isPageCompleted(i)) count++;
         }
         return count;
       },

       /**
        * Returns the percentage of completed pages.
        */
       get completedPercent() {
         if (this.pages.length === 0) return 0;
         return Math.round((this.completedCount / this.pages.length) * 100);
       },

       /**
        * Returns the current page object, or null.
        */
       get currentPage() {
         var pages = this.pages;
        var idx = this.currentPageIndex;
        if (!pages || pages.length === 0) return null;
        if (idx < 0 || idx >= pages.length) return null;
        return pages[idx];
      },

      /**
       * Returns the list of page indices that match the search query.
       * When searchQuery is empty, returns all indices.
       */
      get visibleIndices() {
        var self = this;
        if (!self.searchQuery || self.searchQuery.trim() === '') {
          return self.pages.map(function (_, i) { return i; });
        }
        var q = self.searchQuery.toLowerCase().trim();
        var result = [];
        self.pages.forEach(function (page, i) {
          if (self._pageMatches(page, q)) {
            result.push(i);
          }
        });
        return result;
      },

      /**
       * The number of pages matching the current filter.
       */
      get visibleCount() {
        return this.visibleIndices.length;
      },

      /**
       * Whether the current page index is within visible results.
       */
      get isCurrentPageVisible() {
        return this.visibleIndices.indexOf(this.currentPageIndex) !== -1;
      },

      /* ---- Actions ---- */

      /**
       * Add a validated learning page object (with dedup check).
       * @param {object} pageObj
       * @param {string} [fileName] - Optional source filename for dedup messaging
       * @returns {boolean} true if added, false if duplicate
       */
      addPage: function (pageObj, fileName) {
        var hash = computeContentHash(pageObj);
        if (hash && this.pageHashes[hash]) {
          var msg = 'Duplicate page: "' + (pageObj.page && pageObj.page.title || 'Untitled') + '"';
          if (fileName) msg += ' (' + fileName + ')';
          var toastsStore = Alpine.store('toasts');
          if (toastsStore) toastsStore.add(msg, 'warning', { duration: 3000 });
          return false;
        }
        this.pages.push(pageObj);
        if (hash) {
          this.pageHashes[hash] = true;
        }
        if (this.pages.length === 1) {
          this.currentPageIndex = 0;
        }
        this.error = null;
        this._saveSession();
        return true;
      },

      /**
       * Remove a page by index with undo support.
       * @param {number} index
       */
      removePage: function (index) {
        if (index < 0 || index >= this.pages.length) return;
        var pageTitle = (this.pages[index].page && this.pages[index].page.title) || 'Untitled';
        var removedPage = this.pages[index];
        var removedHash = computeContentHash(removedPage);
        var removedIndex = index;

        // Remove from array (before toast so state is consistent)
        this.pages.splice(index, 1);
        if (removedHash) {
          delete this.pageHashes[removedHash];
        }

        // Adjust currentPageIndex
        if (this.pages.length === 0) {
          this.currentPageIndex = -1;
        } else if (this.currentPageIndex >= this.pages.length) {
          this.currentPageIndex = this.pages.length - 1;
        } else if (index < this.currentPageIndex) {
          this.currentPageIndex--;
        }

        this._saveSession();

        // Show undo toast (non-blocking, 5s timeout)
        var toastsStore = Alpine.store('toasts');
        if (toastsStore) {
          var self = this;
          toastsStore.add('Deleted "' + pageTitle + '"', 'warning', {
            duration: 5000,
            undo: function () {
              self.pages.splice(removedIndex, 0, removedPage);
              if (removedHash) {
                self.pageHashes[removedHash] = true;
              }
              if (self.currentPageIndex === -1) {
                self.currentPageIndex = removedIndex;
              } else if (removedIndex <= self.currentPageIndex) {
                self.currentPageIndex++;
              }
              self._saveSession();
            }
          });
        }
      },

      /**
       * Remove all pages with confirmation.
       */
      removeAllPages: function () {
        if (this.pages.length === 0) return;
        if (!confirm('Are you sure you want to delete ALL ' + this.pages.length + ' pages? This cannot be undone.')) return;

        this.pages = [];
        this.pageHashes = {};
        this.currentPageIndex = -1;
        this.progress.viewedPages = new Set();
        this.progress.quizScores = {};
        this._saveSession();

        var toastsStore = Alpine.store('toasts');
        if (toastsStore) {
          toastsStore.add('All pages deleted', 'warning', { duration: 2000 });
        }
      },

      /**
       * Rename a page.
       * @param {number} index
       * @param {string} newTitle
       */
      renamePage: function (index, newTitle) {
        if (index < 0 || index >= this.pages.length) return;
        if (!newTitle || newTitle.trim() === '') return;
        if (!this.pages[index].page) this.pages[index].page = {};
        this.pages[index].page.title = newTitle.trim();
        this._saveSession();
        var toastsStore = Alpine.store('toasts');
        if (toastsStore) {
          toastsStore.add('Page renamed to "' + newTitle.trim() + '"', 'success', { duration: 2000 });
        }
      },

      /**
       * Toggle page completion status.
       * @param {number} index
       */
      togglePageComplete: function (index) {
        if (index < 0 || index >= this.pages.length) return;
        var page = this.pages[index];
        if (!page._meta) page._meta = {};
        page._meta.completed = !page._meta.completed;
        this._saveSession();
        var toastsStore = Alpine.store('toasts');
        if (toastsStore) {
          if (page._meta.completed) {
            toastsStore.add('"' + (page.page && page.page.title || 'Untitled') + '" marked as complete!', 'success', { duration: 2000 });
          } else {
            toastsStore.add('"' + (page.page && page.page.title || 'Untitled') + '" marked as incomplete', 'info', { duration: 2000 });
          }
        }
      },

      /**
       * Move page from one index to another (drag-reorder).
       * @param {number} fromIndex
       * @param {number} toIndex
       */
      movePage: function (fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.pages.length) return;
        if (toIndex < 0 || toIndex >= this.pages.length) return;
        var item = this.pages.splice(fromIndex, 1)[0];
        this.pages.splice(toIndex, 0, item);
        // Adjust currentPageIndex
        if (this.currentPageIndex === fromIndex) {
          this.currentPageIndex = toIndex;
        }
        this._saveSession();
      },

      /**
       * Navigate to a specific page by index.
       * @param {number} index
       */
      goToPage: function (index) {
        if (index < 0 || index >= this.pages.length) return;
        this.currentPageIndex = index;
        // Track as viewed
        this.progress.viewedPages.add(index);
        // Force Alpine reactivity by replacing the Set
        this.progress = Object.assign({}, this.progress, {
          viewedPages: new Set(this.progress.viewedPages)
        });
        // Auto-close sidebar on mobile (viewport ≤ 767px)
        if (window.innerWidth < 768) {
          this.sidebarOpen = false;
        }
        this._saveSession();
      },

      /**
       * Navigate to the previous page.
       */
      prevPage: function () {
        var vis = this.visibleIndices;
        var cur = vis.indexOf(this.currentPageIndex);
        if (cur > 0) {
          this.goToPage(vis[cur - 1]);
        }
      },

      /**
       * Navigate to the next page.
       */
      nextPage: function () {
        var vis = this.visibleIndices;
        var cur = vis.indexOf(this.currentPageIndex);
        if (cur < vis.length - 1) {
          this.goToPage(vis[cur + 1]);
        }
      },

      /**
       * Toggle dark mode on/off.
       */
      toggleDarkMode: function () {
        this.darkMode = !this.darkMode;
        this._applyDarkMode();
      },

      /**
       * Toggle keyboard shortcuts helper on/off.
       */
      toggleShortcuts: function () {
        this.showShortcuts = !this.showShortcuts;
      },

      /**
       * Initialize dark mode from stored preference.
       */
      initDarkMode: function () {
        var saved = window.Storage ? window.Storage.load('theme', 'light') : 'light';
        this.darkMode = saved === 'dark';
        this._applyDarkMode();
      },

      /**
       * Internal: sync html class + localStorage to darkMode value.
       */
      _applyDarkMode: function () {
        var root = document.documentElement;
        if (this.darkMode) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
        if (window.Storage) {
          window.Storage.save('theme', this.darkMode ? 'dark' : 'light');
        }
      },

      /**
       * Record a quiz score for a given page.
       * @param {number} pageIndex
       * @param {object} scoreData
       */
      recordQuizScore: function (pageIndex, sectionIndex, scoreData) {
        var scores = Object.assign({}, this.progress.quizScores);
        scores[pageIndex + '-' + sectionIndex] = scoreData;
        this.progress = Object.assign({}, this.progress, { quizScores: scores });
        if (window.Storage) {
          window.Storage.save('quizScores', scores);
        }
      },

      /**
       * Save a quiz attempt to page _meta for attempt history.
       * @param {number} pageIndex
       * @param {number} sectionIndex
       * @param {object} attemptData - { attempt, correct, total, answers, timestamp }
       */
      saveQuizAttempt: function (pageIndex, sectionIndex, attemptData) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return;
        var page = this.pages[pageIndex];
        if (!page._meta) page._meta = {};
        if (!page._meta.quizAttempts) page._meta.quizAttempts = {};
        if (!page._meta.quizAttempts[sectionIndex]) {
          page._meta.quizAttempts[sectionIndex] = [];
        }
        page._meta.quizAttempts[sectionIndex].push(attemptData);
        this._saveSession();
      },

      /**
       * Get quiz attempt history for a section.
       * @param {number} pageIndex
       * @param {number} sectionIndex
       * @returns {object} { attempts: Array, bestCorrect: number, bestTotal: number }
       */
      getQuizAttemptHistory: function (pageIndex, sectionIndex) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) {
          return { attempts: [], bestCorrect: 0, bestTotal: 0 };
        }
        var page = this.pages[pageIndex];
        if (!page._meta || !page._meta.quizAttempts || !page._meta.quizAttempts[sectionIndex]) {
          return { attempts: [], bestCorrect: 0, bestTotal: 0 };
        }
        var attempts = page._meta.quizAttempts[sectionIndex];
        var bestCorrect = 0;
        var bestTotal = 0;
        for (var i = 0; i < attempts.length; i++) {
          if (attempts[i].correct > bestCorrect) {
            bestCorrect = attempts[i].correct;
            bestTotal = attempts[i].total;
          }
        }
        return { attempts: attempts, bestCorrect: bestCorrect, bestTotal: bestTotal };
      },

      /**
       * Load persisted quiz scores.
       */
      loadQuizScores: function () {
        var saved = window.Storage ? window.Storage.load('quizScores', {}) : {};
        this.progress = Object.assign({}, this.progress, { quizScores: saved });
      },

      /**
       * Check if a page has been viewed.
       * @param {number} index
       * @returns {boolean}
       */
      isPageViewed: function (index) {
        return this.progress.viewedPages.has(index);
      },

      /**
       * Check if a page has a completed quiz.
       * @param {number} index
       * @returns {boolean}
       */
      isQuizCompleted: function (index) {
        var scores = this.progress.quizScores || {};
        for (var key in scores) {
          if (key.indexOf(index + '-') === 0) return true;
        }
        return false;
      },

      /**
       * Check if a page is marked as completed.
       * @param {number} index
       * @returns {boolean}
       */
      isPageCompleted: function (index) {
        var page = this.pages[index];
        return page && page._meta && page._meta.completed === true;
      },

      /**
       * Check if a page is the page we are renaming.
       * @param {number} index
       * @returns {boolean}
       */
      isRenamingPage: function (index) {
        return this._renamingIndex === index;
      },

      /* ---- Session Persistence ---- */

      /**
       * Save entire session (pages, progress, hashes) to localStorage.
       */
      _saveSession: function () {
        if (!window.Storage) return;
        try {
          var session = {
            pages: this.pages,
            hashes: this.pageHashes,
            currentPageIndex: this.currentPageIndex,
            progress: {
              viewedPages: Array.from(this.progress.viewedPages || []),
              quizScores: this.progress.quizScores || {},
              completedPages: []
            }
          };
          // Collect completed pages
          for (var i = 0; i < this.pages.length; i++) {
            if (this.pages[i]._meta && this.pages[i]._meta.completed) {
              session.progress.completedPages.push(i);
            }
          }
          window.Storage.save('learningSession', session);
        } catch (e) {
          console.warn('[session] Failed to save session:', e);
        }
      },

      /**
       * Load session from localStorage.
       */
      _loadSession: function () {
        if (!window.Storage) return;
        try {
          var session = window.Storage.load('learningSession', null);
          if (!session || !session.pages || session.pages.length === 0) return;

          this.pages = session.pages;
          this.pageHashes = session.hashes || {};
          this.currentPageIndex = session.currentPageIndex || 0;

          // Restore progress
          var viewedSet = new Set();
          if (session.progress && session.progress.viewedPages) {
            session.progress.viewedPages.forEach(function (v) { viewedSet.add(v); });
          }
          // Restore completed meta
          if (session.progress && session.progress.completedPages) {
            session.progress.completedPages.forEach(function (idx) {
              if (session.pages[idx] && !session.pages[idx]._meta) {
                session.pages[idx]._meta = { completed: true };
              } else if (session.pages[idx]) {
                session.pages[idx]._meta.completed = true;
              }
            });
          }
          this.progress = {
            viewedPages: viewedSet,
            quizScores: (session.progress && session.progress.quizScores) || {}
          };
        } catch (e) {
          console.warn('[session] Failed to load session:', e);
        }
      },

      /* ---- Internal helpers ---- */

      /**
       * Check if a page matches a query string.
       * @param {object} page
       * @param {string} query  (lowercased, trimmed)
       * @returns {boolean}
       */
      _pageMatches: function (page, query) {
        if (!page) return false;
        var pInfo = page.page || {};
        var title = (pInfo.title || '').toLowerCase();
        var description = (pInfo.description || '').toLowerCase();
        var tags = Array.isArray(pInfo.tags) ? pInfo.tags.join(' ').toLowerCase() : '';

        return title.indexOf(query) !== -1 ||
               description.indexOf(query) !== -1 ||
               tags.indexOf(query) !== -1;
      },

      /* ---- Sticky Notes ---- */

      /**
       * Save a sticky note for a specific section on a page.
       * @param {number} pageIndex
       * @param {number} sectionIndex
       * @param {string} text - Note content
       */
      saveNote: function (pageIndex, sectionIndex, text) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return;
        var page = this.pages[pageIndex];
        if (!page._meta) page._meta = {};
        if (!page._meta.notes) page._meta.notes = {};
        if (text && text.trim()) {
          page._meta.notes[sectionIndex] = text.trim();
        } else {
          // Remove note if text is empty
          if (page._meta.notes) {
            delete page._meta.notes[sectionIndex];
          }
        }
        this._saveSession();
      },

      /**
       * Get a sticky note for a specific section on a page.
       * @param {number} pageIndex
       * @param {number} sectionIndex
       * @returns {string|null}
       */
      getNote: function (pageIndex, sectionIndex) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return null;
        var page = this.pages[pageIndex];
        if (!page._meta || !page._meta.notes) return null;
        return page._meta.notes[sectionIndex] || null;
      },

      /* ---- Quiz Attempt History ---- */

      /**
       * Record a quiz score, storing an attempt history array.
       * @param {number} pageIndex
       * @param {number} sectionIndex
       * @param {object} scoreData - { correct, total, answers }
       */
      recordQuizScore: function (pageIndex, sectionIndex, scoreData) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return;
        var page = this.pages[pageIndex];
        if (!page._meta) page._meta = {};
        if (!page._meta.quizAttempts) page._meta.quizAttempts = {};
        if (!page._meta.quizAttempts[sectionIndex]) {
          page._meta.quizAttempts[sectionIndex] = [];
        }
        page._meta.quizAttempts[sectionIndex].push({
          correct: scoreData.correct,
          total: scoreData.total,
          answers: scoreData.answers || null,
          timestamp: Date.now()
        });

        // Also update the flat quizScores for backward compat
        var scores = Object.assign({}, this.progress.quizScores);
        scores[pageIndex + '-' + sectionIndex] = {
          correct: scoreData.correct,
          total: scoreData.total
        };
        this.progress = Object.assign({}, this.progress, { quizScores: scores });
        if (window.Storage) {
          window.Storage.save('quizScores', scores);
        }
        this._saveSession();
      },

      /**
       * Get the best (highest correct/total) quiz score for a section.
       * @param {number} pageIndex
       * @param {number} sectionIndex
       * @returns {{ correct: number, total: number } | null}
       */
      getBestQuizScore: function (pageIndex, sectionIndex) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return null;
        var page = this.pages[pageIndex];
        if (!page._meta || !page._meta.quizAttempts || !page._meta.quizAttempts[sectionIndex]) {
          return null;
        }
        var attempts = page._meta.quizAttempts[sectionIndex];
        var best = null;
        var bestRatio = -1;
        for (var i = 0; i < attempts.length; i++) {
          var a = attempts[i];
          if (a.total > 0) {
            var ratio = a.correct / a.total;
            if (ratio > bestRatio) {
              bestRatio = ratio;
              best = { correct: a.correct, total: a.total };
            }
          }
        }
        return best;
      },

      /**
       * Get the number of quiz attempts for a section.
       * @param {number} pageIndex
       * @param {number} sectionIndex
       * @returns {number}
       */
      getQuizAttemptCount: function (pageIndex, sectionIndex) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return 0;
        var page = this.pages[pageIndex];
        if (!page._meta || !page._meta.quizAttempts || !page._meta.quizAttempts[sectionIndex]) {
          return 0;
        }
        return page._meta.quizAttempts[sectionIndex].length;
      },

      /* ---- Dashboard Aggregation ---- */

      /**
       * Aggregate dashboard statistics across all pages.
       * @returns {{ totalPages: number, completedCount: number, completedPercent: number, quizAverage: number, flashcardMastery: number, viewedCount: number }}
       */
      get dashboardStats() {
        var totalPages = this.pages.length;
        var completedCount = 0;
        var viewedCount = 0;
        var quizTotal = 0;
        var quizCorrect = 0;
        var flashcardKnown = 0;
        var flashcardTotal = 0;

        for (var i = 0; i < this.pages.length; i++) {
          var page = this.pages[i];

          // Completed count
          if (page._meta && page._meta.completed === true) completedCount++;

          // Viewed count
          if (this.progress.viewedPages.has(i)) viewedCount++;

          // Quiz average across all sections
          if (page._meta && page._meta.quizAttempts) {
            for (var sec in page._meta.quizAttempts) {
              if (page._meta.quizAttempts.hasOwnProperty(sec)) {
                var attempts = page._meta.quizAttempts[sec];
                if (attempts.length > 0) {
                  var best = null;
                  var bestRatio = -1;
                  for (var a = 0; a < attempts.length; a++) {
                    var at = attempts[a];
                    if (at.total > 0) {
                      var r = at.correct / at.total;
                      if (r > bestRatio) {
                        bestRatio = r;
                        best = at;
                      }
                    }
                  }
                  if (best) {
                    quizCorrect += best.correct;
                    quizTotal += best.total;
                  }
                }
              }
            }
          }

          // Flashcard mastery (avg known/total across all flashcards)
          if (page.sections) {
            for (var si = 0; si < page.sections.length; si++) {
              var sec = page.sections[si];
              if (sec.type === 'flashcards' && Array.isArray(sec.cards)) {
                flashcardTotal += sec.cards.length;
                if (page._meta && page._meta.flashcardProgress) {
                  var fp = page._meta.flashcardProgress[si];
                  if (fp) {
                    for (var ci = 0; ci < sec.cards.length; ci++) {
                      if (fp[ci] && fp[ci].known) flashcardKnown++;
                    }
                  }
                }
              }
            }
          }
        }

        return {
          totalPages: totalPages,
          completedCount: completedCount,
          completedPercent: totalPages > 0 ? Math.round((completedCount / totalPages) * 100) : 0,
          quizAverage: quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0,
          flashcardMastery: flashcardTotal > 0 ? Math.round((flashcardKnown / flashcardTotal) * 100) : 0,
          viewedCount: viewedCount
        };
      },

      /* ---- Play Mode ---- */

      playModeActive: false,
      playModeInterval: null,
      playModeDelay: 3,

      /**
       * Start auto-play mode that cycles through pages.
       */
      startPlayMode: function () {
        if (this.playModeActive) return;
        if (this.pages.length === 0) return;

        this.playModeActive = true;
        var self = this;

        // Ensure we're on a page
        if (this.currentPageIndex < 0 || this.currentPageIndex >= this.pages.length) {
          this.currentPageIndex = 0;
        }

        this.playModeInterval = setInterval(function () {
          self._playTick();
        }, this.playModeDelay * 1000);
      },

      /**
       * Stop auto-play mode.
       */
      stopPlayMode: function () {
        this.playModeActive = false;
        if (this.playModeInterval) {
          clearInterval(this.playModeInterval);
          this.playModeInterval = null;
        }
      },

      /**
       * Internal: tick handler for play mode.
       * Skips to next page; pauses on pages with interactive sections (quiz, flashcards).
       */
      _playTick: function () {
        if (!this.playModeActive) return;

        var currentPage = this.pages[this.currentPageIndex];
        // Check if current page has interactive sections
        if (currentPage && currentPage.sections) {
          for (var i = 0; i < currentPage.sections.length; i++) {
            var sec = currentPage.sections[i];
            if (sec.type === 'quiz' || sec.type === 'flashcards' || sec.type === 'multiple-choice') {
              // Pause on interactive content — user must manually continue
              this.stopPlayMode();
              var toastsStore = Alpine.store('toasts');
              if (toastsStore) {
                toastsStore.add('Play mode paused on interactive content', 'info', { duration: 3000 });
              }
              return;
            }
          }
        }

        // Navigate to next page
        var vis = this.visibleIndices;
        var cur = vis.indexOf(this.currentPageIndex);
        if (cur < vis.length - 1) {
          this.goToPage(vis[cur + 1]);
        } else {
          // Reached the end
          this.stopPlayMode();
          var toastsStore = Alpine.store('toasts');
          if (toastsStore) {
            toastsStore.add('Play mode finished — all pages viewed', 'success', { duration: 3000 });
          }
        }
      }
    });

    /* ------------------------------------------------------------------ */
    /*  Global store: toasts                                               */
    /* ------------------------------------------------------------------ */
    Alpine.store('toasts', {
      items: [],
      nextId: 0,

      /**
       * Add a toast notification.
       * @param {string} message - Display message
       * @param {string} type - 'success' | 'error' | 'warning' | 'info'
       * @param {object} opts - Optional: { duration (ms), undo (function) }
       * @returns {number} toast id
       */
      add: function (message, type, opts) {
        opts = opts || {};
        var id = this.nextId++;
        this.items.push({
          id: id,
          message: message,
          type: type || 'info',
          duration: opts.duration || 4000,
          undo: opts.undo || null
        });
        if (opts.duration !== 0) {
          var self = this;
          setTimeout(function () {
            self.dismiss(id);
          }, opts.duration || 4000);
        }
        return id;
      },

      /**
       * Dismiss a toast by id.
       */
      dismiss: function (id) {
        var idx = -1;
        for (var i = 0; i < this.items.length; i++) {
          if (this.items[i].id === id) {
            idx = i;
            break;
          }
        }
        if (idx !== -1) {
          this.items.splice(idx, 1);
        }
      },

      /**
       * Dismiss + execute undo action if available.
       */
      undo: function (id) {
        var toast = null;
        for (var i = 0; i < this.items.length; i++) {
          if (this.items[i].id === id) {
            toast = this.items[i];
            break;
          }
        }
        if (toast && typeof toast.undo === 'function') {
          toast.undo();
        }
        this.dismiss(id);
      }
    });

    /* ------------------------------------------------------------------ */
    /*  Utility: content hash (SHA-256 via Web Crypto API)                 */
    /* ------------------------------------------------------------------ */
    function computeContentHash(jsonObj) {
      try {
        var str = JSON.stringify(jsonObj);
        // Simple but collision-resistant fingerprint
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
          var chr = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + chr;
          hash |= 0; // Convert to 32bit integer
        }
        return 'fp_' + Math.abs(hash).toString(36) + '_' + str.length;
      } catch (e) {
        return null;
      }
    }

    /* ------------------------------------------------------------------ */
    /*  Global store: timer (Pomodoro)                                      */
    /* ------------------------------------------------------------------ */
    Alpine.store('timer', {
      mode: 'focus',
      focusMinutes: 25,
      breakMinutes: 5,
      seconds: 0,
      isRunning: false,
      interval: null,

      /**
       * Formatted time display as MM:SS.
       */
      get display() {
        var totalSec = this.mode === 'focus' ? this.focusMinutes * 60 : this.breakMinutes * 60;
        var elapsed = totalSec - this.seconds;
        var mins = Math.floor(elapsed / 60);
        var secs = elapsed % 60;
        return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
      },

      /**
       * Progress percentage based on elapsed time.
       */
      get progress() {
        var totalSec = this.mode === 'focus' ? this.focusMinutes * 60 : this.breakMinutes * 60;
        if (totalSec === 0) return 0;
        return Math.round((this.seconds / totalSec) * 100);
      },

      /**
       * Start the timer.
       */
      start: function () {
        if (this.isRunning) return;
        // Reset if timer has completed (seconds >= total)
        var totalSec = this.mode === 'focus' ? this.focusMinutes * 60 : this.breakMinutes * 60;
        if (this.seconds >= totalSec) {
          this.seconds = 0;
        }
        this.isRunning = true;
        var self = this;
        this.interval = setInterval(function () { self._tick(); }, 1000);
        this._savePomodoro();
      },

      /**
       * Pause the timer.
       */
      pause: function () {
        this.isRunning = false;
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        this._savePomodoro();
      },

      /**
       * Reset the timer for the current mode.
       */
      reset: function () {
        this.pause();
        this.seconds = 0;
        this._savePomodoro();
      },

      /**
       * Switch between focus and break mode.
       */
      switchMode: function () {
        this.pause();
        this.mode = this.mode === 'focus' ? 'break' : 'focus';
        this.seconds = 0;
        this._savePomodoro();
      },

      /**
       * Internal tick: decrement seconds and notify on completion.
       */
      _tick: function () {
        var totalSec = this.mode === 'focus' ? this.focusMinutes * 60 : this.breakMinutes * 60;
        this.seconds++;
        if (this.seconds >= totalSec) {
          // Timer completed
          this.pause();
          this.seconds = totalSec;
          this._notify();
          var self = this;
          // Auto-switch after 2 seconds
          setTimeout(function () {
            self.switchMode();
          }, 2000);
        }
        this._savePomodoro();
      },

      /**
       * Play notification beep using Web Audio API.
       */
      _notify: function () {
        try {
          var ctx = new (window.AudioContext || window.webkitAudioContext)();
          var oscillator = ctx.createOscillator();
          var gain = ctx.createGain();
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.frequency.value = 880;
          oscillator.type = 'sine';
          gain.gain.setValueAtTime(0.5, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.5);

          // Second beep
          var osc2 = ctx.createOscillator();
          var gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.value = 660;
          osc2.type = 'sine';
          gain2.gain.setValueAtTime(0.5, ctx.currentTime + 0.6);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.1);
          osc2.start(ctx.currentTime + 0.6);
          osc2.stop(ctx.currentTime + 1.1);
        } catch (e) {
          // Audio not available, silently ignore
        }
      },

      /**
       * Persist pomodoro state to localStorage.
       */
      _savePomodoro: function () {
        try {
          var state = {
            mode: this.mode,
            focusMinutes: this.focusMinutes,
            breakMinutes: this.breakMinutes,
            seconds: this.seconds,
            isRunning: false  // Always restore as paused
          };
          if (window.Storage) {
            window.Storage.save('pomodoroState', state);
          } else {
            localStorage.setItem('pomodoroState', JSON.stringify(state));
          }
        } catch (e) {
          console.warn('[pomodoro] Failed to save state:', e);
        }
      },

      /**
       * Load pomodoro state from localStorage.
       */
      _loadPomodoro: function () {
        try {
          var state = null;
          if (window.Storage) {
            state = window.Storage.load('pomodoroState', null);
          } else {
            var raw = localStorage.getItem('pomodoroState');
            if (raw) state = JSON.parse(raw);
          }
          if (!state) return;
          this.mode = state.mode || 'focus';
          this.focusMinutes = state.focusMinutes || 25;
          this.breakMinutes = state.breakMinutes || 5;
          this.seconds = state.seconds || 0;
          this.isRunning = false;
        } catch (e) {
          console.warn('[pomodoro] Failed to load state:', e);
        }
      }
    });

    // Auto-load pomodoro state
    (function () {
      var timerStore = Alpine.store('timer');
      if (timerStore && timerStore._loadPomodoro) {
        timerStore._loadPomodoro();
      }
    })();

    /* ------------------------------------------------------------------ */
    /*  Swipe Gesture Helpers                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Initialize swipe navigation on an element.
     * @param {HTMLElement} element - The element to listen on
     * @param {function} onSwipeLeft - Callback for left swipe
     * @param {function} onSwipeRight - Callback for right swipe
     * @param {number} [threshold=30] - Minimum px distance to trigger swipe
     * @returns {function} Cleanup function to remove listeners
     */
    window.initSwipeNavigation = function (element, onSwipeLeft, onSwipeRight, threshold) {
      if (!element) return function () {};
      threshold = threshold || 30;

      var startX = 0;
      var startY = 0;
      var isSwiping = false;

      function onTouchStart(e) {
        var touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isSwiping = true;
      }

      function onTouchMove(e) {
        if (!isSwiping) return;
        // Prevent default to avoid page scroll while swiping
        var touch = e.touches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;

        // Only prevent default if horizontal swipe dominates
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          e.preventDefault();
        }
      }

      function onTouchEnd(e) {
        if (!isSwiping) return;
        isSwiping = false;

        var touch = e.changedTouches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;

        // Only trigger if horizontal swipe is significantly more than vertical
        if (Math.abs(dx) < Math.abs(dy) * 0.5) return;

        if (dx > threshold) {
          // Swipe right
          if (typeof onSwipeRight === 'function') onSwipeRight(e);
        } else if (dx < -threshold) {
          // Swipe left
          if (typeof onSwipeLeft === 'function') onSwipeLeft(e);
        }
      }

      element.addEventListener('touchstart', onTouchStart, { passive: true });
      element.addEventListener('touchmove', onTouchMove, { passive: false });
      element.addEventListener('touchend', onTouchEnd, { passive: true });

      // Return cleanup function
      return function () {
        element.removeEventListener('touchstart', onTouchStart);
        element.removeEventListener('touchmove', onTouchMove);
        element.removeEventListener('touchend', onTouchEnd);
      };
    };

    /* ------------------------------------------------------------------ */
    /*  Data component: fileUploader                                       */
    /*  Handles drag-and-drop and click-to-browse file upload.             */
    /* ------------------------------------------------------------------ */
    Alpine.data('fileUploader', function () {
      return {
        dragging: false,
        /**
         * Handle files dropped or selected.
         * @param {FileList|Array} files
         */
        handleFiles: function (files) {
          var appStore = Alpine.store('app');
          if (!files || files.length === 0) return;

          for (var i = 0; i < files.length; i++) {
            this._processFile(files[i], appStore);
          }
        },

        /**
         * Read a single file, validate, and add to the store.
         * @param {File} file
         * @param {object} appStore
         */
        _processFile: function (file, appStore) {
          var reader = new FileReader();
          var self = this;

          reader.onload = function (e) {
            var text = e.target.result;
            var parsed;
            try {
              parsed = JSON.parse(text);
            } catch (err) {
              appStore.error = 'Invalid JSON in file "' + file.name + '": ' + err.message;
              return;
            }

            // Check for window.validateLearningPage
            if (typeof window.validateLearningPage === 'function') {
              var result = window.validateLearningPage(parsed);
              if (!result.valid) {
                var errorMessages = result.errors.map(function(e) {
                  return '  • ' + e.path + ': ' + e.message;
                }).join('\n');
                appStore.error = 'Validation failed for "' + file.name + '":\n' + errorMessages;
                return;
              }
            }

            // Inject filename as default title if page.title is missing
            var fileName = file.name.replace(/\.[^/.]+$/, '');
            if (Array.isArray(parsed)) {
              parsed.forEach(function (pageObj) {
                if (!pageObj.page) pageObj.page = {};
                if (!pageObj.page.title) {
                  pageObj.page.title = fileName;
                }
                if (!pageObj._meta) pageObj._meta = {};
                pageObj._meta.sourceFile = file.name;
              });
            } else {
              if (!parsed.page) parsed.page = {};
              if (!parsed.page.title) {
                parsed.page.title = fileName;
              }
              if (!parsed._meta) parsed._meta = {};
              parsed._meta.sourceFile = file.name;
            }

            // Check duplicate via content hash
            var added = false;
            // If it's a single page object, add it; if it's an array, add all
            if (Array.isArray(parsed)) {
              parsed.forEach(function (pageObj) {
                var wasAdded = appStore.addPage(pageObj, file.name);
                if (wasAdded) added = true;
              });
            } else {
              added = appStore.addPage(parsed, file.name);
            }

            // Toast feedback
            var toastsStore = Alpine.store('toasts');
            if (toastsStore && added) {
              toastsStore.add('Loaded: "' + (parsed.page && parsed.page.title || file.name) + '"', 'success', { duration: 2500 });
            }
          };

          reader.onerror = function () {
            appStore.error = 'Error reading file "' + file.name + '"';
          };

          reader.readAsText(file);
        },

        /**
         * Handle drag events for visual feedback.
         */
        onDragOver: function (e) {
          e.preventDefault();
          this.dragging = true;
        },

        onDragLeave: function () {
          this.dragging = false;
        },

        onDrop: function (e) {
          e.preventDefault();
          this.dragging = false;
          if (e.dataTransfer && e.dataTransfer.files) {
            this.handleFiles(e.dataTransfer.files);
          }
        }
      };
    });

  }); // end alpine:init

})();
