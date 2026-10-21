'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(className = '') {
    this.className = className; this.children = []; this.dataset = {}; this.scrollTop = 0;
    this.clientHeight = 100; this.listeners = {};
    this.style = { values: {}, setProperty(name, value) { this.values[name] = value; } };
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
      remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); }
    };
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
    node.parentNode = this; this.children.push(node); return node;
  }
  prepend(node) { this.appendChild(node); this.children = [node, ...this.children.filter(child => child !== node)]; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.classList.contains(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get nextElementSibling() {
    return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null;
  }
  getBoundingClientRect() {
    if (this.classList.contains('naming-categories')) return { top: 0, height: this.clientHeight };
    if (this.classList.contains('cat-title')) return { top: this.parentNode.getBoundingClientRect().top, height: 40 };
    const siblings = this.parentNode?.children || [];
    const previousHeight = siblings.slice(0, siblings.indexOf(this)).reduce((sum, node) => sum + (parseFloat(node.style.values['--naming-expanded-height']) || 40) + 14, 0);
    return { top: 12 + previousHeight - (this.parentNode?.scrollTop || 0), height: 40 };
  }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  emit(name, event = {}) { for (const listener of this.listeners[name] || []) listener(event); }
}

const display = new Element('naming-categories');
function cards() {
  display.children = [];
  for (const id of ['first', 'selected', 'last', 'other']) {
    const card = new Element('naming-category-card'); card.dataset.categoryId = id;
    card.appendChild(new Element('cat-title')); card.appendChild(new Element('category-entries'));
    display.appendChild(card);
  }
}
cards(); display.scrollTop = 70; display.clientHeight = 600;
const context = {
  document: { getElementById: () => display, createElement: () => new Element() },
  window: { activeExpandedCategoryWithShowMore: 'selected' }, expandedNamingCategoryId: 'selected', isFocus: false,
  getComputedStyle: element => element === display ? { paddingTop: '12px', paddingBottom: '12px' } : { marginBottom: '14px' }
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'assets/pages/story-novel-project-editor/js/03c-naming-deep-scan-facts.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('let namingCategoryShowRequest'), source.indexOf('function namingCategoryRevealButtonsHtml')), context);
context.syncExpandedNamingViewport();
assert.equal(display.classList.contains('has-expanded-name-list'), true);
assert.deepEqual(display.children.map(card => card.dataset.categoryId), ['first', 'selected', 'last', 'other'], 'Expansion preserves the original category order and common scroll container');
assert.equal(display.querySelector('.naming-category-rail'), null, 'There is no independent category scroll box');
assert.equal(display.scrollTop, 54);
const selected = display.children[1];
assert.equal(selected.style.values['--naming-expanded-height'], '522px', 'Reserve only one 40px category header below the expanded list');
const header = selected.querySelector('.cat-title');
const list = selected.querySelector('.category-entries');
list.scrollTop = 140; list.emit('scroll');
assert.equal(display.scrollTop, 54, 'Names scrolling cannot move the full category panel');
assert.equal(header.listeners.wheel, undefined, 'Header wheel gestures follow the normal parent scroll');
display.scrollTop = 140; display.emit('scroll');
assert.equal(selected.getBoundingClientRect().top, -74, 'The expanded card moves with categories instead of staying pinned');
assert.equal(list.scrollTop, 140);
context.syncExpandedNamingViewport();
assert.equal(display.scrollTop, 140, 'Paging preserves common panel scrolling');
cards(); context.syncExpandedNamingViewport();
assert.equal(display.children[1].querySelector('.category-entries').scrollTop, 140, 'Save or background re-render preserves the names position');
assert.equal(display.scrollTop, 140, 'Re-render preserves the full-panel position');
display.clientHeight = 400; context.syncExpandedNamingViewport();
assert.equal(display.children[1].style.values['--naming-expanded-height'], '322px', 'The names viewport adapts to panel height while reserving only one next category');
context.resetNamingCategoryPagination();
context.window.activeExpandedCategoryWithShowMore = null;
cards(); context.syncExpandedNamingViewport();
assert.equal(display.classList.contains('has-expanded-name-list'), false);
assert.equal(display.scrollTop, 70, 'Hide restores the original category-list position');
assert.equal(display._namingNamesScroll, null);
assert.deepEqual(display.children.map(card => card.dataset.categoryId), ['first', 'selected', 'last', 'other']);
const css = fs.readFileSync(path.join(__dirname, '..', 'assets/pages/story-novel-project-editor/css/02-side-panels.css'), 'utf8');
const namesRule = css.slice(css.indexOf('.has-expanded-name-list .is-expanded-name-scroll > .category-entries {'), css.indexOf('.has-expanded-name-list .is-expanded-name-scroll > .category-entries > *'));
assert.ok(namesRule.includes('scrollbar-width: none'));
assert.ok(css.includes('.has-expanded-name-list .is-expanded-name-scroll > .category-entries::-webkit-scrollbar'));
console.log('Naming viewport: shared category scrolling, one next category, hidden scrollbars, resize, paging and hide restoration passed.');
