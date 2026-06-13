(function () {
  registerHomeOverview('story', ({ action, featureCards, lane, pills, workflow }) => `
    <div class="home-overview-shell story-overview">
      <section class="home-scenario-hero">
        <div>
          <span class="home-scenario-kicker">Story Writing Desk</span>
          <h2>Short fiction, episodes, drafts, names, facts, and clean local files in one focused room.</h2>
          <p>
            The Story project uses the full Story/Novel editor, but keeps the mental model lean:
            write in drafts, promote only what is ready, and keep continuity beside the page.
          </p>
          ${pills(['Draft-first writing', 'Local folder project', 'Naming + facts memory', 'Focus editor'])}
          <div class="home-overview-actions">
            ${action('Create Story Project', "openHomeProjectComposer('story')")}
            ${action('Recent Project', 'openHomeRecentProjects()', 'secondary')}
          </div>
        </div>
        <div class="home-scenario-snapshot">
          <div class="snapshot-top">
            <span>Draft 03</span>
            <strong>Scene polish</strong>
          </div>
          <div class="snapshot-lines">
            <span></span><span></span><span></span><span></span>
          </div>
          <div class="snapshot-meta">
            <span>Names detected</span>
            <strong>7</strong>
          </div>
        </div>
      </section>

      ${workflow([
        { title: 'Capture', body: 'Start inside draft files so the story can move before it becomes permanent.' },
        { title: 'Organize', body: 'Move finished drafts into chapters and keep parts/raw chapters tidy.' },
        { title: 'Remember', body: 'Names and facts stay attached to the active document and follow promotions.' },
        { title: 'Refine', body: 'Use focus mode, find/replace, formatting, and safe chapter editing.' }
      ])}

      ${featureCards([
        { title: 'Draft Saving System', body: 'Every new chapter starts as a draft. Autosave, manual save, word cache, draft delete, trash restore, and promote-to-chapter are all wired for local files.', tone: 'tone-green' },
        { title: 'Safe Chapter Editing', body: 'Saved chapters open locked. Editing creates a temporary chapter edit draft, with recovery when text, title, spacing, font, or alignment changes are found.', tone: 'tone-slate' },
        { title: 'Naming Board', body: 'Story-wide categories track characters, places, objects, groups, and custom sets. Entries can be chapter-linked, draft-linked, detected, orphaned, or undefined.', tone: 'tone-purple' },
        { title: 'Facts Panel', body: 'Save key-plus-description facts, pin important facts, filter by keyword, and surface current-chapter facts before recent story facts.', tone: 'tone-orange' },
        { title: 'Focus Mode', body: 'A full writing surface with adjustable width, focus top controls, chapter context, facts hover panel, and naming entry panels.', tone: 'tone-blue' },
        { title: 'Find and Replace', body: 'Safe, raw, and deep find modes support highlights, match rail, current match navigation, and replace scopes for before, after, or all matches.', tone: 'tone-teal' },
        { title: 'Hindi Unicode Input', body: 'The editor has a custom Devanagari logical input layer for virama, matras, grapheme boundaries, caret behavior, and delete behavior.', tone: 'tone-green' },
        { title: 'AI Desk Foundation', body: 'The side panel can store provider connections, local chat threads, and bridge-based AI replies for future OpenAI/Gemini style integrations.', tone: 'tone-purple' },
        { title: 'Portable Project Folder', body: 'The workspace stores Chapters_info.json, Story_Naming.json, draft JSON, trash JSON, chapter text files, draft files, and edit-draft files.', tone: 'tone-slate' }
      ])}

      <section class="home-lane-grid">
        ${lane('Left Workspace', ['Story summary', 'Parts and raw chapters', 'Draft list', 'Trash restore/delete', 'Recent chapters to draft'])}
        ${lane('Center Editor', ['Plain text writing mode', 'Review mode for locked chapters', 'Formatting dock', 'Status counters', 'Autosave and manual save'])}
        ${lane('Right Memory', ['Naming categories', 'Existing/detected names', 'Fact composer', 'Pinned facts', 'AI assistant panel'])}
      </section>
    </div>
  `);
})();
