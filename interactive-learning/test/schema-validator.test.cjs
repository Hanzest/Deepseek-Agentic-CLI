const { validateLearningPage } = require('../js/schema-validator.cjs');
const { readFileSync } = require('fs');
const { join } = require('path');
const assert = require('assert');

function loadFixture(name) {
  const filePath = join(__dirname, 'fixtures', name);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

// Helper to run a test case
function runTest(name, fn) {
  try {
    fn();
    console.log('  PASS: ' + name);
  } catch (e) {
    console.error('  FAIL: ' + name);
    console.error('        ' + e.message);
    process.exitCode = 1;
  }
}

// --- Valid Fixtures ---

runTest('valid-full.json passes with zero errors', () => {
  const data = loadFixture('valid-full.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true, got valid=' + result.valid + '. Errors: ' + JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 0, 'Expected 0 errors, got ' + result.errors.length + ': ' + JSON.stringify(result.errors));
});

runTest('valid-minimal.json passes with zero errors', () => {
  const data = loadFixture('valid-minimal.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true, got valid=' + result.valid + '. Errors: ' + JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 0, 'Expected 0 errors, got ' + result.errors.length + ': ' + JSON.stringify(result.errors));
});

runTest('valid-matching.json passes with zero errors', () => {
  const data = loadFixture('valid-matching.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true, got valid=' + result.valid + '. Errors: ' + JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 0, 'Expected 0 errors, got ' + result.errors.length + ': ' + JSON.stringify(result.errors));
});

runTest('valid-sorting.json passes with zero errors', () => {
  const data = loadFixture('valid-sorting.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true, got valid=' + result.valid + '. Errors: ' + JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 0, 'Expected 0 errors, got ' + result.errors.length + ': ' + JSON.stringify(result.errors));
});

runTest('valid-checklist.json passes with zero errors', () => {
  const data = loadFixture('valid-checklist.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true, got valid=' + result.valid + '. Errors: ' + JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 0, 'Expected 0 errors, got ' + result.errors.length + ': ' + JSON.stringify(result.errors));
});

runTest('valid-cloze.json passes with zero errors', () => {
  const data = loadFixture('valid-cloze.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true, got valid=' + result.valid + '. Errors: ' + JSON.stringify(result.errors));
  assert.strictEqual(result.errors.length, 0, 'Expected 0 errors, got ' + result.errors.length + ': ' + JSON.stringify(result.errors));
});

// --- Invalid Fixtures ---

runTest('invalid-missing-title.json fails with error including path "page.title"', () => {
  const data = loadFixture('invalid-missing-title.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, false, 'Expected valid=false for missing title');
  assert.ok(result.errors.length >= 1, 'Expected at least 1 error');
  const hasTitleError = result.errors.some(function(e) { return e.path.indexOf('page.title') !== -1; });
  assert.ok(hasTitleError, 'Expected error path to include "page.title". Got errors: ' + JSON.stringify(result.errors));
});

runTest('invalid-bad-section-type.json fails with error including path "type" and enum message', () => {
  const data = loadFixture('invalid-bad-section-type.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, false, 'Expected valid=false for bad section type');
  assert.ok(result.errors.length >= 1, 'Expected at least 1 error');
  const hasTypeError = result.errors.some(function(e) { return e.path.indexOf('sections[0].type') !== -1; });
  assert.ok(hasTypeError, 'Expected error path to include "sections[0].type". Got errors: ' + JSON.stringify(result.errors));
});

runTest('invalid-missing-section-content.json fails with error including path "content"', () => {
  const data = loadFixture('invalid-missing-section-content.json');
  const result = validateLearningPage(data);
  assert.strictEqual(result.valid, false, 'Expected valid=false for missing section content');
  assert.ok(result.errors.length >= 1, 'Expected at least 1 error');
  const hasContentError = result.errors.some(function(e) { return e.path.indexOf('sections[0].content') !== -1; });
  assert.ok(hasContentError, 'Expected error path to include "sections[0].content". Got errors: ' + JSON.stringify(result.errors));
});

// --- Additional edge case tests ---

runTest('null input returns invalid with root error', () => {
  const result = validateLearningPage(null);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path === '(root)'; }));
});

runTest('empty sections array returns invalid', () => {
  const result = validateLearningPage({ page: { title: 'x' }, sections: [] });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path === 'sections'; }));
});

runTest('missing page field returns invalid with path "page"', () => {
  const result = validateLearningPage({ sections: [{ type: 'text', title: 'x', content: 'y' }] });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path === 'page'; }));
});

runTest('missing sections field returns invalid with path "sections"', () => {
  const result = validateLearningPage({ page: { title: 'x' } });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path === 'sections'; }));
});

runTest('page.title empty string returns invalid with path "page.title"', () => {
  const result = validateLearningPage({ page: { title: '' }, sections: [{ type: 'text', title: 'x', content: 'y' }] });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path === 'page.title'; }));
});

