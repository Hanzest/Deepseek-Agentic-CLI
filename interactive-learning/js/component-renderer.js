/**
 * component-renderer.js — Alpine.js data components for rendering
 * all 7 section types (text, tabs, accordion, timeline, flashcards,
 * quiz, fill-blank).
 * 
 * Depends on: Alpine.js (via CDN)
 * Must be loaded after alpine-init.js
 */
(function () {
  'use strict';

  document.addEventListener('alpine:init', function () {

    /* ------------------------------------------------------------------ */
    /*  Data component: sectionRenderer                                    */
    /*  Manages state & rendering for a single section.                    */
    /* ------------------------------------------------------------------ */
    Alpine.data('sectionRenderer', function (section, sectionIndex) {
      return {
        section: section,
        sectionIndex: sectionIndex,

        // --- Tabs state ---
        activeTab: 0,

        // --- Accordion state ---
        openAccordionItems: [],

        // --- Flashcards state ---
        flippedCards: [],
        cardDifficulties: {}, // maps cardIndex -> 'easy' | 'medium' | 'hard'
        reviewHardMode: false, // when true, only show cards marked 'hard'
        currentCardIndex: 0,  // single-card navigation mode

        // --- Quiz state ---
        quizAnswers: {},
        quizSubmitted: false,
        quizResults: {},
        quizCorrectCount: 0,
        quizTotalCount: 0,
        quizAttemptCount: 0,
        quizBestCorrect: 0,
        quizBestTotal: 0,
        reviewMistakesMode: false,
        quizAttempts: [],
        currentQuizQuestionIndex: 0,

        // --- Fill-blank state ---
        blankAnswers: {},
        blankSubmitted: false,
        blankResults: {},
        blankCorrectCount: 0,
        blankTotalCount: 0,
        blankInstantResults: {},
        blankHints: {},

        // --- Checklist state ---
        checkedItems: {},

        // --- Sorting state ---
        sortedItems: [],
        sortingSubmitted: false,
        sortingResults: {},
        sortingCorrectCount: 0,

        // --- Cloze state ---
        clozeAnswers: {},
        clozeSubmitted: false,
        clozeResults: {},
        clozeCorrectCount: 0,
        clozeTotalBlanks: (section.blanks || []).length,
        clozeHints: {},

        /* ---- Computed ---- */

        get accordionAllOpen() {
          return this.openAccordionItems.length === (this.section.items || []).length;
        },

        /* ---- Actions ---- */

        // Tabs
        setActiveTab: function (index) {
          this.activeTab = index;
        },

        _handleTabKeydown: function (event, tIdx, totalTabs) {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.setActiveTab((tIdx - 1 + totalTabs) % totalTabs);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.setActiveTab((tIdx + 1) % totalTabs);
          }
        },

        // Accordion
        toggleAccordion: function (index) {
          if (this.section.accordionBehavior === 'exclusive') {
            // Close all others before opening the new one; toggle off if already open
            if (this.openAccordionItems.indexOf(index) !== -1) {
              this.openAccordionItems = [];
            } else {
              this.openAccordionItems = [index];
            }
          } else {
            var idx = this.openAccordionItems.indexOf(index);
            if (idx === -1) {
              this.openAccordionItems.push(index);
            } else {
              this.openAccordionItems.splice(idx, 1);
            }
          }
        },

        toggleAllAccordion: function () {
          if (this.accordionAllOpen) {
            this.openAccordionItems = [];
          } else {
            var all = [];
            for (var i = 0; i < (this.section.items || []).length; i++) {
              all.push(i);
            }
            this.openAccordionItems = all;
          }
        },

        // Flashcards — Single-card mode with navigation
        get totalCards() {
          return (this.section.cards || []).length;
        },

        get currentCard() {
          var indices = this.visibleCardIndices;
          var cards = this.section.cards || [];
          return cards[indices[this.currentCardIndex]] || null;
        },

        get isCurrentCardFlipped() {
          var indices = this.visibleCardIndices;
          var realIdx = indices[this.currentCardIndex];
          return this.flippedCards.indexOf(realIdx) !== -1;
        },

        get isCardHard() {
          var idx = function (i) {
            return this.cardDifficulties[i] === 'hard';
          }.bind(this);
          return idx;
        },

        get masteredCount() {
          var cards = this.section.cards || [];
          var count = 0;
          for (var i = 0; i < cards.length; i++) {
            var d = this.cardDifficulties[i];
            if (d === 'easy' || d === 'medium') count++;
          }
          return count;
        },

        get visibleCardIndices() {
          var cards = this.section.cards || [];
          if (!this.reviewHardMode) {
            var all = [];
            for (var i = 0; i < cards.length; i++) {
              all.push(i);
            }
            return all;
          }
          // Hard-only filter
          var hard = [];
          for (var i = 0; i < cards.length; i++) {
            if (this.cardDifficulties[i] === 'hard') {
              hard.push(i);
            }
          }
          // If no hard cards, fall back to all (so the view isn't empty)
          if (hard.length === 0) {
            for (var i = 0; i < cards.length; i++) {
              hard.push(i);
            }
          }
          return hard;
        },

        get visibleCardCount() {
          return this.visibleCardIndices.length;
        },

        get hasPrevCard() {
          return this.currentCardIndex > 0;
        },

        get hasNextCard() {
          return this.currentCardIndex < this.visibleCardCount - 1;
        },

        toggleCurrentCardFlip: function () {
          var indices = this.visibleCardIndices;
          var realIdx = indices[this.currentCardIndex];
          if (this.flippedCards.indexOf(realIdx) === -1) {
            this.flippedCards.push(realIdx);
          } else {
            var idx = this.flippedCards.indexOf(realIdx);
            this.flippedCards.splice(idx, 1);
          }
        },

        nextCard: function () {
          if (this.hasNextCard) {
            this.currentCardIndex++;
          }
        },

        prevCard: function () {
          if (this.hasPrevCard) {
            this.currentCardIndex--;
          }
        },

        markCardDifficulty: function (idx, level) {
          this.cardDifficulties[idx] = level;
          // Force reactivity
          this.cardDifficulties = Object.assign({}, this.cardDifficulties);
          // Auto-advance to next card
          if (this.hasNextCard) {
            this.nextCard();
          }
        },

        getCurrentCardDifficulty: function () {
          var indices = this.visibleCardIndices;
          var realIdx = indices[this.currentCardIndex];
          return this.cardDifficulties[realIdx] || null;
        },

        isCardHard: function (idx) {
          return this.cardDifficulties[idx] === 'hard';
        },

        toggleReviewHardMode: function () {
          this.reviewHardMode = !this.reviewHardMode;
          this.currentCardIndex = 0;
        },

        // Quiz
        setQuizAnswer: function (qIndex, optionIndex) {
          if (!this.quizSubmitted) {
            this.quizAnswers[qIndex] = optionIndex;
          }
        },

        submitQuiz: function () {
          var questions = this.section.questions || [];
          var results = {};
          var correct = 0;
          for (var i = 0; i < questions.length; i++) {
            var isCorrect = this.quizAnswers[i] === questions[i].correctIndex;
            results[i] = isCorrect;
            if (isCorrect) correct++;
          }
          this.quizResults = results;
          this.quizSubmitted = true;
          this.quizCorrectCount = correct;
          this.quizTotalCount = questions.length;

          // Track attempt
          this.quizAttemptCount++;
          var attemptData = {
            attempt: this.quizAttemptCount,
            correct: correct,
            total: questions.length,
            answers: JSON.parse(JSON.stringify(this.quizAnswers)),
            timestamp: Date.now()
          };
          this.quizAttempts.push(attemptData);
          if (correct > this.quizBestCorrect || (correct === this.quizBestCorrect && this.quizBestTotal === 0)) {
            this.quizBestCorrect = correct;
            this.quizBestTotal = questions.length;
          }

          // Record score in app store (compound key: pageIndex-sectionIndex)
          var appStore = Alpine.store('app');
          if (appStore) {
            appStore.recordQuizScore(appStore.currentPageIndex, this.sectionIndex, attemptData);
            appStore.saveQuizAttempt(appStore.currentPageIndex, this.sectionIndex, attemptData);
          }
        },

        toggleReviewMistakes: function () {
          this.reviewMistakesMode = !this.reviewMistakesMode;
          this.currentQuizQuestionIndex = 0;
        },

        isQuestionVisible: function (qIdx) {
          if (!this.reviewMistakesMode) return true;
          // In review mode, only show questions that were answered wrong
          return this.quizResults[qIdx] === false;
        },

        resetQuiz: function () {
          this.quizAnswers = {};
          this.quizSubmitted = false;
          this.quizResults = {};
          this.quizCorrectCount = 0;
          this.quizTotalCount = 0;
          this.reviewMistakesMode = false;
          this.currentQuizQuestionIndex = 0;
        },

        get visibleQuizQuestions() {
          var questions = this.section.questions || [];
          var list = [];
          for (var i = 0; i < questions.length; i++) {
            list.push(Object.assign({ originalIndex: i }, questions[i]));
          }
          if (!this.reviewMistakesMode) {
            return list;
          }
          return list.filter(function (q) {
            return this.quizResults[q.originalIndex] === false;
          }.bind(this));
        },

        nextQuizQuestion: function () {
          if (this.currentQuizQuestionIndex < this.visibleQuizQuestions.length - 1) {
            this.currentQuizQuestionIndex++;
          }
        },

        prevQuizQuestion: function () {
          if (this.currentQuizQuestionIndex > 0) {
            this.currentQuizQuestionIndex--;
          }
        },

        get quizScorePercent() {
          if (!this.quizTotalCount) return 0;
          return Math.round((this.quizCorrectCount / this.quizTotalCount) * 100);
        },

        get quizBestPercent() {
          if (!this.quizBestTotal) return 0;
          return Math.round((this.quizBestCorrect / this.quizBestTotal) * 100);
        },

        // Fill-in-the-blank
        setBlankAnswer: function (sIndex, value) {
          this.blankAnswers[sIndex] = value;
        },

        submitBlanks: function () {
          var sentences = this.section.sentences || [];
          var results = {};
          var correct = 0;
          for (var i = 0; i < sentences.length; i++) {
            var userAnswer = (this.blankAnswers[i] || '').trim().toLowerCase();
            var expected = sentences[i].answer.trim().toLowerCase();
            var isCorrect = userAnswer === expected;
            results[i] = isCorrect;
            if (isCorrect) correct++;
          }
          this.blankResults = results;
          this.blankSubmitted = true;
          this.blankCorrectCount = correct;
          this.blankTotalCount = sentences.length;
        },

        // Sorting
        _initSorting: function () {
          var items = this.section.items || [];
          // Create shuffled copy of items
          var shuffled = items.slice().map(function (item, idx) {
            return { index: idx, text: item.text, correctOrder: item.correctOrder };
          });
          // Fisher-Yates shuffle
          for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
          }
          this.sortedItems = shuffled;
          this.sortingSubmitted = false;
          this.sortingResults = {};
          this.sortingCorrectCount = 0;
        },

        submitSorting: function () {
          var items = this.sortedItems || [];
          var results = {};
          var correct = 0;
          for (var i = 0; i < items.length; i++) {
            // The item's current position (i) should match its correctOrder
            var isCorrect = items[i].correctOrder === i;
            results[i] = isCorrect;
            if (isCorrect) correct++;
          }
          this.sortingResults = results;
          this.sortingSubmitted = true;
          this.sortingCorrectCount = correct;
        },

        resetSorting: function () {
          this._initSorting();
        },

        get sortingScorePercent() {
          var items = this.section.items || [];
          if (!items.length) return 0;
          return Math.round((this.sortingCorrectCount / items.length) * 100);
        },

        checkBlankInstant: function (sIndex) {
          var sentences = this.section.sentences || [];
          if (!sentences[sIndex]) return;
          if (!this.section.instantFeedback) return;
          var userAnswer = (this.blankAnswers[sIndex] || '').trim().toLowerCase();
          var expected = sentences[sIndex].answer.trim().toLowerCase();
          var isCorrect = userAnswer === expected;
          this.blankInstantResults[sIndex] = isCorrect;
        },

        toggleBlankHint: function (sIndex) {
          this.blankHints[sIndex] = !this.blankHints[sIndex];
        },

        getBlankHint: function (sIndex) {
          var sentences = this.section.sentences || [];
          if (!sentences[sIndex]) return '';
          var answer = sentences[sIndex].answer.trim();
          if (!answer) return '';
          var first = answer.charAt(0);
          var rest = answer.slice(1).replace(/./g, '_');
          return first + rest;
        },

        resetBlanks: function () {
          this.blankAnswers = {};
          this.blankSubmitted = false;
          this.blankResults = {};
          this.blankCorrectCount = 0;
          this.blankTotalCount = 0;
          this.blankInstantResults = {};
          this.blankHints = {};
        },

        // ---- Checklist ----

        /**
         * Load checklist state from _meta on init.
         * Called implicitly via init() in Alpine 3.x when init key is present.
         */
        init: function () {
          // Restore checklist state from persisted _meta
          var pageIdx = Alpine.store('app').currentPageIndex;
          var appStore = Alpine.store('app');
          if (appStore && appStore.pages[pageIdx]) {
            var page = appStore.pages[pageIdx];
            if (!page._meta) page._meta = {};
            if (!page._meta.checklist) page._meta.checklist = {};
            if (page._meta.checklist[this.sectionIndex]) {
              this.checkedItems = JSON.parse(JSON.stringify(page._meta.checklist[this.sectionIndex]));
            } else {
              this.checkedItems = {};
            }
          }
        },

        toggleCheck: function (idx) {
          if (this.checkedItems[idx]) {
            delete this.checkedItems[idx];
          } else {
            this.checkedItems[idx] = true;
          }
          // Force reactivity
          this.checkedItems = Object.assign({}, this.checkedItems);
          this._saveChecklistState();
        },

        clearChecklist: function () {
          this.checkedItems = {};
          this._saveChecklistState();
        },

        _saveChecklistState: function () {
          var appStore = Alpine.store('app');
          if (!appStore) return;
          var pageIdx = appStore.currentPageIndex;
          if (!appStore.pages[pageIdx]) return;
          var page = appStore.pages[pageIdx];
          if (!page._meta) page._meta = {};
          if (!page._meta.checklist) page._meta.checklist = {};
          page._meta.checklist[this.sectionIndex] = JSON.parse(JSON.stringify(this.checkedItems));
          appStore._saveSession();
        },

        get checkedCount() {
          var items = this.section.items || [];
          var count = 0;
          for (var i = 0; i < items.length; i++) {
            if (!items[i].optional && this.checkedItems[i]) {
              count++;
            }
          }
          return count;
        },

        get totalRequired() {
          var items = this.section.items || [];
          var count = 0;
          for (var i = 0; i < items.length; i++) {
            if (!items[i].optional) count++;
          }
          return count;
        },

        get checklistProgress() {
          if (this.totalRequired === 0) return 0;
          return Math.round((this.checkedCount / this.totalRequired) * 100);
        },

        // --- Matching state ---
        matchAssignments: {},
        matchSubmitted: false,
        matchResults: {},
        matchCorrectCount: 0,
        shuffledRight: [],
        _selectedLeft: null,
        matchLines: [],

        initMatching: function () {
          var pairs = this.section.pairs || [];
          // Build right-side array and shuffle it
          var rightItems = [];
          for (var i = 0; i < pairs.length; i++) {
            rightItems.push({ index: i, text: pairs[i].right });
          }
          // Fisher-Yates shuffle
          for (var i = rightItems.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = rightItems[i];
            rightItems[i] = rightItems[j];
            rightItems[j] = tmp;
          }
          this.shuffledRight = rightItems;
          this.matchAssignments = {};
          this.matchSubmitted = false;
          this.matchResults = {};
          this.matchCorrectCount = 0;
          this._selectedLeft = null;
          this.matchLines = [];
        },

        _selectLeft: function (lIdx) {
          if (this.matchSubmitted) return;
          if (this._selectedLeft === lIdx) {
            this._selectedLeft = null;
          } else {
            this._selectedLeft = lIdx;
          }
        },

        _selectRight: function (rIdx) {
          if (this.matchSubmitted) return;
          if (this._selectedLeft !== null && this._selectedLeft !== undefined) {
            // Unassign this right item from any other left item to keep 1-to-1
            for (var key in this.matchAssignments) {
              if (this.matchAssignments[key] === rIdx) {
                delete this.matchAssignments[key];
              }
            }
            this.matchAssignments[this._selectedLeft] = rIdx;
            this.matchAssignments = Object.assign({}, this.matchAssignments);
            this._selectedLeft = null;
          } else {
            var toastsStore = Alpine.store('toasts');
            if (toastsStore) {
              toastsStore.add('Select a term on the left first', 'info', { duration: 2000 });
            }
          }
        },

        selectMatch: function (leftIdx, rightIdx) {
          if (this.matchSubmitted) return;
          // Toggle: if same right item is already assigned to this left, unassign
          if (this.matchAssignments[leftIdx] === rightIdx) {
            delete this.matchAssignments[leftIdx];
          } else {
            this.matchAssignments[leftIdx] = rightIdx;
          }
          this.matchAssignments = Object.assign({}, this.matchAssignments);
        },

        submitMatch: function () {
          var pairs = this.section.pairs || [];
          var results = {};
          var correct = 0;
          for (var i = 0; i < pairs.length; i++) {
            var isCorrect = this.matchAssignments[i] === i;
            results[i] = isCorrect;
            if (isCorrect) correct++;
          }
          this.matchResults = results;
          this.matchSubmitted = true;
          this.matchCorrectCount = correct;
          this.updateLines();
        },

        resetMatch: function () {
          this.initMatching();
          this.updateLines();
        },

        get matchScorePercent() {
          var total = (this.section.pairs || []).length;
          if (!total) return 0;
          return Math.round((this.matchCorrectCount / total) * 100);
        },

        showMatchAnswers: function () {
          var pairs = this.section.pairs || [];
          for (var i = 0; i < pairs.length; i++) {
            this.matchAssignments[i] = i;
          }
          this.matchAssignments = Object.assign({}, this.matchAssignments);
          this.submitMatch();
          this.updateLines();
        },

        getMatchColorClass: function (index, isLeft) {
          if (this.matchSubmitted) {
            var lIdx = isLeft ? index : Object.keys(this.matchAssignments).find(function (k) {
              return this.matchAssignments[k] === index;
            }.bind(this));
            if (lIdx !== undefined) {
              var isCorrect = this.matchResults[lIdx];
              return isCorrect 
                ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300'
                : 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/20 text-rose-900 dark:text-rose-350';
            }
            return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-60';
          }

          var colors = [
            'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-400 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200',
            'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200',
            'bg-amber-50/60 dark:bg-amber-950/20 border-amber-400 dark:border-amber-800 text-amber-900 dark:text-amber-200',
            'bg-rose-50/60 dark:bg-rose-950/20 border-rose-400 dark:border-rose-800 text-rose-900 dark:text-rose-200',
            'bg-sky-50/60 dark:bg-sky-950/20 border-sky-400 dark:border-sky-800 text-sky-900 dark:text-sky-200',
            'bg-purple-50/60 dark:bg-purple-950/20 border-purple-400 dark:border-purple-800 text-purple-900 dark:text-purple-200'
          ];
          if (isLeft) {
            if (this.matchAssignments[index] !== undefined) {
              return colors[index % colors.length];
            }
          } else {
            var leftIdx = Object.keys(this.matchAssignments).find(function (k) {
              return this.matchAssignments[k] === index;
            }.bind(this));
            if (leftIdx !== undefined) {
              return colors[parseInt(leftIdx) % colors.length];
            }
          }
          return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800';
        },

        updateLines: function () {
          this.$nextTick(function () {
            setTimeout(function () {
              var container = this.$el.querySelector('.match-container');
              if (!container) return;
              var containerRect = container.getBoundingClientRect();

              var lines = [];
              var colors = [
                'stroke-indigo-500/80 dark:stroke-indigo-400/80',
                'stroke-emerald-500/80 dark:stroke-emerald-400/80',
                'stroke-amber-500/80 dark:stroke-amber-400/80',
                'stroke-rose-500/80 dark:stroke-rose-400/80',
                'stroke-sky-500/80 dark:stroke-sky-400/80',
                'stroke-purple-500/80 dark:stroke-purple-400/80'
              ];

              for (var lIdx in this.matchAssignments) {
                var rIdx = this.matchAssignments[lIdx];
                if (rIdx === undefined) continue;

                var leftEl = container.querySelector('[data-left-id="' + lIdx + '"]');
                var rightEl = container.querySelector('[data-right-id="' + rIdx + '"]');

                if (leftEl && rightEl) {
                  var leftRect = leftEl.getBoundingClientRect();
                  var rightRect = rightEl.getBoundingClientRect();

                  var isVertical = window.innerWidth < 640;

                  var x1, y1, x2, y2;
                  if (isVertical) {
                    x1 = leftRect.left + leftRect.width / 2 - containerRect.left;
                    y1 = leftRect.bottom - containerRect.top;
                    x2 = rightRect.left + rightRect.width / 2 - containerRect.left;
                    y2 = rightRect.top - containerRect.top;
                  } else {
                    x1 = leftRect.right - containerRect.left;
                    y1 = leftRect.top + leftRect.height / 2 - containerRect.top;
                    x2 = rightRect.left - containerRect.left;
                    y2 = rightRect.top + rightRect.height / 2 - containerRect.top;
                  }

                  var colorClass = colors[parseInt(lIdx) % colors.length];
                  if (this.matchSubmitted) {
                    var isCorrect = this.matchResults[lIdx];
                    colorClass = isCorrect 
                      ? 'stroke-emerald-500 dark:stroke-emerald-400' 
                      : 'stroke-rose-500 dark:stroke-rose-400';
                  }

                  var dx = x2 - x1;
                  var pathD;
                  if (isVertical) {
                    var dy = y2 - y1;
                    pathD = 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + dy / 2) + ', ' + x2 + ' ' + (y2 - dy / 2) + ', ' + x2 + ' ' + y2;
                  } else {
                    pathD = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx / 2) + ' ' + y1 + ', ' + (x1 + dx / 2) + ' ' + y2 + ', ' + x2 + ' ' + y2;
                  }

                  lines.push({
                    path: pathD,
                    colorClass: colorClass
                  });
                }
              }
              this.matchLines = lines;
            }.bind(this), 50);
          }.bind(this));
        },

        // ---- Cloze ----

        setClozeAnswer: function (blankId, value) {
          if (this.clozeSubmitted) return;
          this.clozeAnswers[blankId] = value;
        },

        toggleClozeHint: function (blankId) {
          if (this.clozeHints[blankId]) {
            delete this.clozeHints[blankId];
          } else {
            this.clozeHints[blankId] = true;
          }
          // Force reactivity
          this.clozeHints = Object.assign({}, this.clozeHints);
        },

        submitCloze: function () {
          var blanks = this.section.blanks || [];
          var results = {};
          var correct = 0;
          for (var i = 0; i < blanks.length; i++) {
            var blank = blanks[i];
            var userAnswer = this.clozeAnswers[blank.id];
            var isCorrect = false;
            if (blank.options && blank.correctIndex !== undefined) {
              // Multiple-choice blank
              isCorrect = parseInt(userAnswer) === blank.correctIndex;
            } else if (blank.correctAnswer) {
              // Free-text blank
              isCorrect = (userAnswer || '').trim().toLowerCase() === blank.correctAnswer.trim().toLowerCase();
            }
            results[blank.id] = isCorrect;
            if (isCorrect) correct++;
          }
          this.clozeResults = results;
          this.clozeSubmitted = true;
          this.clozeCorrectCount = correct;
        },

        resetCloze: function () {
          this.clozeAnswers = {};
          this.clozeSubmitted = false;
          this.clozeResults = {};
          this.clozeCorrectCount = 0;
          this.clozeHints = {};
        },

        get clozeScorePercent() {
          var total = this.clozeTotalBlanks;
          if (!total) return 0;
          return Math.round((this.clozeCorrectCount / total) * 100);
        },

        /* ---- Text-to-Speech ---- */

        speakText: function (text) {
          if (!text || typeof text !== 'string') return;
          try {
            if (window.speechSynthesis.speaking) {
              window.speechSynthesis.cancel();
            }
            var utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.warn('[TTS] Speech synthesis failed:', e);
          }
        },

        /* ---- Helpers ---- */

        isAccordionOpen: function (index) {
          return this.openAccordionItems.indexOf(index) !== -1;
        },

        isCardFlipped: function (index) {
          return this.flippedCards.indexOf(index) !== -1;
        },

        isCardHard: function (index) {
          return this.cardDifficulties[index] === 'hard';
        },

        /**
         * Escape HTML to prevent XSS
         */
        escapeHtml: function (str) {
          if (typeof str !== 'string') return String(str || '');
          var div = document.createElement('div');
          div.appendChild(document.createTextNode(str));
          return div.innerHTML;
        },

        /**
         * Render simple markdown-like content (bold, italic, code, links, line breaks, headings, blockquotes)
         */
        renderContent: function (text) {
          if (typeof text !== 'string') return '';
          var html = this.escapeHtml(text);
          // Convert ### headings to <h3>
          html = html.replace(/(?:^|\r?\n)###\s*(.+?)(?=\r?\n|$)/g, '<h3 class="text-base font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h3>');
          // Convert > blockquotes to <blockquote>
          html = html.replace(/(?:^|\r?\n)>\s*(.+?)(?=\r?\n|$)/g, '<blockquote class="border-l-4 border-indigo-500 dark:border-indigo-400 pl-4 py-1 my-3 italic text-gray-600 dark:text-gray-300">$1</blockquote>');
          // Convert **bold** to <strong>
          html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
          // Convert *italic* to <em>
          html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
          // Convert `code` to <code>
          html = html.replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-sm">$1</code>');
          // Convert [text](url) to <a>
          html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-blue-600 dark:text-blue-400 underline">$1</a>');
          // Convert newlines to <br>
          html = html.replace(/\r?\n/g, '<br>');
          return html;
        }
      };
    });

    /* ------------------------------------------------------------------ */
    /*  Helper: renderMarkdownContent — for static x-html usage            */
    /* ------------------------------------------------------------------ */
    window.renderMarkdownContent = function (text) {
      if (typeof text !== 'string') return '';
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(text));
      var html = div.innerHTML;
      // Convert ### headings to <h3>
      html = html.replace(/(?:^|\r?\n)###\s*(.+?)(?=\r?\n|$)/g, '<h3 class="text-base font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h3>');
      // Convert > blockquotes to <blockquote>
      html = html.replace(/(?:^|\r?\n)>\s*(.+?)(?=\r?\n|$)/g, '<blockquote class="border-l-4 border-indigo-500 dark:border-indigo-400 pl-4 py-1 my-3 italic text-gray-600 dark:text-gray-300">$1</blockquote>');
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
      html = html.replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-sm">$1</code>');
      html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-blue-600 dark:text-blue-400 underline">$1</a>');
      html = html.replace(/\r?\n/g, '<br>');
      return html;
    };

  }); // end alpine:init

})();
