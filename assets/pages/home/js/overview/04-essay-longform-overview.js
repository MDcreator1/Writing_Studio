(function () {
  registerHomeOverview('essay', ({ action, featureCards, lane, pills, workflow }) => `
    <div class="home-overview-shell essay-overview">
      <section class="home-scenario-hero">
        <div>
          <span class="home-scenario-kicker">Essay / Longform Desk</span>
          <h2>A quiet structure for arguments, evidence, outlines, long drafts, citations, and editorial passes.</h2>
          <p>
            This desk is shaped for essays, criticism, explainers, and reflective longform pieces where the argument matters as much as the prose.
          </p>
          ${pills(['Argument map', 'Evidence bank', 'Outline blocks', 'Revision passes'])}
          <div class="home-overview-actions">
            ${action('Coming Desk', "openWritingTypePlaceholder('Essay / Longform')")}
            ${action('Use Story/Novel Editor', "openHomeProjectComposer('story')", 'secondary')}
          </div>
        </div>
        <div class="home-essay-map">
          <span>Thesis</span>
          <span>Point 01</span>
          <span>Evidence</span>
          <span>Counterpoint</span>
          <span>Conclusion</span>
        </div>
      </section>

      ${workflow([
        { title: 'Frame', body: 'Define thesis, audience, tone, scope, and the central question.' },
        { title: 'Build', body: 'Attach evidence, examples, references, and counterpoints to each section.' },
        { title: 'Draft', body: 'Write section by section while keeping the outline visible.' },
        { title: 'Tighten', body: 'Run editorial passes for structure, clarity, rhythm, and citations.' }
      ])}

      ${featureCards([
        { title: 'Thesis Workspace', body: 'A central thesis block with support points, counterpoints, and unresolved questions.', tone: 'tone-purple' },
        { title: 'Evidence Bank', body: 'Collect quotes, links, examples, page notes, and source reliability notes.', tone: 'tone-blue' },
        { title: 'Outline Modes', body: 'Move between skeletal outline, section cards, expanded draft, and final read-through.', tone: 'tone-green' },
        { title: 'Citation Notes', body: 'Keep citation target, source title, author, date, and usage context near the paragraph.', tone: 'tone-slate' },
        { title: 'Argument Flow', body: 'Check whether each section advances the thesis or repeats an earlier point.', tone: 'tone-orange' },
        { title: 'Longform Export', body: 'Prepare clean manuscript, web version, abstract, and summary notes.', tone: 'tone-teal' }
      ])}

      <section class="home-lane-grid">
        ${lane('Planning', ['Central claim', 'Audience promise', 'Research questions', 'Section outline'])}
        ${lane('Writing', ['Draft sections', 'Evidence cards', 'Counterpoint notes', 'Transition checks'])}
        ${lane('Editing', ['Clarity pass', 'Citation pass', 'Rhythm pass', 'Final summary'])}
      </section>
    </div>
  `);
})();