runTest('invalid enum type shows all valid options in message', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'invalid', title: 'x' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  var typeError = result.errors.find(function(e) { return e.path.indexOf('sections[0].type') !== -1; });
  assert.ok(typeError, 'Expected a type error');
  assert.ok(typeError.message.indexOf('text') !== -1, 'Message should mention valid type "text"');
  assert.ok(typeError.message.indexOf('matching') !== -1, 'Message should mention valid type "matching"');
});

runTest('quiz missing questions array returns path error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'quiz', title: 'Quiz' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('sections[0].questions') !== -1; }));
});

runTest('fill-blank missing sentences array returns path error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'fill-blank', title: 'FB' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('sections[0].sentences') !== -1; }));
});

// --- New type validation error tests ---

runTest('matching missing pairs array returns path error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'matching', title: 'Match' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('sections[0].pairs') !== -1; }));
});

runTest('sorting items missing correctOrder returns path error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'sorting', title: 'Sort', items: [{ text: 'Step 1' }] }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('sections[0].items[0].correctOrder') !== -1; }));
});

runTest('checklist missing items array returns path error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'checklist', title: 'Check' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('sections[0].items') !== -1; }));
});

runTest('cloze missing text field returns path error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'cloze', title: 'Cloze', blanks: [] }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('sections[0].text') !== -1; }));
});

runTest('cloze missing blanks array returns path error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'cloze', title: 'Cloze', text: 'Some text.' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('sections[0].blanks') !== -1; }));
});

// --- Enhancement field tests ---

runTest('accordion with invalid accordionBehavior returns error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'accordion', title: 'Acc', items: [{ heading: 'H', content: 'C' }], accordionBehavior: 'invalid' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('accordionBehavior') !== -1; }));
});

runTest('timeline with invalid layout returns error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'timeline', title: 'TL', items: [{ date: '2020', title: 'E', description: 'D' }], layout: 'diagonal' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('layout') !== -1; }));
});

runTest('fill-blank with invalid instantFeedback returns error', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'fill-blank', title: 'FB', sentences: [{ text: 'The ___ blank.', answer: 'x' }], instantFeedback: 'yes' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('instantFeedback') !== -1; }));
});

// --- Enhanced field valid cases ---

runTest('accordion with valid exclusive behavior passes', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'accordion', title: 'Acc', items: [{ heading: 'H', content: 'C' }], accordionBehavior: 'exclusive' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, true);
});

runTest('timeline with valid horizontal layout passes', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'timeline', title: 'TL', items: [{ date: '2020', title: 'E', description: 'D' }], layout: 'horizontal' }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, true);
});

runTest('fill-blank with valid instantFeedback true passes', () => {
  var data = { page: { title: 'x' }, sections: [{ type: 'fill-blank', title: 'FB', sentences: [{ text: 'The ___ blank.', answer: 'x' }], instantFeedback: true }] };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, true);
});

runTest('cloze with all blank fields valid passes', () => {
  var data = {
    page: { title: 'x' },
    sections: [{
      type: 'cloze',
      title: 'Cloze',
      text: '{{a}} and {{b}} are fillable.',
      blanks: [
        { id: 'a', options: ['x', 'y'], correctIndex: 0, correctAnswer: 'x', hint: 'First letter' },
        { id: 'b', correctAnswer: 'y' }
      ]
    }]
  };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true. Errors: ' + JSON.stringify(result.errors));
});

// --- optionExplanations tests ---

runTest('optionExplanations valid (length matches options) passes', () => {
  var data = {
    page: { title: 'Test' },
    sections: [{
      type: 'quiz',
      title: 'Quiz',
      questions: [{
        question: 'Q?',
        options: ['A', 'B', 'C'],
        correctIndex: 0,
        explanation: 'Correct!',
        optionExplanations: ['A is right', 'B is wrong', 'C is wrong']
      }]
    }]
  };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, true, 'Expected valid=true. Errors: ' + JSON.stringify(result.errors));
});

runTest('optionExplanations length mismatch returns error', () => {
  var data = {
    page: { title: 'Test' },
    sections: [{
      type: 'quiz',
      title: 'Quiz',
      questions: [{
        question: 'Q?',
        options: ['A', 'B', 'C'],
        correctIndex: 0,
        explanation: 'Correct!',
        optionExplanations: ['Only one']
      }]
    }]
  };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false, 'Expected valid=false for length mismatch');
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('optionExplanations') !== -1; }));
});

runTest('optionExplanations non-array returns error', () => {
  var data = {
    page: { title: 'Test' },
    sections: [{
      type: 'quiz',
      title: 'Quiz',
      questions: [{
        question: 'Q?',
        options: ['A', 'B'],
        correctIndex: 0,
        explanation: 'Correct!',
        optionExplanations: 'not an array'
      }]
    }]
  };
  var result = validateLearningPage(data);
  assert.strictEqual(result.valid, false, 'Expected valid=false for non-array');
  assert.ok(result.errors.some(function(e) { return e.path.indexOf('optionExplanations') !== -1; }));
});

// Summary
if (process.exitCode) {
  console.log('\nSome tests FAILED.');
} else {
  console.log('\nAll tests PASSED.');
}
