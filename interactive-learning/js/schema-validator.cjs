/**
 * Pure-JS JSON Schema validator (draft-07 compatible) for learning page schemas.
 * No dependencies, runs in Node.js. No DOM.
 * 
 * Exports: validateLearningPage (ES module) + window.validateLearningPage (browser)
 */

/**
 * Validates a learning page object against the schema.
 * @param {object} jsonObject - The parsed JSON object to validate.
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
function validateLearningPage(jsonObject) {
  var errors = [];

  // Top-level must be an object
  if (jsonObject === null || typeof jsonObject !== 'object' || Array.isArray(jsonObject)) {
    return { valid: false, errors: [{ path: '(root)', message: 'Root value must be an object.' }] };
  }

  // Required top-level: 'page' (object) and 'sections' (array, min 1)
  if (!('page' in jsonObject)) {
    errors.push({ path: 'page', message: "Missing required field: 'page'." });
  }
  if (!('sections' in jsonObject)) {
    errors.push({ path: 'sections', message: "Missing required field: 'sections'." });
  }

  // If early critical missing fields, return now to avoid cascading errors
  if (!('page' in jsonObject) || !('sections' in jsonObject)) {
    return { valid: false, errors: errors };
  }

  // Validate 'page'
  var page = jsonObject.page;
  if (page === null || typeof page !== 'object' || Array.isArray(page)) {
    errors.push({ path: 'page', message: "'page' must be an object." });
    return { valid: false, errors: errors };
  }

  // page.title (required, string, minLength 1)
  if (!('title' in page)) {
    errors.push({ path: 'page.title', message: "Missing required field: 'page.title'." });
  } else if (typeof page.title !== 'string') {
    errors.push({ path: 'page.title', message: "'page.title' must be a string." });
  } else if (page.title.length < 1) {
    errors.push({ path: 'page.title', message: "'page.title' must have min length 1." });
  }

  // page.description (optional, string)
  if ('description' in page && typeof page.description !== 'string') {
    errors.push({ path: 'page.description', message: "'page.description' must be a string." });
  }

  // page.tags (optional, array of strings)
  if ('tags' in page) {
    if (!Array.isArray(page.tags)) {
      errors.push({ path: 'page.tags', message: "'page.tags' must be an array of strings." });
    } else {
      for (var ti = 0; ti < page.tags.length; ti++) {
        if (typeof page.tags[ti] !== 'string') {
          errors.push({ path: 'page.tags[' + ti + ']', message: "'page.tags[" + ti + "]' must be a string." });
        }
      }
    }
  }

  // page.icon (optional, string)
  if ('icon' in page && typeof page.icon !== 'string') {
    errors.push({ path: 'page.icon', message: "'page.icon' must be a string." });
  }

  // Validate 'sections'
  var sections = jsonObject.sections;
  if (!Array.isArray(sections)) {
    errors.push({ path: 'sections', message: "'sections' must be an array." });
    return { valid: false, errors: errors };
  }

  if (sections.length < 1) {
    errors.push({ path: 'sections', message: "'sections' must contain at least 1 item." });
    return { valid: false, errors: errors };
  }

  var validTypes = ['text', 'tabs', 'accordion', 'timeline', 'flashcards', 'quiz', 'fill-blank', 'matching', 'sorting', 'checklist', 'cloze'];

  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];
    var prefix = 'sections[' + i + ']';

    if (sec === null || typeof sec !== 'object' || Array.isArray(sec)) {
      errors.push({ path: prefix, message: "'" + prefix + "' must be an object." });
      continue;
    }

    // type (required, enum)
    if (!('type' in sec)) {
      errors.push({ path: prefix + '.type', message: "Missing required field: '" + prefix + ".type'." });
      continue;
    }
    if (typeof sec.type !== 'string') {
      errors.push({ path: prefix + '.type', message: "'" + prefix + ".type' must be a string." });
      continue;
    }
    if (validTypes.indexOf(sec.type) === -1) {
      errors.push({
        path: prefix + '.type',
        message: "'" + prefix + ".type' must be one of: " + validTypes.join(', ') + ". Got '" + sec.type + "'."
      });
      continue;
    }

    // title (required, string)
    if (!('title' in sec)) {
      errors.push({ path: prefix + '.title', message: "Missing required field: '" + prefix + ".title'." });
    } else if (typeof sec.title !== 'string') {
      errors.push({ path: prefix + '.title', message: "'" + prefix + ".title' must be a string." });
    }

    // Type-specific validation
    switch (sec.type) {
      case 'text':
        if (!('content' in sec)) {
          errors.push({ path: prefix + '.content', message: "Missing required field '" + prefix + ".content' for type 'text'." });
        } else if (typeof sec.content !== 'string') {
          errors.push({ path: prefix + '.content', message: "'" + prefix + ".content' must be a string." });
        }
        break;

      case 'tabs':
        if (!('tabs' in sec)) {
          errors.push({ path: prefix + '.tabs', message: "Missing required field '" + prefix + ".tabs' for type 'tabs'." });
        } else if (!Array.isArray(sec.tabs)) {
          errors.push({ path: prefix + '.tabs', message: "'" + prefix + ".tabs' must be an array." });
        } else {
          for (var j = 0; j < sec.tabs.length; j++) {
            var tab = sec.tabs[j];
            var tPrefix = prefix + '.tabs[' + j + ']';
            if (tab === null || typeof tab !== 'object' || Array.isArray(tab)) {
              errors.push({ path: tPrefix, message: "'" + tPrefix + "' must be an object." });
              continue;
            }
            if (typeof tab.label !== 'string') {
              errors.push({ path: tPrefix + '.label', message: "'" + tPrefix + ".label' must be a string." });
            }
            if (typeof tab.content !== 'string') {
              errors.push({ path: tPrefix + '.content', message: "'" + tPrefix + ".content' must be a string." });
            }
          }
        }
        break;

      case 'accordion':
        if (!('items' in sec)) {
          errors.push({ path: prefix + '.items', message: "Missing required field '" + prefix + ".items' for type 'accordion'." });
        } else if (!Array.isArray(sec.items)) {
          errors.push({ path: prefix + '.items', message: "'" + prefix + ".items' must be an array." });
        } else {
          for (var j = 0; j < sec.items.length; j++) {
            var item = sec.items[j];
            var iPrefix = prefix + '.items[' + j + ']';
            if (item === null || typeof item !== 'object' || Array.isArray(item)) {
              errors.push({ path: iPrefix, message: "'" + iPrefix + "' must be an object." });
              continue;
            }
            if (typeof item.heading !== 'string') {
              errors.push({ path: iPrefix + '.heading', message: "'" + iPrefix + ".heading' must be a string." });
            }
            if (typeof item.content !== 'string') {
              errors.push({ path: iPrefix + '.content', message: "'" + iPrefix + ".content' must be a string." });
            }
          }
        }
        // accordionBehavior (optional, 'exclusive' or 'multiple', default 'multiple')
        if ('accordionBehavior' in sec) {
          if (sec.accordionBehavior !== 'exclusive' && sec.accordionBehavior !== 'multiple') {
            errors.push({ path: prefix + '.accordionBehavior', message: "'" + prefix + ".accordionBehavior' must be 'exclusive' or 'multiple'." });
          }
        }
        break;

      case 'timeline':
        if (!('items' in sec)) {
          errors.push({ path: prefix + '.items', message: "Missing required field '" + prefix + ".items' for type 'timeline'." });
        } else if (!Array.isArray(sec.items)) {
          errors.push({ path: prefix + '.items', message: "'" + prefix + ".items' must be an array." });
        } else {
          for (var j = 0; j < sec.items.length; j++) {
            var tlItem = sec.items[j];
            var tlPrefix = prefix + '.items[' + j + ']';
            if (tlItem === null || typeof tlItem !== 'object' || Array.isArray(tlItem)) {
              errors.push({ path: tlPrefix, message: "'" + tlPrefix + "' must be an object." });
              continue;
            }
            if (typeof tlItem.date !== 'string') {
              errors.push({ path: tlPrefix + '.date', message: "'" + tlPrefix + ".date' must be a string." });
            }
            if (typeof tlItem.title !== 'string') {
              errors.push({ path: tlPrefix + '.title', message: "'" + tlPrefix + ".title' must be a string." });
            }
            if (typeof tlItem.description !== 'string') {
              errors.push({ path: tlPrefix + '.description', message: "'" + tlPrefix + ".description' must be a string." });
            }
          }
        }
        // layout (optional, 'vertical' or 'horizontal', default 'vertical')
        if ('layout' in sec) {
          if (sec.layout !== 'vertical' && sec.layout !== 'horizontal') {
            errors.push({ path: prefix + '.layout', message: "'" + prefix + ".layout' must be 'vertical' or 'horizontal'." });
          }
        }
        break;

      case 'flashcards':
        if (!('cards' in sec)) {
          errors.push({ path: prefix + '.cards', message: "Missing required field '" + prefix + ".cards' for type 'flashcards'." });
        } else if (!Array.isArray(sec.cards)) {
          errors.push({ path: prefix + '.cards', message: "'" + prefix + ".cards' must be an array." });
        } else {
          for (var j = 0; j < sec.cards.length; j++) {
            var card = sec.cards[j];
            var cPrefix = prefix + '.cards[' + j + ']';
            if (card === null || typeof card !== 'object' || Array.isArray(card)) {
              errors.push({ path: cPrefix, message: "'" + cPrefix + "' must be an object." });
              continue;
            }
            if (typeof card.front !== 'string') {
              errors.push({ path: cPrefix + '.front', message: "'" + cPrefix + ".front' must be a string." });
            }
            if (typeof card.back !== 'string') {
              errors.push({ path: cPrefix + '.back', message: "'" + cPrefix + ".back' must be a string." });
            }
          }
        }
        break;

      case 'quiz':
        if (!('questions' in sec)) {
          errors.push({ path: prefix + '.questions', message: "Missing required field '" + prefix + ".questions' for type 'quiz'." });
        } else if (!Array.isArray(sec.questions)) {
          errors.push({ path: prefix + '.questions', message: "'" + prefix + ".questions' must be an array." });
        } else {
          for (var j = 0; j < sec.questions.length; j++) {
            var q = sec.questions[j];
            var qPrefix = prefix + '.questions[' + j + ']';
            if (q === null || typeof q !== 'object' || Array.isArray(q)) {
              errors.push({ path: qPrefix, message: "'" + qPrefix + "' must be an object." });
              continue;
            }
            if (typeof q.question !== 'string') {
              errors.push({ path: qPrefix + '.question', message: "'" + qPrefix + ".question' must be a string." });
            }
            if (!Array.isArray(q.options)) {
              errors.push({ path: qPrefix + '.options', message: "'" + qPrefix + ".options' must be an array of strings." });
            } else {
              for (var k = 0; k < q.options.length; k++) {
                if (typeof q.options[k] !== 'string') {
                  errors.push({ path: qPrefix + '.options[' + k + ']', message: "'" + qPrefix + ".options[" + k + "]' must be a string." });
                }
              }
            }
            if ('correctIndex' in q) {
              if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex) || q.correctIndex < 0) {
                errors.push({ path: qPrefix + '.correctIndex', message: "'" + qPrefix + ".correctIndex' must be a non-negative integer." });
              }
            }
            if (typeof q.explanation !== 'string') {
              errors.push({ path: qPrefix + '.explanation', message: "'" + qPrefix + ".explanation' must be a string." });
            }
            // optionExplanations (optional, array of strings, length must match options length)
            if ('optionExplanations' in q) {
              if (!Array.isArray(q.optionExplanations)) {
                errors.push({ path: qPrefix + '.optionExplanations', message: "'" + qPrefix + ".optionExplanations' must be an array of strings." });
              } else if (q.options && q.optionExplanations.length !== q.options.length) {
                errors.push({ path: qPrefix + '.optionExplanations', message: "'" + qPrefix + ".optionExplanations' length must match options array length." });
              } else {
                for (var oeIdx = 0; oeIdx < q.optionExplanations.length; oeIdx++) {
                  if (typeof q.optionExplanations[oeIdx] !== 'string') {
                    errors.push({ path: qPrefix + '.optionExplanations[' + oeIdx + ']', message: "'" + qPrefix + ".optionExplanations[" + oeIdx + "]' must be a string." });
                  }
                }
              }
            }
          }
        }
        break;

      case 'fill-blank':
        if (!('sentences' in sec)) {
          errors.push({ path: prefix + '.sentences', message: "Missing required field '" + prefix + ".sentences' for type 'fill-blank'." });
        } else if (!Array.isArray(sec.sentences)) {
          errors.push({ path: prefix + '.sentences', message: "'" + prefix + ".sentences' must be an array." });
        } else {
          for (var j = 0; j < sec.sentences.length; j++) {
            var s = sec.sentences[j];
            var sPrefix = prefix + '.sentences[' + j + ']';
            if (s === null || typeof s !== 'object' || Array.isArray(s)) {
              errors.push({ path: sPrefix, message: "'" + sPrefix + "' must be an object." });
              continue;
            }
            if (typeof s.text !== 'string') {
              errors.push({ path: sPrefix + '.text', message: "'" + sPrefix + ".text' must be a string." });
            }
            if (typeof s.answer !== 'string') {
              errors.push({ path: sPrefix + '.answer', message: "'" + sPrefix + ".answer' must be a string." });
            }
          }
        }
        // instantFeedback (optional, boolean, default false)
        if ('instantFeedback' in sec) {
          if (typeof sec.instantFeedback !== 'boolean') {
            errors.push({ path: prefix + '.instantFeedback', message: "'" + prefix + ".instantFeedback' must be a boolean." });
          }
        }
        break;

      case 'matching':
        if (!('pairs' in sec)) {
          errors.push({ path: prefix + '.pairs', message: "Missing required field '" + prefix + ".pairs' for type 'matching'." });
        } else if (!Array.isArray(sec.pairs)) {
          errors.push({ path: prefix + '.pairs', message: "'" + prefix + ".pairs' must be an array." });
        } else {
          for (var j = 0; j < sec.pairs.length; j++) {
            var pair = sec.pairs[j];
            var mPrefix = prefix + '.pairs[' + j + ']';
            if (pair === null || typeof pair !== 'object' || Array.isArray(pair)) {
              errors.push({ path: mPrefix, message: "'" + mPrefix + "' must be an object." });
              continue;
            }
            if (typeof pair.left !== 'string') {
              errors.push({ path: mPrefix + '.left', message: "'" + mPrefix + ".left' must be a string." });
            }
            if (typeof pair.right !== 'string') {
              errors.push({ path: mPrefix + '.right', message: "'" + mPrefix + ".right' must be a string." });
            }
          }
        }
        break;

      case 'sorting':
        if (!('items' in sec)) {
          errors.push({ path: prefix + '.items', message: "Missing required field '" + prefix + ".items' for type 'sorting'." });
        } else if (!Array.isArray(sec.items)) {
          errors.push({ path: prefix + '.items', message: "'" + prefix + ".items' must be an array." });
        } else {
          for (var j = 0; j < sec.items.length; j++) {
            var sItem = sec.items[j];
            var sPrefix = prefix + '.items[' + j + ']';
            if (sItem === null || typeof sItem !== 'object' || Array.isArray(sItem)) {
              errors.push({ path: sPrefix, message: "'" + sPrefix + "' must be an object." });
              continue;
            }
            if (typeof sItem.text !== 'string') {
              errors.push({ path: sPrefix + '.text', message: "'" + sPrefix + ".text' must be a string." });
            }
            if (!('correctOrder' in sItem)) {
              errors.push({ path: sPrefix + '.correctOrder', message: "Missing required field '" + sPrefix + ".correctOrder' for type 'sorting'." });
            } else if (typeof sItem.correctOrder !== 'number' || !Number.isInteger(sItem.correctOrder) || sItem.correctOrder < 0) {
              errors.push({ path: sPrefix + '.correctOrder', message: "'" + sPrefix + ".correctOrder' must be a non-negative integer." });
            }
          }
        }
        break;

      case 'checklist':
        if (!('items' in sec)) {
          errors.push({ path: prefix + '.items', message: "Missing required field '" + prefix + ".items' for type 'checklist'." });
        } else if (!Array.isArray(sec.items)) {
          errors.push({ path: prefix + '.items', message: "'" + prefix + ".items' must be an array." });
        } else {
          for (var j = 0; j < sec.items.length; j++) {
            var cItem = sec.items[j];
            var chPrefix = prefix + '.items[' + j + ']';
            if (cItem === null || typeof cItem !== 'object' || Array.isArray(cItem)) {
              errors.push({ path: chPrefix, message: "'" + chPrefix + "' must be an object." });
              continue;
            }
            if (typeof cItem.text !== 'string') {
              errors.push({ path: chPrefix + '.text', message: "'" + chPrefix + ".text' must be a string." });
            }
            if ('optional' in cItem && typeof cItem.optional !== 'boolean') {
              errors.push({ path: chPrefix + '.optional', message: "'" + chPrefix + ".optional' must be a boolean." });
            }
          }
        }
        break;

      case 'cloze':
        if (!('text' in sec)) {
          errors.push({ path: prefix + '.text', message: "Missing required field '" + prefix + ".text' for type 'cloze'." });
        } else if (typeof sec.text !== 'string') {
          errors.push({ path: prefix + '.text', message: "'" + prefix + ".text' must be a string." });
        }
        if (!('blanks' in sec)) {
          errors.push({ path: prefix + '.blanks', message: "Missing required field '" + prefix + ".blanks' for type 'cloze'." });
        } else if (!Array.isArray(sec.blanks)) {
          errors.push({ path: prefix + '.blanks', message: "'" + prefix + ".blanks' must be an array." });
        } else {
          for (var j = 0; j < sec.blanks.length; j++) {
            var blank = sec.blanks[j];
            var bPrefix = prefix + '.blanks[' + j + ']';
            if (blank === null || typeof blank !== 'object' || Array.isArray(blank)) {
              errors.push({ path: bPrefix, message: "'" + bPrefix + "' must be an object." });
              continue;
            }
            if (!('id' in blank)) {
              errors.push({ path: bPrefix + '.id', message: "Missing required field '" + bPrefix + ".id'." });
            } else if (typeof blank.id !== 'string') {
              errors.push({ path: bPrefix + '.id', message: "'" + bPrefix + ".id' must be a string." });
            }
            if ('options' in blank) {
              if (!Array.isArray(blank.options)) {
                errors.push({ path: bPrefix + '.options', message: "'" + bPrefix + ".options' must be an array of strings." });
              } else {
                for (var k = 0; k < blank.options.length; k++) {
                  if (typeof blank.options[k] !== 'string') {
                    errors.push({ path: bPrefix + '.options[' + k + ']', message: "'" + bPrefix + ".options[" + k + "]' must be a string." });
                  }
                }
              }
            }
            if ('correctIndex' in blank) {
              if (typeof blank.correctIndex !== 'number' || !Number.isInteger(blank.correctIndex) || blank.correctIndex < 0) {
                errors.push({ path: bPrefix + '.correctIndex', message: "'" + bPrefix + ".correctIndex' must be a non-negative integer." });
              }
            }
            if ('correctAnswer' in blank && typeof blank.correctAnswer !== 'string') {
              errors.push({ path: bPrefix + '.correctAnswer', message: "'" + bPrefix + ".correctAnswer' must be a string." });
            }
            if ('hint' in blank && typeof blank.hint !== 'string') {
              errors.push({ path: bPrefix + '.hint', message: "'" + bPrefix + ".hint' must be a string." });
            }
          }
        }
        break;

      default:
        break;
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

// ES module export (for Node.js tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateLearningPage: validateLearningPage };
}
// Browser global export (makes window.validateLearningPage available)
if (typeof window !== 'undefined') {
  window.validateLearningPage = validateLearningPage;
}
