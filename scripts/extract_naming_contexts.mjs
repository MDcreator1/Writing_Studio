import fs from 'node:fs';
import path from 'node:path';

const project = process.argv[2];
const output = process.argv[3];
if (!project || !output) throw new Error('Usage: node extract_naming_contexts.mjs <project> <output>');

const naming = JSON.parse(fs.readFileSync(path.join(project, 'Story_Naming.json'), 'utf8'));
const roots = ['Chapters', 'Drafts'];
const documents = [];
for (const root of roots) {
  const dir = path.join(project, root);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.txt')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const key = `${root}/${name}`;
    documents.push({ key, text: fs.readFileSync(path.join(dir, name), 'utf8') });
  }
}

function samplesFor(entry) {
  const aliases = [entry.name, ...(entry.similarNames ?? [])].filter(Boolean);
  const hits = [];
  for (const doc of documents) {
    for (const alias of aliases) {
      let from = 0;
      while (from < doc.text.length) {
        const at = doc.text.indexOf(alias, from);
        if (at < 0) break;
        const left = Math.max(0, doc.text.lastIndexOf('\n', Math.max(0, at - 420)) + 1);
        let right = doc.text.indexOf('\n', at + alias.length + 420);
        if (right < 0) right = doc.text.length;
        hits.push({ document: doc.key, alias, context: doc.text.slice(left, right).replace(/\s+/g, ' ').trim() });
        from = at + alias.length;
      }
    }
  }
  const unique = [...new Map(hits.map((h) => [`${h.document}\0${h.context}`, h])).values()];
  if (unique.length <= 12) return { hitCount: unique.length, samples: unique };
  const picked = [];
  for (let i = 0; i < 12; i++) picked.push(unique[Math.round(i * (unique.length - 1) / 11)]);
  return { hitCount: unique.length, samples: picked };
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceDocuments: documents.length,
  entries: naming.entries.map((entry) => ({
    id: entry.id,
    categoryId: entry.categoryId,
    name: entry.name,
    similarNames: entry.similarNames ?? [],
    existingDescription: entry.description ?? '',
    ...samplesFor(entry),
  })),
};
fs.writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ sourceDocuments: documents.length, entries: report.entries.length, output }, null, 2));
