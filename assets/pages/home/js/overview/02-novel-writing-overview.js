(function () {
  registerHomeOverview('novel', ({ action, featureCards, lane, pills, workflow }) => `
    <div class="home-overview-shell novel-overview">
      <section class="home-scenario-hero">
        <div>
          <span class="home-scenario-kicker">Novel Writing Desk</span>
          <h2>A long-form command center for parts, chapters, continuity, revisions, and protected manuscript files.</h2>
          <p>
            Novel projects use the same editor engine with a stronger emphasis on scale:
            parts as folders, chapters as files, drafts as staging, and continuity data always beside the manuscript.
          </p>
          ${pills(['Parts as structure', 'Chapter files', 'Revision-safe editing', 'Continuity boards'])}
          <div class="home-overview-actions">
            ${action('Create Novel Project', "openHomeProjectComposer('novel')")}
            ${action('Recent Project', 'openHomeRecentProjects()', 'secondary')}
          </div>
        </div>
        <div class="home-novel-stack">
          <span>Part I</span>
          <span>Chapter 04</span>
          <span>Draft 12</span>
          <span>Naming Board</span>
          <span>Facts Memory</span>
        </div>
      </section>

      ${workflow([
        { title: 'Plan parts', body: 'Build act-like sections with titles, synopsis fields, status labels, and collapsible chapter lists.' },
        { title: 'Draft chapters', body: 'Keep rough writing in drafts until it is ready for the permanent chapter tree.' },
        { title: 'Protect canon', body: 'Saved chapters stay locked until you intentionally open an edit draft.' },
        { title: 'Track continuity', body: 'Names, facts, source links, and orphan checks help the project stay coherent.' }
      ])}

      <section class="home-wide-feature">
        <div>
          <span class="home-scenario-kicker">Editor capabilities already built</span>
          <h3>Everything the long-form editor currently supports</h3>
        </div>
        <div class="home-capability-cloud">
          <span>Autosave</span>
          <span>Manual save</span>
          <span>Local files</span>
          <span>Draft promotion</span>
          <span>Trash recovery</span>
          <span>Part details</span>
          <span>Raw chapters</span>
          <span>Chapter title edit</span>
          <span>Focus mode</span>
          <span>Formatting dock</span>
          <span>Find modes</span>
          <span>Replace scopes</span>
          <span>Naming shortcuts</span>
          <span>Deep finding</span>
          <span>Facts search</span>
          <span>AI bridge desk</span>
          <span>Hindi input</span>
          <span>TXT export</span>
        </div>
      </section>

      ${featureCards([
        { title: 'Part-Based Manuscript Tree', body: 'Parts can be added, expanded, collapsed, edited, deleted when empty, or removed while keeping chapters as raw chapters.', tone: 'tone-blue' },
        { title: 'Chapter Lifecycle', body: 'A draft becomes a chapter, a recent chapter can become a draft again, and empty chapters can be deleted safely.', tone: 'tone-green' },
        { title: 'Temporary Edit Drafts', body: 'Chapter edits are isolated in Edited_Chapter files and Temp_Chapter_Draft.json until saved back into the chapter.', tone: 'tone-slate' },
        { title: 'Continuity Intelligence', body: 'Naming entries keep document metadata, detect missing sources, resolve draft names after promotion, and count mentions in active text.', tone: 'tone-purple' },
        { title: 'Research Facts', body: 'Facts can be attached to chapters, pinned, searched, edited, viewed in focus mode, and grouped into current versus recent sections.', tone: 'tone-orange' },
        { title: 'Reading Flow Controls', body: 'Auto-scroll depth/band mode, focus width, status visibility, paragraph gap, paragraph margin, font, and line height are persisted per document.', tone: 'tone-teal' }
      ])}

      <section class="home-lane-grid">
        ${lane('For drafting', ['Draft files', 'Autosave every few seconds', 'Promotion destination choice', 'Bulk draft delete', 'Trash restore'])}
        ${lane('For revision', ['Read-only chapter review', 'Unlock edit draft', 'Mismatch recovery modal', 'Commit edits into chapter', 'Title sync'])}
        ${lane('For scale', ['Part synopsis', 'Chapter word totals', 'Recent chapter conversion', 'Raw chapter section', 'Project manifest normalization'])}
      </section>
    </div>
  `);
})();
