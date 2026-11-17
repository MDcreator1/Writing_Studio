'use strict';

(function initializeParagraphModel(root) {
  function newId() {
    if (!root.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable.');
    return root.crypto.randomUUID();
  }

  function fromText(text, idFactory = newId) {
    if (typeof text !== 'string') throw new TypeError('Document text must be a string.');
    const paragraphs = [];
    const lines = /([^\r\n]*)(\r\n|\r|\n|$)/g;
    for (const match of text.matchAll(lines)) {
      paragraphs.push({ id: idFactory(), text: match[1], separator: match[2] });
      if (!match[2]) break;
    }
    validate(paragraphs);
    return paragraphs;
  }

  function validate(paragraphs) {
    if (!Array.isArray(paragraphs) || !paragraphs.length) throw new Error('A document requires at least one paragraph.');
    const ids = new Set();
    paragraphs.forEach((paragraph, index) => {
      if (!paragraph || typeof paragraph.id !== 'string' || !paragraph.id || ids.has(paragraph.id)) throw new Error('Paragraph IDs must be unique.');
      ids.add(paragraph.id);
      if (typeof paragraph.text !== 'string' || /[\r\n]/.test(paragraph.text)) throw new Error('Paragraph text cannot contain line separators.');
      if (!['', '\n', '\r', '\r\n'].includes(paragraph.separator)) throw new Error('Invalid separator.');
      if (index < paragraphs.length - 1 && !paragraph.separator) throw new Error('Missing paragraph separator.');
      if (index === paragraphs.length - 1 && paragraph.separator) throw new Error('The final paragraph must terminate the document.');
    });
  }

  function toText(paragraphs) {
    validate(paragraphs);
    return paragraphs.map(paragraph => paragraph.text + paragraph.separator).join('');
  }

  // Pure operations: callers can stage the result and outbox in one transaction.
  function apply(paragraphs, operation, idFactory = newId) {
    validate(paragraphs);
    const next = paragraphs.map(paragraph => ({ ...paragraph }));
    const index = next.findIndex(paragraph => paragraph.id === operation.paragraphId);
    if (index < 0) throw new Error('Unknown paragraph.');
    const current = next[index];
    switch (operation.type) {
      case 'update':
        current.text = operation.text;
        break;
      case 'split': {
        const offset = operation.offset;
        if (!Number.isInteger(offset) || offset < 0 || offset > current.text.length) throw new Error('Invalid split offset.');
        if (offset > 0 && offset < current.text.length && /[\uD800-\uDBFF]/.test(current.text[offset - 1]) && /[\uDC00-\uDFFF]/.test(current.text[offset])) throw new Error('Split bisects a Unicode surrogate pair.');
        const right = { id: operation.newParagraphId || idFactory(), text: current.text.slice(offset), separator: current.separator };
        current.text = current.text.slice(0, offset);
        current.separator = operation.separator || '\n';
        next.splice(index + 1, 0, right);
        break;
      }
      case 'join': {
        const right = next[index + 1];
        if (!right || (operation.nextParagraphId && right.id !== operation.nextParagraphId)) throw new Error('Join target changed.');
        current.text += right.text;
        current.separator = right.separator;
        next.splice(index + 1, 1);
        break;
      }
      case 'delete':
        if (next.length === 1) { current.text = ''; current.separator = ''; }
        else { next.splice(index, 1); next[next.length - 1].separator = ''; }
        break;
      default: throw new Error('Unsupported paragraph operation.');
    }
    validate(next);
    return next;
  }

  root.LmParagraphModel = Object.freeze({ newId, fromText, toText, validate, apply });
})(typeof window === 'undefined' ? globalThis : window);
