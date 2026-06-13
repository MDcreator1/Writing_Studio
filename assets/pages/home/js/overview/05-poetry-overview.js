(function () {
  registerHomeOverview('poetry', ({ action, featureCards, lane, pills, workflow }) => `
    <div class="home-overview-shell poetry-overview">
      <section class="home-scenario-hero">
        <div>
          <span class="home-scenario-kicker">Poetry Desk</span>
          <h2>A compact studio for poems, variants, themes, voice notes, line breaks, and collection building.</h2>
          <p>
            This desk is designed for small pieces that need many versions. It treats a poem as a living object:
            drafts, forms, images, sounds, and collection placement stay together.
          </p>
          ${pills(['Version sets', 'Line focus', 'Theme tags', 'Collection order'])}
          <div class="home-overview-actions">
            ${action('Coming Desk', "openWritingTypePlaceholder('Poetry')")}
            ${action('Use Story/Novel Editor', "openHomeProjectComposer('story')", 'secondary')}
          </div>
        </div>
        <div class="home-poetry-card">
          <span>v04</span>
          <strong>Line break pass</strong>
          <p>image - breath - turn - ending</p>
        </div>
      </section>

      ${workflow([
        { title: 'Spark', body: 'Capture a fragment, image, phrase, rhythm, or feeling before it hardens.' },
        { title: 'Shape', body: 'Explore line breaks, stanza shape, form, repetition, and white space.' },
        { title: 'Version', body: 'Keep multiple variants without losing the first raw impulse.' },
        { title: 'Collect', body: 'Arrange poems into sections, themes, moods, and final order.' }
      ])}

      ${featureCards([
        { title: 'Variant Timeline', body: 'Save multiple versions of the same poem and compare what changed.', tone: 'tone-purple' },
        { title: 'Line Break Studio', body: 'Focus on line endings, stanza breaks, indentation, and visual rhythm.', tone: 'tone-blue' },
        { title: 'Image Bank', body: 'Track recurring images, metaphors, symbols, colors, and sensory details.', tone: 'tone-orange' },
        { title: 'Voice Notes', body: 'Attach tone, reading pace, sound texture, and performance notes to a poem.', tone: 'tone-green' },
        { title: 'Theme Tags', body: 'Group poems by grief, memory, city, body, devotion, nature, or custom themes.', tone: 'tone-teal' },
        { title: 'Collection Builder', body: 'Arrange poems into a manuscript sequence with sections and transitions.', tone: 'tone-slate' }
      ])}

      <section class="home-lane-grid">
        ${lane('Poem View', ['Current version', 'Line notes', 'Form notes', 'Sound notes'])}
        ${lane('Variant View', ['Original spark', 'Revision set', 'Discarded lines', 'Final candidate'])}
        ${lane('Collection View', ['Section order', 'Theme density', 'Opening poem', 'Closing poem'])}
      </section>
    </div>
  `);
})();
