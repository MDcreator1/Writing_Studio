(function () {
  registerHomeOverview('news', ({ action, featureCards, lane, pills, workflow }) => `
    <div class="home-overview-shell news-overview">
      <section class="home-scenario-hero">
        <div>
          <span class="home-scenario-kicker">News Article Desk</span>
          <h2>A newsroom-style workspace for headlines, sources, sections, verification notes, and publish-ready drafts.</h2>
          <p>
            This desk is designed around fast reporting: gather facts, shape the lead, separate verified details from notes,
            and keep every source visible while drafting.
          </p>
          ${pills(['Headline lab', 'Source register', 'Fact checks', 'Section drafts'])}
          <div class="home-overview-actions">
            ${action('Open NewsDesk', "window.location.href='news-article-editor.html'")}
            ${action('Use Story/Novel Editor', "openHomeProjectComposer('story')", 'secondary')}
          </div>
        </div>
        <div class="home-news-board">
          <strong>Lead</strong>
          <span>Who / What / When / Where</span>
          <strong>Sources</strong>
          <span>Interview, report, official note</span>
          <strong>Status</strong>
          <span>Verified / Needs check</span>
        </div>
      </section>

      ${workflow([
        { title: 'Collect', body: 'Store source links, quotes, timestamps, names, and uncertainty notes before drafting.' },
        { title: 'Structure', body: 'Build headline, deck, lead, context, body sections, and closing update blocks.' },
        { title: 'Verify', body: 'Mark claims as verified, pending, conflicting, or removed from the story.' },
        { title: 'Publish', body: 'Prepare clean copy with summary, tags, source appendix, and revision log.' }
      ])}

      ${featureCards([
        { title: 'Headline Variants', body: 'Generate and compare direct, analytical, human-interest, and breaking-news headline versions.', tone: 'tone-blue' },
        { title: 'Source Ledger', body: 'Keep source title, link, publication, reliability, quote snippets, and attribution status together.', tone: 'tone-green' },
        { title: 'Fact Status Board', body: 'Track claims as verified, awaiting confirmation, contradicted, or safe to publish.', tone: 'tone-orange' },
        { title: 'Article Sections', body: 'Draft the lead, nut graph, context, timeline, expert comment, impact, and final update separately.', tone: 'tone-purple' },
        { title: 'Revision Notes', body: 'Record what changed between edits so updates can be explained cleanly.', tone: 'tone-slate' },
        { title: 'Export Targets', body: 'Prepare plain text, CMS-ready copy, social summary, and short bulletin formats.', tone: 'tone-teal' }
      ])}

      <section class="home-lane-grid">
        ${lane('Reporter View', ['Source queue', 'Claim checklist', 'Interview notes', 'Timeline snippets'])}
        ${lane('Editor View', ['Headline score', 'Lead strength', 'Missing context', 'Legal/sensitivity flags'])}
        ${lane('Output View', ['Article copy', 'Brief summary', 'Slug/tags', 'Update log'])}
      </section>
    </div>
  `);
})();
