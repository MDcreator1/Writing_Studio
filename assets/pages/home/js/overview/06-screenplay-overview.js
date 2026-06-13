(function () {
  registerHomeOverview('screenplay', ({ action, featureCards, lane, pills, workflow }) => `
    <div class="home-overview-shell screenplay-overview">
      <section class="home-scenario-hero">
        <div>
          <span class="home-scenario-kicker">Screenplay Desk</span>
          <h2>A production-minded writing surface for scenes, beats, characters, dialogue, locations, and continuity.</h2>
          <p>
            This desk is designed around scenes rather than chapters. It keeps dramatic beats, location changes,
            character arcs, and dialogue passes visible while the script grows.
          </p>
          ${pills(['Scene cards', 'Beat board', 'Dialogue passes', 'Continuity facts'])}
          <div class="home-overview-actions">
            ${action('Coming Desk', "openWritingTypePlaceholder('Screenplay')")}
            ${action('Use Story/Novel Editor', "openHomeProjectComposer('story')", 'secondary')}
          </div>
        </div>
        <div class="home-screenplay-board">
          <span>INT. ROOM - NIGHT</span>
          <strong>Beat 12</strong>
          <p>Goal, conflict, turn, exit image</p>
        </div>
      </section>

      ${workflow([
        { title: 'Break story', body: 'Create beats, acts, sequences, and turning points before writing scenes.' },
        { title: 'Write scenes', body: 'Draft scene by scene with location, time, characters present, and scene purpose.' },
        { title: 'Polish dialogue', body: 'Run dialogue passes by character voice, subtext, pace, and conflict.' },
        { title: 'Track continuity', body: 'Keep props, costumes, timelines, and location facts consistent.' }
      ])}

      ${featureCards([
        { title: 'Scene Cards', body: 'Every scene can carry slugline, location, time, characters, purpose, conflict, and exit image.', tone: 'tone-blue' },
        { title: 'Beat Board', body: 'Map act breaks, midpoint, reversals, reveals, set pieces, and emotional turns.', tone: 'tone-purple' },
        { title: 'Dialogue Focus', body: 'Filter scenes by character and review voice, subtext, line length, and interruptions.', tone: 'tone-green' },
        { title: 'Character Arc Tracker', body: 'Track want, need, wound, change, relationships, and scene-level behavior shifts.', tone: 'tone-orange' },
        { title: 'Production Facts', body: 'Keep locations, props, costumes, timeline, and continuity constraints attached to scenes.', tone: 'tone-slate' },
        { title: 'Draft Packages', body: 'Prepare script draft, scene list, beat sheet, character notes, and continuity export.', tone: 'tone-teal' }
      ])}

      <section class="home-lane-grid">
        ${lane('Structure', ['Acts', 'Sequences', 'Beats', 'Scene order'])}
        ${lane('Scene Writing', ['Slugline', 'Action', 'Dialogue', 'Transition notes'])}
        ${lane('Continuity', ['Characters present', 'Props', 'Locations', 'Timeline'])}
      </section>
    </div>
  `);
})();
