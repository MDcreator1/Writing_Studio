'use strict';

const LM_EDITOR_ADVANCED_SETTINGS_KEY = 'lm_editor_advanced_settings_v1';
const LM_EDITOR_QUICK_SETTINGS_PINS_KEY = 'lm_editor_quick_settings_pins_v1';
const LM_EDITOR_QUICK_SETTINGS_PIN_DEFAULTS = Object.freeze({
  autoscroll: true,
  smartCopy: true,
  smartPaste: true,
  globalFormatting: true,
  reviewMargin: true,
  find: true,
  replace: true
});

const LM_EDITOR_ADVANCED_SCHEMA = [
  { category: 'Large document & workers', key: 'virtualWordThreshold', label: 'Virtual editor threshold', unit: 'words', value: 3000, min: 500, max: 100000, step: 100, work: 'Documents at or above this size use the virtual editor.', up: 'More documents render fully; large documents may type slower.', down: 'Virtual mode starts sooner; switching and scrolling need more Worker coordination.' },
  { category: 'Large document & workers', key: 'virtualWindowSize', label: 'Visible paragraph window', unit: 'paragraphs', value: 25, min: 5, max: 100, step: 1, work: 'Maximum paragraph window kept in the editor DOM.', up: 'Smoother long scrolling, but heavier DOM layout and typing.', down: 'Faster DOM updates, but window changes happen more often.' },
  { category: 'Large document & workers', key: 'workerWindowMaximum', label: 'Worker window maximum', unit: 'paragraphs', value: 40, min: 10, max: 200, step: 1, work: 'Safety cap for paragraph windows returned by the Bridge Worker.', up: 'Allows larger windows and more memory/transfer work.', down: 'Stricter memory cap; requested windows may be clipped.' },
  { category: 'Large document & workers', key: 'workerResponseTimeout', label: 'Worker response timeout', unit: 'ms', value: 8000, min: 1000, max: 60000, step: 500, work: 'Maximum time an editor Worker task may remain silent before it is stopped and the safe fallback/retry path takes over.', up: 'Allows very slow Worker jobs to finish, but a stalled autosave can wait longer.', down: 'Recovers from stalled Workers sooner; extremely heavy jobs may time out.' },
  { category: 'Large document & workers', key: 'patchBatchDelay', label: 'Typing patch batch', unit: 'ms', value: 75, min: 0, max: 1000, step: 5, work: 'Wait before accumulated paragraph edits are sent to the Worker.', up: 'Fewer messages, but counts and memory trail typing longer.', down: 'Fresher background state, but more Worker messages.' },
  { category: 'Large document & workers', key: 'materializeDelay', label: 'innerHTML materialization idle', unit: 'ms', value: 700, min: 50, max: 10000, step: 50, work: 'Idle delay before full innerHTML is rebuilt from paragraph state.', up: 'Less rebuilding during pauses; memory/save state remains stale longer.', down: 'Faster memory sync, but more full HTML rebuilds.' },
  { category: 'Large document & workers', key: 'fullAnalysisDelay', label: 'Full analysis idle', unit: 'ms', value: 2200, min: 100, max: 30000, step: 100, work: 'Idle delay before full naming/statistics analysis.', up: 'Less background competition; naming updates later.', down: 'Faster analysis feedback; more CPU during short pauses.' },
  { category: 'Large document & workers', key: 'memoryCommitDelay', label: 'Normal memory commit', unit: 'ms', value: 180, min: 0, max: 5000, step: 10, work: 'Commit delay for non-virtual editor HTML.', up: 'Combines more edits; unsaved state lasts longer.', down: 'Memory updates sooner; more commits.' },
  { category: 'Large document & workers', key: 'restrictedInputIdleDelay', label: 'Input rendering idle timeout', unit: 'ms', value: 3000, min: 250, max: 30000, step: 250, work: 'Ends restricted paragraph rendering after this much time without another editor input.', up: 'Restricted rendering remains active through longer typing pauses.', down: 'The full document returns sooner after typing stops.' },

  { category: 'Saving & statistics', key: 'autosaveInputIdleDelay', label: 'Typing-idle autosave', unit: 'ms', value: 750, min: 100, max: 10000, step: 50, work: 'Starts a real persistence save after the last editor input remains idle for this time.', up: 'Fewer storage writes during short pauses.', down: 'Recent input reaches storage sooner; disk writes happen more often.' },
  { category: 'Saving & statistics', key: 'autosaveDelay', label: 'Post-memory autosave fallback', unit: 'ms', value: 1500, min: 100, max: 60000, step: 100, work: 'Fallback delay used after an innerHTML buffer reaches authoritative memory and still needs persistence.', up: 'Fewer fallback writes; unsaved recovery waits longer.', down: 'Fallback persistence starts sooner.' },
  { category: 'Saving & statistics', key: 'autosaveIntervalDelay', label: 'Unsaved backup interval', unit: 'ms', value: 3000, min: 500, max: 60000, step: 250, work: 'Periodic safety check while unsaved editor data remains.', up: 'Fewer checks, but recovery from a missed idle trigger is slower.', down: 'Recovers missed saves sooner; checks run more frequently.' },
  { category: 'Saving & statistics', key: 'readingWordsPerMinute', label: 'Reading speed', unit: 'words/min', value: 200, min: 50, max: 1000, step: 10, work: 'Divisor used for estimated reading time.', up: 'Displayed reading time becomes shorter.', down: 'Displayed reading time becomes longer.' },
  { category: 'Saving & statistics', key: 'savedStatusDuration', label: 'Saved status duration', unit: 'ms', value: 2500, min: 0, max: 15000, step: 100, work: 'How long the saved indicator remains visible.', up: 'Confirmation stays longer.', down: 'Cleaner UI sooner.' },
  { category: 'Saving & statistics', key: 'sideSaveDuration', label: 'Side-panel save duration', unit: 'ms', value: 1600, min: 0, max: 15000, step: 100, work: 'Visibility time for side-panel saved feedback.', up: 'Feedback is easier to notice.', down: 'Panel settles sooner.' },

  { category: 'History & input', key: 'historyLimit', label: 'Undo snapshots per document', unit: 'snapshots', value: 120, min: 10, max: 1000, step: 10, work: 'Maximum undo history retained for one document.', up: 'Deeper undo, more memory.', down: 'Less memory, shorter undo history.' },
  { category: 'History & input', key: 'historyDocuments', label: 'Documents with history', unit: 'documents', value: 16, min: 1, max: 100, step: 1, work: 'Maximum documents whose undo history is retained.', up: 'More cross-document undo memory.', down: 'Older document histories are removed sooner.' },
  { category: 'History & input', key: 'historyTypingGroup', label: 'Typing merge window', unit: 'ms', value: 4500, min: 100, max: 30000, step: 100, work: 'Nearby typing snapshots merge into one undo step.', up: 'Undo removes larger typing groups.', down: 'More granular undo, more snapshots.' },
  { category: 'History & input', key: 'historyDebounce', label: 'History snapshot idle', unit: 'ms', value: 650, min: 50, max: 10000, step: 50, work: 'Typing pause before a history snapshot is captured.', up: 'Fewer snapshots; latest undo point arrives later.', down: 'More responsive undo history; more snapshot work.' },
  { category: 'History & input', key: 'hindiLogicalRefresh', label: 'Hindi logical refresh', unit: 'ms', value: 650, min: 0, max: 5000, step: 25, work: 'Deferred refresh of the Hindi logical character sequence.', up: 'Less scanning while typing; logical state updates later.', down: 'Fresher Unicode state; more frequent scans.' },
  { category: 'History & input', key: 'formatSelectionGrace', label: 'Formatting selection grace', unit: 'ms', value: 30000, min: 1000, max: 120000, step: 1000, work: 'How long a captured selection remains valid for toolbar actions.', up: 'Selection survives longer; may target an older selection.', down: 'Safer targeting; selection expires sooner.' },

  { category: 'Focus & auto-scroll', key: 'focusIdleDelay', label: 'Focus controls idle', unit: 'ms', value: 5000, min: 250, max: 30000, step: 250, work: 'Delay before focus-mode controls enter idle state.', up: 'Controls remain visible longer.', down: 'Cleaner focus view sooner.' },
  { category: 'Focus & auto-scroll', key: 'focusWidthMin', label: 'Minimum focus width', unit: 'vw', value: 30, min: 15, max: 90, step: 1, work: 'Smallest focus editor width.', up: 'Prevents narrow editor layouts.', down: 'Allows a narrower writing column.' },
  { category: 'Focus & auto-scroll', key: 'focusWidthMax', label: 'Maximum focus width', unit: 'vw', value: 90, min: 30, max: 100, step: 1, work: 'Largest focus editor width.', up: 'Allows wider text lines.', down: 'Caps line width and leaves more side space.' },
  { category: 'Focus & auto-scroll', key: 'focusWidthDefault', label: 'Default focus width', unit: '%', value: 67, min: 20, max: 100, step: 1, work: 'Initial focus editor width.', up: 'Wider default writing area.', down: 'Narrower reading column.' },
  { category: 'Focus & auto-scroll', key: 'focusStatsHide', label: 'Focus stats hide', unit: 'ms', value: 4000, min: 0, max: 30000, step: 250, work: 'How long selection statistics remain visible.', up: 'Stats remain visible longer.', down: 'Stats disappear sooner.' },
  { category: 'Focus & auto-scroll', key: 'caretScrollSuppress', label: 'Caret scroll suppression', unit: 'ms', value: 260, min: 0, max: 3000, step: 10, work: 'Suppresses automatic caret scrolling after manual actions.', up: 'Less scroll fighting; auto-follow resumes later.', down: 'Auto-follow resumes faster; may compete with the user.' },
  { category: 'Focus & auto-scroll', key: 'manualScrollOverride', label: 'Manual scroll override', unit: 'ms', value: 1200, min: 0, max: 10000, step: 50, work: 'Pauses automatic scrolling after user scroll input.', up: 'Manual position is respected longer.', down: 'Caret follow resumes sooner.' },
  { category: 'Focus & auto-scroll', key: 'manualScrollIntent', label: 'Manual scroll intent', unit: 'ms', value: 700, min: 0, max: 5000, step: 25, work: 'Time a wheel/touch action is treated as intentional scrolling.', up: 'Stronger manual control.', down: 'Faster automatic recovery.' },
  { category: 'Focus & auto-scroll', key: 'programmaticScrollWindow', label: 'Programmatic scroll window', unit: 'ms', value: 160, min: 0, max: 2000, step: 10, work: 'Distinguishes app scrolling from manual scrolling.', up: 'More scroll events count as app-generated.', down: 'App scrolls may be mistaken for user input.' },
  { category: 'Focus & auto-scroll', key: 'markerDragThreshold', label: 'Marker drag threshold', unit: 'px', value: 4, min: 0, max: 30, step: 1, work: 'Pointer movement required before a marker becomes a drag.', up: 'Fewer accidental drags.', down: 'More responsive dragging; easier accidental movement.' },
  { category: 'Focus & auto-scroll', key: 'markerClickDelay', label: 'Marker click delay', unit: 'ms', value: 240, min: 0, max: 1000, step: 10, work: 'Wait used to distinguish click from double-click.', up: 'Better double-click detection; slower single click.', down: 'Faster click; double-click can misfire.' },
  { category: 'Focus & auto-scroll', key: 'caretSyncDelay', label: 'Caret position sync', unit: 'ms', value: 90, min: 0, max: 2000, step: 10, work: 'Delay before caret placement updates auto-scroll markers.', up: 'Fewer geometry reads; marker follows later.', down: 'Marker follows sooner; more layout reads.' },
  { category: 'Focus & auto-scroll', key: 'autoScrollBandMinGap', label: 'Comfort band minimum gap', unit: '%', value: 22, min: 5, max: 50, step: 1, work: 'Minimum vertical gap enforced between the comfort-band top and bottom boundaries.', up: 'Top and bottom guides remain farther apart.', down: 'Allows tighter comfort-band boundaries.' },
  { category: 'Focus & auto-scroll', key: 'defaultAutoScrollDepth', label: 'Default single-marker position', unit: '%', value: 72, min: 1, max: 100, step: 1, work: 'Global default position for single depth marker mode.', up: 'Sets default single-marker position lower on the screen.', down: 'Sets default single-marker position higher on the screen.' },
  { category: 'Focus & auto-scroll', key: 'defaultAutoScrollBandTop', label: 'Default comfort-band top', unit: '%', value: 14, min: 1, max: 99, step: 1, work: 'Global default upper boundary for comfort band mode.', up: 'Lowers the default top comfort boundary.', down: 'Raises the default top comfort boundary.' },
  { category: 'Focus & auto-scroll', key: 'defaultAutoScrollBandBottom', label: 'Default comfort-band bottom', unit: '%', value: 88, min: 2, max: 100, step: 1, work: 'Global default lower boundary for comfort band mode.', up: 'Lowers the default bottom comfort boundary.', down: 'Raises the default bottom comfort boundary.' },

  { category: 'Sidebar & feedback', key: 'sidebarMinHeight', label: 'Chapter list minimum', unit: 'px', value: 160, min: 80, max: 500, step: 10, work: 'Minimum usable chapter-list height.', up: 'List keeps more space; editor may get less.', down: 'More room for other sidebar sections.' },
  { category: 'Sidebar & feedback', key: 'draftVisibleItems', label: 'Compact draft visibility', unit: 'items', value: 2.5, min: 1, max: 10, step: 0.5, work: 'Approximate visible drafts in compact mode.', up: 'More drafts visible; chapter area shrinks.', down: 'More chapter space; fewer drafts visible.' },
  { category: 'Sidebar & feedback', key: 'draftCompactMinimum', label: 'Compact mode minimum drafts', unit: 'items', value: 3, min: 1, max: 20, step: 1, work: 'Draft count required before compact mode activates.', up: 'Compact mode activates later.', down: 'Compact mode activates sooner.' },
  { category: 'Sidebar & feedback', key: 'draftFallbackHeight', label: 'Draft fallback height', unit: 'px', value: 190, min: 80, max: 600, step: 10, work: 'Fallback draft-box height when measurement is unavailable.', up: 'More draft space.', down: 'More chapter/editor space.' },
  { category: 'Sidebar & feedback', key: 'smartCopyReset', label: 'Smart Copy success duration', unit: 'ms', value: 3500, min: 0, max: 20000, step: 100, work: 'How long the copied icon remains active.', up: 'Copy confirmation stays longer.', down: 'Icon resets sooner.' },

  { category: 'Advanced import', key: 'importDefaultWords', label: 'Default words per draft', unit: 'words', value: 2500, min: 100, max: 50000, step: 100, work: 'Initial split parameter for Advanced Import.', up: 'Fewer, larger drafts.', down: 'More, smaller drafts.' },
  { category: 'Advanced import', key: 'importMinimumWords', label: 'Minimum split parameter', unit: 'words', value: 100, min: 10, max: 10000, step: 10, work: 'Lowest value accepted by the split input.', up: 'Prevents very small drafts.', down: 'Allows smaller split drafts.' },
  { category: 'Advanced import', key: 'importMaximumWords', label: 'Maximum split parameter', unit: 'words', value: 50000, min: 1000, max: 500000, step: 1000, work: 'Highest value accepted by the split input.', up: 'Allows extremely large drafts.', down: 'Restricts accidental huge parameters.' },
  { category: 'Advanced import', key: 'importSmartLookAhead', label: 'Smart boundary look-ahead', unit: 'characters', value: 1200, min: 0, max: 10000, step: 100, work: 'Text searched after the word target for sentence/newline boundaries.', up: 'More natural endings, but chapters may exceed the target more.', down: 'Word counts stay closer; endings may be abrupt.' },
  { category: 'Advanced import', key: 'customMinimumOccurrences', label: 'Custom marker occurrences', unit: 'occurrences', value: 2, min: 2, max: 20, step: 1, work: 'Minimum marker occurrences required for custom splitting.', up: 'Stricter validation.', down: 'Allows fewer marker boundaries.' },
  { category: 'Advanced import', key: 'customSelectHeight', label: 'Split menu height', unit: 'px', value: 110, min: 70, max: 400, step: 10, work: 'Maximum height of the Split Method menu.', up: 'More menu space.', down: 'Scrollbar may appear.' }
];

const LM_EDITOR_DEVELOPER_SETTING_KEYS = new Set([
  'workerWindowMaximum', 'workerResponseTimeout', 'patchBatchDelay', 'materializeDelay', 'fullAnalysisDelay', 'memoryCommitDelay',
  'autosaveDelay', 'autosaveIntervalDelay', 'historyDebounce', 'hindiLogicalRefresh', 'caretScrollSuppress',
  'manualScrollOverride', 'manualScrollIntent', 'programmaticScrollWindow', 'markerClickDelay', 'caretSyncDelay',
  'draftFallbackHeight', 'customSelectHeight', 'autoScrollBandMinGap', 'defaultAutoScrollDepth', 'defaultAutoScrollBandTop', 'defaultAutoScrollBandBottom'
]);

const LM_EDITOR_ADVANCED_USER_COPY = {
  virtualWordThreshold: ['Large document mode starts at', 'Documents with this many words use the faster large-document editor.', 'Large-document mode starts only for bigger manuscripts.', 'Large-document mode starts sooner for smaller manuscripts.'],
  virtualWindowSize: ['Paragraphs kept ready while typing', 'Number of nearby paragraphs kept active during focused typing.', 'More nearby text stays ready, but typing may become heavier.', 'Typing stays lighter, but nearby text may refresh more often.'],
  workerWindowMaximum: ['Maximum background paragraph window', 'Safety limit for how many paragraphs the background processor may prepare at once.', 'Background work can prepare more text but use more memory.', 'Memory use falls, but large requests may be shortened.'],
  workerResponseTimeout: ['Background task wait limit', 'How long the editor waits for a background task before safely trying another route.', 'Slow tasks get more time, but a stuck task takes longer to recover.', 'Stuck tasks recover sooner, but very heavy tasks may be interrupted.'],
  patchBatchDelay: ['Typing update bundle delay', 'Briefly groups nearby edits before sending them to background processing.', 'Fewer background messages, but counts update a little later.', 'Counts update sooner, but background work runs more often.'],
  materializeDelay: ['Full document update pause', 'Pause after typing before the complete document copy is rebuilt.', 'Typing gets more breathing room, but the full copy updates later.', 'The full copy updates sooner, but large documents may work harder.'],
  fullAnalysisDelay: ['Story analysis pause', 'Pause after typing before names and document statistics are checked again.', 'Typing stays smoother, but analysis results appear later.', 'Analysis appears sooner, but may compete with rapid typing.'],
  memoryCommitDelay: ['Document memory update delay', 'Brief delay before normal documents update their in-memory saved copy.', 'Nearby edits are combined, but unsaved status lasts longer.', 'Memory updates sooner, but more update work is performed.'],
  restrictedInputIdleDelay: ['Return full document after typing', 'Time after the last typed character before the full document view returns.', 'The lightweight typing view remains longer after a pause.', 'The complete document returns sooner.'],
  autosaveInputIdleDelay: ['Autosave after typing stops', 'How long the editor waits after your last typed character before saving.', 'Fewer saves while pausing briefly, but recent work waits longer.', 'Recent work is saved sooner, with more frequent saves.'],
  autosaveDelay: ['Backup autosave delay', 'Extra safety delay used if edited content reached memory but still needs storage.', 'Fewer backup save attempts, but recovery takes longer.', 'Backup saving starts sooner.'],
  autosaveIntervalDelay: ['Unsaved work safety check', 'How often the editor checks again while any work is still unsaved.', 'Fewer checks, but a missed save is noticed later.', 'Missed saves are noticed sooner, with more background checks.'],
  readingWordsPerMinute: ['Estimated reading speed', 'Words per minute used to calculate the reading-time estimate.', 'The displayed reading time becomes shorter.', 'The displayed reading time becomes longer.'],
  savedStatusDuration: ['Saved message display time', 'How long the Saved confirmation remains visible.', 'The confirmation stays visible longer.', 'The interface clears the confirmation sooner.'],
  sideSaveDuration: ['Sidebar save message time', 'How long save confirmation remains visible in side panels.', 'The message is easier to notice.', 'The side panel returns to normal sooner.'],
  historyLimit: ['Undo steps per document', 'Maximum number of earlier editing states available through Undo.', 'You can undo farther back, using more memory.', 'Less memory is used, but older undo steps disappear sooner.'],
  historyDocuments: ['Documents that remember Undo', 'Number of recently edited documents whose undo history is kept.', 'More documents remember earlier edits, using more memory.', 'Older document histories are cleared sooner.'],
  historyTypingGroup: ['Group continuous typing for Undo', 'Typing done within this time is treated as one Undo action.', 'One Undo may remove a larger block of recent typing.', 'Undo works in smaller, more detailed steps.'],
  historyDebounce: ['Undo snapshot pause', 'Idle time before the editor records a new internal Undo snapshot.', 'Fewer snapshots are created, but the newest step appears later.', 'Undo history updates sooner, with more snapshot work.'],
  hindiLogicalRefresh: ['Hindi text processing pause', 'Delay before the editor refreshes its internal Hindi character sequence.', 'Less work happens while typing, but internal text state updates later.', 'Hindi text state updates sooner, with more frequent processing.'],
  formatSelectionGrace: ['Remember selection for formatting', 'How long a selected passage remains available to toolbar formatting actions.', 'Toolbar actions can use the selection for longer.', 'Old selections expire sooner, reducing accidental formatting.'],
  focusIdleDelay: ['Hide focus-mode controls after', 'Time without activity before focus-mode controls become less distracting.', 'Controls remain available on screen longer.', 'Controls clear away sooner for a cleaner writing view.'],
  caretScrollSuppress: ['Pause cursor auto-follow', 'Briefly prevents automatic cursor scrolling after a manual action.', 'The editor interferes less with manual positioning.', 'Automatic cursor following resumes sooner.'],
  manualScrollOverride: ['Respect manual scrolling for', 'How long automatic scrolling pauses after you scroll yourself.', 'Your chosen scroll position is held longer.', 'The editor follows the cursor again sooner.'],
  manualScrollIntent: ['Recognize scrolling as intentional', 'Time during which wheel or touch movement is treated as deliberate scrolling.', 'Manual scrolling has stronger control.', 'Automatic scrolling recovers faster.'],
  programmaticScrollWindow: ['Recognize editor-made scrolling', 'Helps distinguish scrolling performed by the editor from scrolling performed by you.', 'More scroll events are treated as editor-controlled.', 'Editor scrolling may sometimes be treated as manual.'],
  markerDragThreshold: ['Movement before marker dragging', 'Pointer distance required before a click becomes a marker drag.', 'Accidental marker dragging becomes less likely.', 'Markers begin dragging more quickly.'],
  markerClickDelay: ['Marker double-click wait', 'Brief wait used to tell a single marker click from a double-click.', 'Double-click recognition improves, but single clicks respond later.', 'Single clicks respond faster, but double-clicks may be missed.'],
  caretSyncDelay: ['Cursor marker update delay', 'Delay before cursor position updates related scroll markers.', 'Fewer position checks occur, but markers follow later.', 'Markers follow sooner, with more layout checks.'],
  focusWidthMin: ['Narrowest focus-mode page', 'Smallest width allowed for the writing page in focus mode.', 'The writing page cannot become too narrow.', 'A narrower, book-like writing column is allowed.'],
  focusWidthMax: ['Widest focus-mode page', 'Largest width allowed for the writing page in focus mode.', 'More text can fit across each line.', 'Lines stay narrower with more space at the sides.'],
  focusWidthDefault: ['Default focus-mode page width', 'Starting width of the writing page when focus mode opens.', 'Focus mode opens with a wider writing area.', 'Focus mode opens with a narrower reading column.'],
  focusStatsHide: ['Selection statistics display time', 'How long word and selection statistics remain visible in focus mode.', 'Statistics stay visible longer.', 'Statistics disappear sooner.'],
  autoScrollBandMinGap: ['Comfort band minimum gap', 'Minimum vertical gap required between top and bottom comfort-band guides.', 'Top and bottom guides stay farther apart.', 'Allows top and bottom guides to get closer together.'],
  defaultAutoScrollDepth: ['Default single-marker position', 'Global default position for single depth marker mode.', 'Sets default single-marker position lower on the screen.', 'Sets default single-marker position higher on the screen.'],
  defaultAutoScrollBandTop: ['Default comfort-band top', 'Global default upper boundary for comfort band mode.', 'Lowers the default top comfort boundary.', 'Raises the default top comfort boundary.'],
  defaultAutoScrollBandBottom: ['Default comfort-band bottom', 'Global default lower boundary for comfort band mode.', 'Lowers the default bottom comfort boundary.', 'Raises the default bottom comfort boundary.'],
  sidebarMinHeight: ['Minimum chapter-list height', 'Smallest height the chapter list is allowed to use.', 'More chapters remain visible, leaving less room for other sections.', 'Other sidebar sections gain space.'],
  draftVisibleItems: ['Drafts visible in compact view', 'Approximate number of drafts shown before the compact list scrolls.', 'More drafts are visible, leaving less room for chapters.', 'More room remains for chapters, with fewer drafts visible.'],
  draftCompactMinimum: ['Start compact draft view at', 'Number of drafts required before the compact draft layout turns on.', 'Compact view starts only when there are more drafts.', 'Compact view starts sooner.'],
  draftFallbackHeight: ['Backup draft-panel height', 'Height used internally when the editor cannot measure the draft panel.', 'The backup layout gives drafts more room.', 'The backup layout gives chapters and editor more room.'],
  smartCopyReset: ['Copied confirmation display time', 'How long the Copy button continues to show that copying succeeded.', 'The confirmation remains noticeable longer.', 'The button returns to normal sooner.'],
  importDefaultWords: ['Preferred words per imported draft', 'Starting target size used when a long import is split into drafts.', 'The import creates fewer, longer drafts.', 'The import creates more, shorter drafts.'],
  importMinimumWords: ['Smallest allowed draft target', 'Lowest words-per-draft value accepted during Advanced Import.', 'Very small imported drafts are prevented.', 'Smaller imported drafts become possible.'],
  importMaximumWords: ['Largest allowed draft target', 'Highest words-per-draft value accepted during Advanced Import.', 'Very large imported drafts become possible.', 'Accidentally huge draft targets are restricted.'],
  importSmartLookAhead: ['Search ahead for a natural ending', 'How far import may look past its word target for a sentence or paragraph ending.', 'Drafts end more naturally but may exceed the target more.', 'Draft sizes stay closer to the target but may end abruptly.'],
  customMinimumOccurrences: ['Required custom split markers', 'Minimum times your custom word must appear before it can split an import.', 'Custom splitting requires more reliable markers.', 'Text can be split using fewer marker appearances.'],
  customSelectHeight: ['Split-method menu height', 'Maximum height of the split-method choice menu.', 'More choices fit without scrolling.', 'The menu is smaller and may need a scrollbar.']
};

function lmEditorAdvancedCopy(item) {
  const copy = LM_EDITOR_ADVANCED_USER_COPY[item.key];
  return copy ? { label: copy[0], work: copy[1], up: copy[2], down: copy[3] } : item;
}

function lmEditorAdvancedStored() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LM_EDITOR_ADVANCED_SETTINGS_KEY) || '{}') || {}; }
  catch { stored = {}; }

  if (typeof projectManifest !== 'undefined' && projectManifest?.globalTextFormatting) {
    const pf = projectManifest.globalTextFormatting;
    return {
      ...stored,
      globalFontSize: stored.globalFontSize ?? pf.globalFontSize ?? pf.fontSize ?? 16,
      globalLineSpacing: stored.globalLineSpacing ?? pf.globalLineSpacing ?? pf.lineHeight ?? 0,
      globalParagraphGap: stored.globalParagraphGap ?? pf.globalParagraphGap ?? pf.paragraphGap ?? 1,
      reviewModeMargin: stored.reviewModeMargin ?? pf.reviewModeMargin ?? pf.paragraphMargin ?? 0,
      globalAlignment: stored.globalAlignment ?? pf.globalAlignment ?? pf.alignment ?? 'justify',
      globalFontFamily: stored.globalFontFamily ?? pf.globalFontFamily ?? pf.fontFamily ?? (typeof EDITOR_FONT_FAMILIES !== 'undefined' ? EDITOR_FONT_FAMILIES[0] : 'Lora')
    };
  }
  return stored;
}

function lmEditorAdvancedDefinition(key) { return LM_EDITOR_ADVANCED_SCHEMA.find(item => item.key === key); }
function lmEditorAdvancedNumber(key, fallback) {
  const definition = lmEditorAdvancedDefinition(key);
  const stored = Number(lmEditorAdvancedStored()[key]);
  const base = Number.isFinite(stored) ? stored : Number(fallback ?? definition?.value ?? 0);
  return Math.max(definition?.min ?? -Infinity, Math.min(definition?.max ?? Infinity, base));
}
function lmEditorAdvancedBoolean(key, fallback = false) {
  const stored = lmEditorAdvancedStored()[key];
  return stored === true || stored === 'true' ? true : stored === false || stored === 'false' ? false : Boolean(fallback);
}
function lmEditorAdvancedString(key, fallback = '') {
  const stored = lmEditorAdvancedStored()[key];
  return stored === undefined || stored === null || String(stored).trim() === '' ? String(fallback) : String(stored);
}

function editorReviewModeMarginDefault() {
  const stored = Number(lmEditorAdvancedStored().reviewModeMargin);
  const value = Number.isFinite(stored) ? stored : 0;
  return typeof normalizeEditorParagraphMargin === 'function'
    ? normalizeEditorParagraphMargin(value)
    : Math.max(0, Math.min(120, Math.round(value)));
}

function setEditorReviewModeMarginDefault(value) {
  const safeValue = typeof normalizeEditorParagraphMargin === 'function'
    ? normalizeEditorParagraphMargin(value)
    : Math.max(0, Math.min(120, Math.round(Number(value) || 0)));
  const stored = lmEditorAdvancedStored();
  stored.reviewModeMargin = safeValue;
  localStorage.setItem(LM_EDITOR_ADVANCED_SETTINGS_KEY, JSON.stringify(stored));
  const advancedInput = document.querySelector('[data-advanced-runtime-key="reviewModeMargin"]');
  if (advancedInput) advancedInput.value = String(safeValue);
  return safeValue;
}

function editorQuickSettingsPins() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LM_EDITOR_QUICK_SETTINGS_PINS_KEY) || '{}') || {}; }
  catch { stored = {}; }
  return Object.fromEntries(Object.entries(LM_EDITOR_QUICK_SETTINGS_PIN_DEFAULTS).map(([key, fallback]) => [
    key,
    stored[key] === true || stored[key] === 'true'
      ? true
      : stored[key] === false || stored[key] === 'false'
        ? false
        : fallback
  ]));
}

function isEditorQuickSettingPinned(key) {
  return Boolean(editorQuickSettingsPins()[key]);
}

function syncAdvancedQuickPinButtons(key) {
  const pinned = isEditorQuickSettingPinned(key);
  document.querySelectorAll(`[data-advanced-quick-pin="${key}"]`).forEach(button => {
    button.classList.toggle('is-pinned', pinned);
    button.setAttribute('aria-pressed', String(pinned));
    button.title = pinned ? 'Remove from quick settings' : 'Pin to quick settings';
    const settingLabel = button.dataset.advancedQuickPinName || 'Setting';
    const icon = button.querySelector('[data-advanced-quick-pin-icon]');
    if (icon && typeof window.lmIcon === 'function') {
      icon.innerHTML = window.lmIcon(pinned ? 'pinPinned' : 'pinUnpinned');
    }
    const label = button.querySelector('[data-advanced-quick-pin-label]');
    if (label) label.textContent = pinned ? `${settingLabel} pinned` : `Pin ${settingLabel}`;
  });
}

function toggleEditorQuickSettingPin(event, key) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!Object.prototype.hasOwnProperty.call(LM_EDITOR_QUICK_SETTINGS_PIN_DEFAULTS, key)) return;
  const pins = editorQuickSettingsPins();
  pins[key] = !pins[key];
  localStorage.setItem(LM_EDITOR_QUICK_SETTINGS_PINS_KEY, JSON.stringify(pins));

  if (!pins[key]) {
    if (key === 'autoscroll' && typeof isEditorAutoScrollModeSelectorOpen !== 'undefined') isEditorAutoScrollModeSelectorOpen = false;
    if (key === 'smartPaste' && typeof isPasteSettingsSelectorOpen !== 'undefined') isPasteSettingsSelectorOpen = false;
    if (key === 'smartCopy' && typeof isCopySettingsSelectorOpen !== 'undefined') isCopySettingsSelectorOpen = false;
    if (key === 'find' && typeof isFindSettingsSelectorOpen !== 'undefined') isFindSettingsSelectorOpen = false;
    if (key === 'replace' && typeof isReplaceSettingsSelectorOpen !== 'undefined') isReplaceSettingsSelectorOpen = false;
  }

  syncAdvancedQuickPinButtons(key);
  if (typeof updateEditorSettingsUI === 'function') updateEditorSettingsUI();
}

function advancedQuickPinButton(key, label, options = {}) {
  const pinned = isEditorQuickSettingPinned(key);
  const title = pinned ? `Remove ${label} from quick settings` : `Pin ${label} to quick settings`;
  const compact = options.compact === true;
  const pinIcon = typeof window.lmIcon === 'function'
    ? window.lmIcon(pinned ? 'pinPinned' : 'pinUnpinned')
    : '';
  return `<button class="advanced-quick-pin-button ${compact ? 'is-compact' : ''} ${pinned ? 'is-pinned' : ''}" type="button" data-advanced-quick-pin="${key}" data-advanced-quick-pin-name="${label}" aria-pressed="${pinned}" aria-label="${title}" title="${title}" onclick="toggleEditorQuickSettingPin(event, '${key}')"><span class="advanced-quick-pin-mark" data-advanced-quick-pin-icon aria-hidden="true">${pinIcon}</span><span class="${compact ? 'advanced-quick-pin-label-hidden' : ''}" data-advanced-quick-pin-label>${pinned ? `${label} pinned` : `Pin ${label}`}</span></button>`;
}

function advancedNumberStepper(inputHTML, key, label) {
  const icon = direction => typeof window.lmIcon === 'function'
    ? window.lmIcon('collapseChevron', `step-chevron-svg lm-chevron-${direction}`)
    : `<span aria-hidden="true">${direction === 'up' ? '&#9652;' : '&#9662;'}</span>`;
  return `<span class="advanced-number-stepper dock-fsize-control">${inputHTML}<span class="dock-fsize-stepper" aria-label="${label} controls"><button class="dock-fsize-step" type="button" aria-label="Increase ${label}" onclick="stepAdvancedNumberInput(event, '${key}', 1)">${icon('up')}</button><button class="dock-fsize-step" type="button" aria-label="Decrease ${label}" onclick="stepAdvancedNumberInput(event, '${key}', -1)">${icon('down')}</button></span></span>`;
}

function stepAdvancedNumberInput(event, key, direction) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const input = document.querySelector(`[data-advanced-editor-key="${key}"], [data-advanced-runtime-key="${key}"]`);
  if (!input || input.disabled || input.type !== 'number') return;
  if (direction > 0) input.stepUp();
  else input.stepDown();
  input.classList.remove('is-invalid');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus({ preventScroll: true });
}

function advancedEditorSettingControl(item, stored) {
  const value = Object.prototype.hasOwnProperty.call(stored, item.key) ? stored[item.key] : item.value;
  const input = `<input class="dock-fsize-inp advanced-number-input" id="advancedEditorSetting-${item.key}" type="number" data-advanced-editor-key="${item.key}" aria-describedby="advancedEditorSettingDescription-${item.key}" min="${item.min}" max="${item.max}" step="${item.step}" value="${value}">`;
  return advancedNumberStepper(input, item.key, item.label);
}

let activeAdvancedEditorSettingsCategoryIndex = 0;
let activeAdvancedEditorSettingsTopSection = 'autoscroll';
const LM_EDITOR_ADVANCED_TOP_SECTIONS = [
  { key: 'autoscroll', icon: 'AS', label: 'Auto-scroll controls', note: 'Cursor following', description: 'Control when and where the editor follows your typing cursor.' },
  { key: 'smart-copy', icon: 'C', label: 'Smart Copy', note: 'Copied paragraphs', description: 'Choose how paragraph breaks and spacing are written to the clipboard.' },
  { key: 'smart-paste', icon: 'P', label: 'Smart Paste', note: 'Pasted formatting', description: 'Choose how incoming text is cleaned and styled inside the editor.' },
  { key: 'global', icon: 'G', label: 'Global Text Formatting', note: 'All editor text', description: 'Set the default text format used everywhere: drafts, chapter reading, chapter editing, new documents, promoted chapters, and new paragraphs.' },
  { key: 'find-replace', icon: 'FR', label: 'Find & Replace', note: 'Matching and scope', description: 'Choose how text is matched and which results Replace All is allowed to change.' },
  { key: 'advanced-word-editing', icon: 'WE', label: 'Advanced Word Editing', note: 'Rules and replacement flow', description: 'Prepare how grouped aliases, matching priorities, dictionaries, previews, and safe bulk word edits will behave.' },
  { key: 'developer', icon: 'Dev', label: 'Developer settings', note: '44 internal controls', description: 'Performance, saving, input, layout, feedback, and import engine controls.' }
];
const LM_EDITOR_ADVANCED_CATEGORY_META = {
  'Large document & workers': { icon: 'Aa', description: 'Control how the editor keeps long chapters fast and comfortable while you write.' },
  'Saving & statistics': { icon: 'S', description: 'Choose when your writing is saved and how reading or save feedback is shown.' },
  'History & input': { icon: 'H', description: 'Adjust Undo behavior, typing groups, language processing, and remembered selections.' },
  'Focus & auto-scroll': { icon: 'F', description: 'Shape the distraction-free writing view and how the page follows your cursor.' },
  'Sidebar & feedback': { icon: 'UI', description: 'Decide how much room chapters and drafts receive and how long confirmations remain visible.' },
  'Advanced import': { icon: 'In', description: 'Control how long imported text is divided into manageable drafts.' }
};

function selectAdvancedEditorSettingsCategory(index, options = {}) {
  closeAdvancedEditorSettingInfo();
  const categories = [...new Set(LM_EDITOR_ADVANCED_SCHEMA.map(item => item.category)), 'Project Cache & Storage'];
  const nextIndex = Math.max(0, Math.min(categories.length - 1, Number(index) || 0));
  activeAdvancedEditorSettingsCategoryIndex = nextIndex;
  document.querySelectorAll('[data-advanced-developer-category]').forEach(button => {
    const active = Number(button.dataset.advancedDeveloperCategory) === nextIndex;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-advanced-developer-section]').forEach(section => {
    section.hidden = Number(section.dataset.advancedDeveloperSection) !== nextIndex;
  });
  if (options.keepScroll !== true) {
    const content = document.querySelector('.advanced-editor-settings-content');
    if (content) content.scrollTop = 0;
  }
}

function selectAdvancedEditorTopSection(key, options = {}) {
  const safeKey = LM_EDITOR_ADVANCED_TOP_SECTIONS.some(section => section.key === key) ? key : 'autoscroll';
  activeAdvancedEditorSettingsTopSection = safeKey;
  closeAdvancedEditorSettingInfo();
  document.querySelectorAll('[data-advanced-settings-nav]').forEach(button => {
    const active = button.dataset.advancedSettingsNav === safeKey;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-advanced-top-section]').forEach(section => {
    section.hidden = section.dataset.advancedTopSection !== safeKey;
  });
  if (options.keepScroll !== true) {
    const content = document.querySelector('.advanced-editor-settings-content');
    if (content) content.scrollTop = 0;
  }
}

function revealAdvancedEditorSetting(key) {
  const item = lmEditorAdvancedDefinition(key);
  if (!item) return;
  const categories = [...new Set(LM_EDITOR_ADVANCED_SCHEMA.map(definition => definition.category))];
  const categoryIndex = categories.indexOf(item.category);
  selectAdvancedEditorTopSection('developer');
  selectAdvancedEditorSettingsCategory(categoryIndex);
}

function handleAdvancedEditorSettingsNavKeydown(event, index) {
  const buttons = [...document.querySelectorAll('[data-advanced-settings-nav]')];
  if (!buttons.length) return;
  let nextIndex = index;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = buttons.length - 1;
  else return;
  event.preventDefault();
  selectAdvancedEditorTopSection(buttons[nextIndex]?.dataset.advancedSettingsNav);
  buttons[nextIndex]?.focus();
}

function closeAdvancedEditorSettingInfo(exceptKey = '') {
  document.querySelectorAll('[data-advanced-setting-info]').forEach(popover => {
    if (popover.dataset.advancedSettingInfo === exceptKey) return;
    popover.hidden = true;
    const button = popover.closest('.advanced-editor-setting-info-wrap')?.querySelector('.advanced-editor-setting-info-button');
    button?.setAttribute('aria-expanded', 'false');
    if (button && typeof window.lmIcon === 'function') button.innerHTML = window.lmIcon('categoryInfoClosed', 'advanced-editor-setting-info-icon');
  });
}

function toggleAdvancedEditorSettingInfo(event, key) {
  event.preventDefault();
  event.stopPropagation();
  const button = event.currentTarget;
  const popover = document.querySelector(`[data-advanced-setting-info="${key}"]`);
  if (!popover) return;
  const willOpen = popover.hidden;
  closeAdvancedEditorSettingInfo(willOpen ? key : '');
  popover.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
  if (typeof window.lmIcon === 'function') button.innerHTML = window.lmIcon(willOpen ? 'categoryInfoOpened' : 'categoryInfoClosed', 'advanced-editor-setting-info-icon');
  if (!willOpen) return;
  popover.style.left = '0px';
  popover.style.top = '0px';
  const buttonRect = button.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const left = Math.max(12, Math.min(window.innerWidth - popoverRect.width - 12, buttonRect.right - popoverRect.width));
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(12, buttonRect.top - popoverRect.height - 10)}px`;
}

function renderAdvancedEditorSettingsLegacy() {
  const modal = document.getElementById('advancedEditorSettingsModal');
  if (!modal) return;
  const stored = lmEditorAdvancedStored();
  const categories = [...new Set(LM_EDITOR_ADVANCED_SCHEMA.map(item => item.category))];
  modal.innerHTML = `<section class="advanced-editor-settings-card" role="dialog" aria-modal="true" aria-labelledby="advancedEditorSettingsTitle">
    <header><div><span>Runtime configuration</span><h2 id="advancedEditorSettingsTitle">Advanced Editor Settings</h2><p>Changes are validated, saved locally, and applied after reload.</p></div><button type="button" onclick="closeAdvancedEditorSettings()" aria-label="Close">×</button></header>
    <main>${categories.map((category, categoryIndex) => `<details ${categoryIndex === 0 ? 'open' : ''}><summary><strong>${category}</strong><span>${LM_EDITOR_ADVANCED_SCHEMA.filter(item => item.category === category).length} settings</span></summary><div class="advanced-editor-settings-grid">${LM_EDITOR_ADVANCED_SCHEMA.filter(item => item.category === category).map(item => `<label class="advanced-editor-setting-item"><span class="advanced-editor-setting-name"><strong>${item.label}</strong><em>${item.unit}</em></span>${advancedEditorSettingControl(item, stored)}<p>${item.work}</p><div><span class="is-up">Increase:</span> ${item.up}</div><div><span class="is-down">Decrease:</span> ${item.down}</div><button type="button" onclick="resetAdvancedEditorSetting('${item.key}')">Default ${item.value}</button></label>`).join('')}</div></details>`).join('')}</main></section>`;
}

function renderAdvancedEditorSettingsCategoryLegacy() {
  const modal = document.getElementById('advancedEditorSettingsModal');
  if (!modal) return;
  const stored = lmEditorAdvancedStored();
  const categories = [...new Set(LM_EDITOR_ADVANCED_SCHEMA.map(item => item.category))];
  activeAdvancedEditorSettingsCategoryIndex = Math.min(activeAdvancedEditorSettingsCategoryIndex, categories.length - 1);
  const navigation = categories.map((category, categoryIndex) => {
    const meta = LM_EDITOR_ADVANCED_CATEGORY_META[category] || { icon: 'Set' };
    const count = LM_EDITOR_ADVANCED_SCHEMA.filter(item => item.category === category && !LM_EDITOR_DEVELOPER_SETTING_KEYS.has(item.key)).length;
    const active = categoryIndex === activeAdvancedEditorSettingsCategoryIndex;
    return `<button type="button" role="tab" data-advanced-settings-nav="${categoryIndex}" class="${active ? 'is-active' : ''}" aria-selected="${active}" tabindex="${active ? '0' : '-1'}" onclick="selectAdvancedEditorSettingsCategory(${categoryIndex})" onkeydown="handleAdvancedEditorSettingsNavKeydown(event, ${categoryIndex})"><span class="advanced-editor-settings-nav-icon">${meta.icon}</span><span><strong>${category}</strong><small>${count} settings</small></span></button>`;
  }).join('');
  const sections = categories.map((category, categoryIndex) => {
    const meta = LM_EDITOR_ADVANCED_CATEGORY_META[category] || { description: '' };
    const items = LM_EDITOR_ADVANCED_SCHEMA.filter(item => item.category === category);
    const developerModeOn = activeAdvancedEditorDeveloperCategories.has(categoryIndex);
    const developerCount = items.filter(item => LM_EDITOR_DEVELOPER_SETTING_KEYS.has(item.key)).length;
    const settings = items.map(item => {
      const copy = lmEditorAdvancedCopy(item);
      const developerSetting = LM_EDITOR_DEVELOPER_SETTING_KEYS.has(item.key);
      return `<div class="advanced-editor-setting-item ${developerSetting ? 'is-developer-setting' : ''}" ${developerSetting ? `data-developer-setting${developerModeOn ? '' : ' hidden'}` : ''}><div class="advanced-editor-setting-copy"><label class="advanced-editor-setting-name" for="advancedEditorSetting-${item.key}"><strong>${copy.label}</strong><em>${item.unit}</em></label><p id="advancedEditorSettingDescription-${item.key}">${copy.work}</p></div><div class="advanced-editor-setting-control">${advancedEditorSettingControl(item, stored)}<button type="button" onclick="resetAdvancedEditorSetting('${item.key}')">Reset to ${item.value}</button></div><div class="advanced-editor-setting-info-wrap"><button class="advanced-editor-setting-info-button" type="button" aria-label="Show what changing ${copy.label} does" aria-expanded="false" onclick="toggleAdvancedEditorSettingInfo(event, '${item.key}')"><span aria-hidden="true">i</span></button><div class="advanced-editor-setting-info-popover" data-advanced-setting-info="${item.key}" role="tooltip" hidden><span><b>If increased</b>${copy.up}</span><span><b>If decreased</b>${copy.down}</span></div></div></div>`;
    }).join('');
    const developerToggle = developerCount ? `<button class="advanced-editor-developer-toggle ${developerModeOn ? 'is-active' : ''}" type="button" data-developer-settings-toggle aria-pressed="${developerModeOn}" onclick="toggleAdvancedEditorDeveloperSettings(${categoryIndex})"><span aria-hidden="true"></span><strong>Developer settings</strong><em>${developerModeOn ? 'On' : 'Off'}</em></button>` : '';
    return `<section class="advanced-editor-settings-section" data-advanced-settings-section="${categoryIndex}" ${categoryIndex === activeAdvancedEditorSettingsCategoryIndex ? '' : 'hidden'}><div class="advanced-editor-settings-section-head"><div><span>Advanced editor</span><h3>${category}</h3><p>${meta.description}</p></div><div class="advanced-editor-settings-section-tools"><strong>${items.length - developerCount}</strong>${developerToggle}</div></div><div class="advanced-editor-settings-list">${settings}</div></section>`;
  }).join('');
  modal.innerHTML = `<section class="advanced-editor-settings-card" role="dialog" aria-modal="true" aria-labelledby="advancedEditorSettingsTitle">
    <header class="advanced-editor-settings-header"><div><h2 id="advancedEditorSettingsTitle">Advanced settings</h2><p>Fine-tune editor behavior and performance.</p></div><button type="button" onclick="closeAdvancedEditorSettings()" aria-label="Close">&times;</button></header>
    <div class="advanced-editor-settings-shell"><aside class="advanced-editor-settings-nav" aria-label="Settings sections"><span class="advanced-editor-settings-nav-label">Settings</span>${navigation}<div class="advanced-editor-settings-nav-note">Changes apply after reload.</div></aside><main class="advanced-editor-settings-content" onscroll="closeAdvancedEditorSettingInfo()">${sections}</main></div>
  </section>`;
}

function advancedRuntimeSettingCopy(title, description, quickPin = null) {
  return `<span><span class="advanced-runtime-title-line"><strong>${title}</strong>${quickPin ? advancedQuickPinButton(quickPin.key, quickPin.label, { compact: true }) : ''}</span><p>${description}</p></span>`;
}

function decorateAdvancedEditorSettingsIcons() {
  const modal = document.getElementById('advancedEditorSettingsModal');
  if (!modal || typeof window.lmIcon !== 'function') return;
  const closeButton = modal.querySelector('.advanced-editor-settings-header > button');
  if (closeButton) closeButton.innerHTML = window.lmIcon('close', 'advanced-editor-settings-close-icon');
  modal.querySelectorAll('.advanced-editor-setting-info-button').forEach(button => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.innerHTML = window.lmIcon(open ? 'categoryInfoOpened' : 'categoryInfoClosed', 'advanced-editor-setting-info-icon');
  });
  modal.querySelectorAll('[data-lm-icon]').forEach(el => {
    const iconName = el.getAttribute('data-lm-icon');
    if (iconName) el.innerHTML = window.lmIcon(iconName);
  });
}

function advancedRuntimeToggle(key, title, description, checked, defaultValue = checked, quickPin = null) {
  return `<div class="advanced-runtime-setting-row" data-advanced-runtime-row-key="${key}">${advancedRuntimeSettingCopy(title, description, quickPin)}<label class="advanced-runtime-toggle" aria-label="${title}"><input type="checkbox" data-advanced-runtime-key="${key}" data-default-value="${String(defaultValue)}" ${checked ? 'checked' : ''}><i aria-hidden="true"></i></label></div>`;
}

function advancedRuntimeSelect(key, title, description, value, options, defaultValue = value, quickPin = null) {
  return `<div class="advanced-runtime-setting-row" data-advanced-runtime-row-key="${key}">${advancedRuntimeSettingCopy(title, description, quickPin)}<select aria-label="${title}" data-advanced-runtime-key="${key}" data-default-value="${defaultValue}">${options.map(option => `<option value="${option.value}" ${option.value === value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></div>`;
}

function advancedRuntimeNumber(key, title, description, value, min, max, step, unit, defaultValue = value, quickPin = null) {
  const input = `<input class="dock-fsize-inp advanced-number-input" type="number" aria-label="${title}" data-advanced-runtime-key="${key}" data-default-value="${defaultValue}" value="${value}" min="${min}" max="${max}" step="${step}">`;
  return `<div class="advanced-runtime-setting-row" data-advanced-runtime-row-key="${key}">${advancedRuntimeSettingCopy(title, description, quickPin)}<span class="advanced-runtime-number">${advancedNumberStepper(input, key, title)}<em aria-hidden="true">${unit}</em></span></div>`;
}

function advancedStoredPercent(key, fallback) {
  const parsed = parseFloat(localStorage.getItem(key) || '');
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : fallback;
}

function advancedFeatureSection(key, meta, body, countLabel = '', quickPins = [], extraTools = '') {
  const tools = `${countLabel ? `<strong class="advanced-feature-count">${countLabel}</strong>` : ''}${quickPins.map(pin => advancedQuickPinButton(pin.key, pin.label)).join('')}${extraTools}`;
  const sectionHead = key === 'advanced-word-editing'
    ? `<div class="advanced-editor-settings-section-head is-heading-only"><h3>${meta.label}</h3></div>`
    : `<div class="advanced-editor-settings-section-head"><div><span>Advanced editor</span><h3>${meta.label}</h3><p>${meta.description}</p></div>${tools ? `<div class="advanced-feature-head-tools">${tools}</div>` : ''}</div>`;
  return `<section class="advanced-editor-feature-section" data-advanced-top-section="${key}" ${key === activeAdvancedEditorSettingsTopSection ? '' : 'hidden'}>${sectionHead}${body}</section>`;
}

function renderAdvancedEditorSettings() {
  const modal = document.getElementById('advancedEditorSettingsModal');
  if (!modal) return;
  const stored = lmEditorAdvancedStored();
  const baseCategories = [...new Set(LM_EDITOR_ADVANCED_SCHEMA.map(item => item.category))];
  const categories = [...baseCategories, 'Project Cache & Storage'];
  activeAdvancedEditorSettingsCategoryIndex = Math.min(activeAdvancedEditorSettingsCategoryIndex, categories.length - 1);

  const navigation = LM_EDITOR_ADVANCED_TOP_SECTIONS.map(section => {
    const active = section.key === activeAdvancedEditorSettingsTopSection;
    return `<button type="button" role="tab" data-advanced-settings-nav="${section.key}" class="${active ? 'is-active' : ''}" aria-selected="${active}" tabindex="${active ? '0' : '-1'}" onclick="selectAdvancedEditorTopSection('${section.key}')" onkeydown="handleAdvancedEditorSettingsNavKeydown(event, ${LM_EDITOR_ADVANCED_TOP_SECTIONS.indexOf(section)})"><span class="advanced-editor-settings-nav-icon">${section.icon}</span><span><strong>${section.label}</strong><small>${section.note}</small></span></button>`;
  }).join('');

  const developerCategoryTabs = categories.map((category, categoryIndex) => {
    const active = categoryIndex === activeAdvancedEditorSettingsCategoryIndex;
    const count = category === 'Project Cache & Storage'
      ? 3
      : LM_EDITOR_ADVANCED_SCHEMA.filter(item => item.category === category).length;
    return `<button type="button" role="tab" data-advanced-developer-category="${categoryIndex}" class="${active ? 'is-active' : ''}" aria-selected="${active}" tabindex="${active ? '0' : '-1'}" onclick="selectAdvancedEditorSettingsCategory(${categoryIndex})"><strong>${category}</strong><small>${count}</small></button>`;
  }).join('');

  const developerSections = categories.map((category, categoryIndex) => {
    const isActive = categoryIndex === activeAdvancedEditorSettingsCategoryIndex;
    if (category === 'Project Cache & Storage') {
      return `<section class="advanced-developer-settings-section" data-advanced-developer-section="${categoryIndex}" ${isActive ? '' : 'hidden'}>
        <div class="advanced-developer-settings-copy">
          <h4>Project Cache & Storage Management</h4>
          <p>Manage and reset local browser caches (localStorage & IndexedDB) associated with the active project or studio workspace. Disk files (.json / .txt) remain completely untouched.</p>
        </div>
        <div class="advanced-runtime-settings-list" style="margin-top: 16px;">
          <div class="advanced-runtime-setting-row">
            <span>
              <strong>Reset Active Project Browser Cache</strong>
              <p>Clears temporary browser caches (active editor target, naming data cache, drafts cache) for the currently open project and re-syncs state fresh from disk files.</p>
            </span>
            <button type="button" class="is-danger" style="padding: 7px 14px; border: 1px solid var(--danger); border-radius: 8px; background: var(--danger); color: #fff; font-weight: 700; cursor: pointer;" onclick="runResetActiveProjectBrowserCache()">Clear Project Cache</button>
          </div>
          <div class="advanced-runtime-setting-row">
            <span>
              <strong>Reset Word Dictionary Browser Cache</strong>
              <p>Clears local browser fallback dictionary cache and re-loads replacement rules directly from Story_Word_Editing.json in the project folder.</p>
            </span>
            <button type="button" style="padding: 7px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); color: var(--ink); font-weight: 700; cursor: pointer;" onclick="runResetWordEditingBrowserCache()">Re-sync Word Dictionary</button>
          </div>
          <div class="advanced-runtime-setting-row">
            <span>
              <strong>Reset All Studio Browser Storage</strong>
              <p>Clears all browser localStorage keys and temporary IndexedDB storage for Lekhak Manch, restoring browser state to initial defaults.</p>
            </span>
            <button type="button" style="padding: 7px 14px; border: 1px solid var(--danger); border-radius: 8px; background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); font-weight: 700; cursor: pointer;" onclick="runResetAllStudioBrowserCaches()">Reset All Studio Caches</button>
          </div>
        </div>
      </section>`;
    }

    const items = LM_EDITOR_ADVANCED_SCHEMA.filter(item => item.category === category);
    const settings = items.map((item, idx) => {
      const copy = lmEditorAdvancedCopy(item);
      let subhead = '';
      if (category === 'Focus & auto-scroll') {
        if (item.key === 'focusIdleDelay') {
          subhead = `<div class="advanced-developer-subhead" style="grid-column: 1 / -1; margin-top: 4px; margin-bottom: 8px; font-weight: 700; color: var(--accent); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Focus Mode Settings</div>`;
        } else if (item.key === 'caretScrollSuppress') {
          subhead = `<div class="advanced-developer-subhead" style="grid-column: 1 / -1; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); margin-bottom: 8px; font-weight: 700; color: var(--accent); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">Auto-Scroll Developer Settings</div>`;
        }
      }
      return `${subhead}<div class="advanced-editor-setting-item"><div class="advanced-editor-setting-copy"><label class="advanced-editor-setting-name" for="advancedEditorSetting-${item.key}"><strong>${copy.label}</strong><em>${item.unit}</em></label><p id="advancedEditorSettingDescription-${item.key}">${copy.work}</p></div><div class="advanced-editor-setting-control">${advancedEditorSettingControl(item, stored)}<button type="button" onclick="resetAdvancedEditorSetting('${item.key}')">Reset to ${item.value}</button></div><div class="advanced-editor-setting-info-wrap"><button class="advanced-editor-setting-info-button" type="button" aria-label="Show what changing ${copy.label} does" aria-expanded="false" onclick="toggleAdvancedEditorSettingInfo(event, '${item.key}')"><span aria-hidden="true">i</span></button><div class="advanced-editor-setting-info-popover" data-advanced-setting-info="${item.key}" role="tooltip" hidden><span><b>If increased</b>${copy.up}</span><span><b>If decreased</b>${copy.down}</span></div></div></div>`;
    }).join('');

    return `<section class="advanced-developer-settings-section" data-advanced-developer-section="${categoryIndex}" ${isActive ? '' : 'hidden'}><div class="advanced-developer-settings-copy"><h4>${category}</h4></div><div class="advanced-editor-settings-list">${settings}</div></section>`;
  }).join('');

  const developerMeta = LM_EDITOR_ADVANCED_TOP_SECTIONS.find(section => section.key === 'developer');
  const developerBody = `<div class="advanced-developer-category-tabs" role="tablist" aria-label="Developer setting categories">${developerCategoryTabs}</div>${developerSections}`;

  const autoScrollMeta = LM_EDITOR_ADVANCED_TOP_SECTIONS.find(section => section.key === 'autoscroll');
  const focusTime = typeof currentEditorAutoScrollFocusTimeMs === 'function' ? currentEditorAutoScrollFocusTimeMs() : 320;
  const autoScrollBody = `<div class="advanced-runtime-settings-list">
    ${advancedRuntimeToggle('autoScrollEnabled', 'Follow the typing cursor', 'Automatically move the page when the cursor reaches the selected guide position.', Boolean(isEditorAutoScrollEnabled), true)}
    ${advancedRuntimeToggle('autoScrollEmptyOnly', 'Follow only on empty paragraphs', 'Move the page only when you type or place the cursor on an empty paragraph.', Boolean(isEditorAutoScrollEmptyParagraphOnly), false)}
    ${advancedRuntimeNumber('autoScrollFocusTime', 'Scroll movement duration', 'Time used to move the page smoothly to the cursor guide. Smaller values feel faster.', focusTime, 200, 5000, 10, 'ms', 320)}
    ${advancedRuntimeSelect('autoScrollMode', 'Cursor-following style', 'Use one depth guide or keep the cursor inside a top-and-bottom comfort band.', editorAutoScrollMode, [{ value: 'depth', label: 'Single depth marker' }, { value: 'band', label: 'Top / bottom comfort band' }], 'depth')}
    ${advancedRuntimeNumber('autoScrollDepth', 'Single-marker position', 'Vertical viewport position where the cursor is kept in single-marker mode.', advancedStoredPercent(EDITOR_AUTO_SCROLL_DEPTH_KEY, 72), 1, 100, 1, '%', 72)}
    ${advancedRuntimeNumber('autoScrollBandTop', 'Comfort-band top', 'Upper boundary of the cursor comfort area.', advancedStoredPercent(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, 14), 1, 99, 1, '%', 14)}
    ${advancedRuntimeNumber('autoScrollBandBottom', 'Comfort-band bottom', 'Lower boundary of the cursor comfort area.', advancedStoredPercent(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, 88), 2, 100, 1, '%', 88)}
  </div>`;

  const globalFmt = typeof getStoredOrRuntimeGlobalFormatting === 'function'
    ? getStoredOrRuntimeGlobalFormatting()
    : { globalLineSpacing: 0, globalParagraphGap: 1, globalFontSize: 16 };
  const initialSmartPasteLineSpacing = (smartPasteLineSpacing !== undefined && smartPasteLineSpacing !== null && smartPasteLineSpacing > 0)
    ? smartPasteLineSpacing
    : globalFmt.globalLineSpacing;
  const initialSmartPasteParagraphGap = (smartPasteParagraphGap !== undefined && smartPasteParagraphGap !== null && smartPasteParagraphGap > 0)
    ? smartPasteParagraphGap
    : globalFmt.globalParagraphGap;
  const initialSmartPasteFontSize = (smartPasteFontSize && smartPasteFontSize > 0)
    ? smartPasteFontSize
    : globalFmt.globalFontSize;

  const smartPasteMeta = LM_EDITOR_ADVANCED_TOP_SECTIONS.find(section => section.key === 'smart-paste');
  const smartPasteBody = `<div class="advanced-runtime-settings-list">
    ${advancedRuntimeToggle('smartPasteEnabled', 'Use Smart Paste', 'Apply your selected spacing and font rules to pasted text.', Boolean(isPasteSettingsEnabled), true)}
    ${advancedRuntimeNumber('smartPasteLineSpacing', 'Pasted line spacing', 'Line spacing applied to newly pasted paragraphs. Zero keeps the editor default.', initialSmartPasteLineSpacing, 0, 3, 0.1, 'line', 0)}
    ${advancedRuntimeNumber('smartPasteParagraphGap', 'Pasted paragraph gap', 'Blank-line gap inserted between pasted paragraphs.', initialSmartPasteParagraphGap, 0, 3, 1, 'lines', 1)}
    ${advancedRuntimeNumber('smartPasteFontSize', 'Pasted font size', 'Font size applied to pasted text. Zero keeps the editor default.', initialSmartPasteFontSize, 0, 36, 1, 'px', 16)}
  </div>`;
  const smartCopyMeta = LM_EDITOR_ADVANCED_TOP_SECTIONS.find(section => section.key === 'smart-copy');
  const smartCopyBody = `<div class="advanced-runtime-settings-list">
    ${advancedRuntimeToggle('smartCopyEnabled', 'Use Smart Copy', 'Copy editor text with the paragraph behavior selected below.', Boolean(isCopySettingsEnabled), true)}
    ${advancedRuntimeSelect('smartCopyMode', 'Copied paragraph style', 'Keep custom paragraph gaps or combine copied text into one paragraph.', copyParaMode, [{ value: 'gap', label: 'Keep custom gaps' }, { value: 'single', label: 'One paragraph' }], 'gap')}
    ${advancedRuntimeNumber('smartCopyGaps', 'Copied paragraph gap', 'Number of blank lines placed between copied paragraphs.', copyParagraphGaps, 0, 4, 1, 'lines', 1)}
  </div>`;

  const globalMeta = LM_EDITOR_ADVANCED_TOP_SECTIONS.find(section => section.key === 'global');
  const globalBody = `<div class="advanced-runtime-settings-list">
    ${advancedRuntimeSelect('globalAlignment', 'Global text alignment', 'Default alignment used by drafts, reading-mode chapters, and chapter-edit drafts.', lmEditorAdvancedString('globalAlignment', 'justify'), [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }, { value: 'justify', label: 'Justify' }], 'justify')}
    ${advancedRuntimeNumber('globalLineSpacing', 'Global line spacing', 'Default line spacing used by every editor document. Zero uses the editor base spacing.', lmEditorAdvancedNumber('globalLineSpacing', 0), 0, 3, 0.1, 'line', 0)}
    ${advancedRuntimeNumber('globalParagraphGap', 'Global paragraph gap', 'Default blank-line gap used between paragraphs in every editor mode.', lmEditorAdvancedNumber('globalParagraphGap', 1), 0, 3, 1, 'lines', 1)}
    ${advancedRuntimeNumber('reviewModeMargin', 'Review-mode paragraph margin', 'Paragraph spacing used while reading a locked chapter. This also becomes the default value shown by the floating writing tool in Review mode.', editorReviewModeMarginDefault(), 0, 120, 1, 'px', 0, { key: 'reviewMargin', label: 'Review Margin' })}
    ${advancedRuntimeSelect('globalFontFamily', 'Global font family', 'Default writing font used in drafts, chapter reading, and chapter editing.', lmEditorAdvancedString('globalFontFamily', EDITOR_FONT_FAMILIES[0]), [{ value: EDITOR_FONT_FAMILIES[0], label: 'Lora' }, { value: EDITOR_FONT_FAMILIES[1], label: 'Times New Roman' }, { value: EDITOR_FONT_FAMILIES[2], label: 'Kokila' }, { value: EDITOR_FONT_FAMILIES[3], label: 'Playfair Display' }, { value: EDITOR_FONT_FAMILIES[4], label: 'Georgia' }, { value: EDITOR_FONT_FAMILIES[5], label: 'Courier New' }], EDITOR_FONT_FAMILIES[0])}
    ${advancedRuntimeNumber('globalFontSize', 'Global font size', 'Default font size used across drafts and every chapter mode.', Math.max(10, lmEditorAdvancedNumber('globalFontSize', 16)), 10, 36, 1, 'px', 16)}
  </div><div class="advanced-runtime-action"><span><strong>Apply global text formatting now</strong><p>Update all existing drafts, chapters, and chapter-edit drafts with the defaults configured above.</p></span><button type="button" onclick="runAdvancedGlobalStyleApply()">Apply now</button></div>`;

  const findMeta = LM_EDITOR_ADVANCED_TOP_SECTIONS.find(section => section.key === 'find-replace');
  const findBody = `<div class="advanced-runtime-settings-list">
    ${advancedRuntimeSelect('findMode', 'Text matching method', 'Safe matches complete words, Raw matches exact typed text, and Deep uses the broadest story-aware matching.', editorFindMode, [{ value: 'safe', label: 'Safe — complete words' }, { value: 'raw', label: 'Raw — exact text' }, { value: 'deep', label: 'Deep — broad matching' }], 'safe')}
    ${advancedRuntimeSelect('replaceScope', 'Replace All scope', 'Choose whether Replace All changes every match or only matches before or after the current position.', editorReplaceScope, [{ value: 'all', label: 'All matches' }, { value: 'after', label: 'Matches after current position' }, { value: 'before', label: 'Matches before current position' }], 'all', { key: 'replace', label: 'Replace settings' })}
  </div>`;

  const wordEditingMeta = LM_EDITOR_ADVANCED_TOP_SECTIONS.find(section => section.key === 'advanced-word-editing');
  const wordEditingBody = typeof window.lmAdvancedWordEditing?.markup === 'function'
    ? window.lmAdvancedWordEditing.markup()
    : '<div class="advanced-word-editing-loading">Loading the word-editing workspace…</div>';

  const smartPasteSyncButton = `<button class="advanced-quick-pin-btn smart-paste-sync-btn" type="button" onclick="syncSmartPasteFromGlobalFormatting()" title="Sync values from Global Text Formatting" aria-label="Sync values from Global Text Formatting"><span class="smart-paste-sync-icon" data-lm-icon="refresh"></span><span>Sync Global Style</span></button>`;

  const sections = [
    advancedFeatureSection('developer', developerMeta, developerBody, `${LM_EDITOR_ADVANCED_SCHEMA.length} settings`),
    advancedFeatureSection('autoscroll', autoScrollMeta, autoScrollBody, '7 controls', [{ key: 'autoscroll', label: 'Auto-scroll' }]),
    advancedFeatureSection('smart-copy', smartCopyMeta, smartCopyBody, '3 controls', [{ key: 'smartCopy', label: 'Smart Copy' }]),
    advancedFeatureSection('smart-paste', smartPasteMeta, smartPasteBody, '4 controls', [{ key: 'smartPaste', label: 'Smart Paste' }], smartPasteSyncButton),
    advancedFeatureSection('global', globalMeta, globalBody, '8 controls'),
    advancedFeatureSection('find-replace', findMeta, findBody, '2 controls'),
    advancedFeatureSection('advanced-word-editing', wordEditingMeta, wordEditingBody)
  ].join('');

  modal.innerHTML = `<section class="advanced-editor-settings-card" role="dialog" aria-modal="true" aria-labelledby="advancedEditorSettingsTitle">
    <header class="advanced-editor-settings-header"><div><h2 id="advancedEditorSettingsTitle">Advanced settings</h2><p>Detailed controls for editor systems. Normal Editor Settings remain unchanged.</p></div><button type="button" onclick="closeAdvancedEditorSettings()" aria-label="Close">&times;</button></header>
    <div class="advanced-editor-settings-shell"><aside class="advanced-editor-settings-nav" aria-label="Advanced setting sections"><span class="advanced-editor-settings-nav-label">Advanced settings</span>${navigation}<div class="advanced-editor-settings-nav-note">Changes are saved from the action bar.</div></aside><main class="advanced-editor-settings-content" onscroll="closeAdvancedEditorSettingInfo()">${sections}</main></div>
    <footer class="advanced-settings-footer" data-advanced-settings-footer hidden><button class="advanced-settings-reset-all" type="button" onclick="resetAllAdvancedEditorSettings()">Reset all</button><button class="is-primary" type="button" onclick="saveAdvancedEditorSettings()">Save & Reload</button></footer>
  </section>`;
  attachAdvancedRuntimeQuickPin('findMode', 'find', 'Find settings');
  attachAdvancedRuntimeQuickPin('replaceScope', 'replace', 'Replace settings');
  syncAdvancedSmartCopyConditionalControls();
  syncAdvancedAutoScrollConditionalControls();
  decorateAdvancedEditorSettingsIcons();
  window.lmAdvancedWordEditing?.mount?.(modal);
}

let advancedEditorSettingsBaseline = {};

function captureAdvancedEditorSettingsBaseline() {
  advancedEditorSettingsBaseline = {};
  const modal = document.getElementById('advancedEditorSettingsModal');
  if (!modal) return;

  modal.querySelectorAll('[data-advanced-editor-key], [data-advanced-runtime-key]').forEach(input => {
    const key = input.dataset.advancedEditorKey || input.dataset.advancedRuntimeKey;
    if (!key) return;
    const value = input.type === 'checkbox' ? Boolean(input.checked) : String(input.value ?? '');
    advancedEditorSettingsBaseline[key] = value;
  });
}

function checkAdvancedEditorSettingsDirty() {
  const modal = document.getElementById('advancedEditorSettingsModal');
  const footer = document.querySelector('[data-advanced-settings-footer]');
  const saveBtn = footer?.querySelector('.is-primary');
  if (!modal || !footer || !saveBtn) return;

  const modifiedKeys = [];
  let isDeveloperModified = false;

  modal.querySelectorAll('[data-advanced-editor-key], [data-advanced-runtime-key]').forEach(input => {
    const key = input.dataset.advancedEditorKey || input.dataset.advancedRuntimeKey;
    if (!key) return;
    const currentValue = input.type === 'checkbox' ? Boolean(input.checked) : String(input.value ?? '');
    const baselineValue = advancedEditorSettingsBaseline[key];

    if (baselineValue !== undefined && String(currentValue) !== String(baselineValue)) {
      modifiedKeys.push(key);
      if (LM_EDITOR_DEVELOPER_SETTING_KEYS.has(key)) {
        isDeveloperModified = true;
      }
    }
  });

  if (modifiedKeys.length === 0) {
    footer.hidden = true;
    saveBtn.dataset.requiresReload = 'false';
  } else {
    footer.hidden = false;
    saveBtn.textContent = isDeveloperModified ? 'Save & reload' : 'Save';
    saveBtn.dataset.requiresReload = isDeveloperModified ? 'true' : 'false';
  }
}

function openAdvancedEditorSettings() {
  let modal = document.getElementById('advancedEditorSettingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'advancedEditorSettingsModal';
    modal.className = 'advanced-editor-settings-modal';
    modal.addEventListener('click', event => { if (event.target === modal) closeAdvancedEditorSettings(); });
    modal.addEventListener('input', event => {
      event.target?.classList?.remove('is-invalid');
      if (event.target?.matches?.('[data-advanced-editor-key], [data-advanced-runtime-key]')) checkAdvancedEditorSettingsDirty();
    });
    modal.addEventListener('change', event => {
      handleAdvancedRuntimeControlChange(event);
      if (event.target?.matches?.('[data-advanced-editor-key], [data-advanced-runtime-key]')) checkAdvancedEditorSettingsDirty();
    });
    document.body.appendChild(modal);
  }
  renderAdvancedEditorSettings();
  modal.hidden = false;
  document.body.classList.add('is-advanced-editor-settings-open');
  requestAnimationFrame(() => {
    if (typeof syncCustomSelects === 'function') syncCustomSelects(modal);
    captureAdvancedEditorSettingsBaseline();
    checkAdvancedEditorSettingsDirty();
  });
  if (typeof setEditorSettingsPanel === 'function') setEditorSettingsPanel(false);
}

function closeAdvancedEditorSettings() {
  closeAdvancedEditorSettingInfo();
  const modal = document.getElementById('advancedEditorSettingsModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('is-advanced-editor-settings-open');
}

function resetAdvancedEditorSetting(key) {
  const item = lmEditorAdvancedDefinition(key);
  const input = document.querySelector(`[data-advanced-editor-key="${key}"]`);
  if (item && input) {
    input.value = item.value;
    checkAdvancedEditorSettingsDirty();
  }
}

function setAdvancedEditorSettingsDirty(dirty = true) {
  checkAdvancedEditorSettingsDirty();
}

function resetAllAdvancedEditorSettings() {
  LM_EDITOR_ADVANCED_SCHEMA.forEach(item => {
    const input = document.querySelector(`[data-advanced-editor-key="${item.key}"]`);
    if (input) input.value = item.value;
  });
  document.querySelectorAll('[data-advanced-runtime-key]').forEach(input => {
    const defaultValue = input.dataset.defaultValue;
    if (input.type === 'checkbox') input.checked = defaultValue === 'true';
    else input.value = defaultValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  syncAdvancedSmartCopyConditionalControls();
  checkAdvancedEditorSettingsDirty();
}

function advancedRuntimeControl(key) {
  return document.querySelector(`[data-advanced-runtime-key="${key}"]`);
}

function advancedRuntimeControlValue(key) {
  const control = advancedRuntimeControl(key);
  return control?.type === 'checkbox' ? Boolean(control.checked) : control?.value;
}

function setAdvancedRuntimeControlValue(key, value) {
  const control = advancedRuntimeControl(key);
  if (!control) return;
  if (control.type === 'checkbox') control.checked = Boolean(value);
  else control.value = String(value ?? '');
}

function attachAdvancedRuntimeQuickPin(runtimeKey, pinKey, label) {
  const titleLine = document.querySelector(`[data-advanced-runtime-row-key="${runtimeKey}"] .advanced-runtime-title-line`);
  if (!titleLine || titleLine.querySelector(`[data-advanced-quick-pin="${pinKey}"]`)) return;
  titleLine.insertAdjacentHTML('beforeend', advancedQuickPinButton(pinKey, label, { compact: true }));
}

function syncAdvancedSmartCopyConditionalControls() {
  const customGapRow = document.querySelector('[data-advanced-runtime-row-key="smartCopyGaps"]');
  if (customGapRow) customGapRow.hidden = advancedRuntimeControlValue('smartCopyMode') !== 'gap';
}

function syncAdvancedAutoScrollConditionalControls() {
  const isBandMode = advancedRuntimeControlValue('autoScrollMode') === 'band';
  const depthRow = document.querySelector('[data-advanced-runtime-row-key="autoScrollDepth"]');
  const bandTopRow = document.querySelector('[data-advanced-runtime-row-key="autoScrollBandTop"]');
  const bandBottomRow = document.querySelector('[data-advanced-runtime-row-key="autoScrollBandBottom"]');

  if (depthRow) depthRow.hidden = isBandMode;
  if (bandTopRow) bandTopRow.hidden = !isBandMode;
  if (bandBottomRow) bandBottomRow.hidden = !isBandMode;
}

function syncAdvancedQuickControlsFromRuntime() {
  if (!document.getElementById('advancedEditorSettingsModal') || document.getElementById('advancedEditorSettingsModal').hidden) return;
  setAdvancedRuntimeControlValue('autoScrollEnabled', isEditorAutoScrollEnabled);
  setAdvancedRuntimeControlValue('autoScrollMode', editorAutoScrollMode);
  setAdvancedRuntimeControlValue('autoScrollEmptyOnly', isEditorAutoScrollEmptyParagraphOnly);
  if (typeof currentEditorAutoScrollFocusTimeMs === 'function') setAdvancedRuntimeControlValue('autoScrollFocusTime', currentEditorAutoScrollFocusTimeMs());
  setAdvancedRuntimeControlValue('autoScrollDepth', advancedStoredPercent(EDITOR_AUTO_SCROLL_DEPTH_KEY, 72));
  setAdvancedRuntimeControlValue('autoScrollBandTop', advancedStoredPercent(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, 34));
  setAdvancedRuntimeControlValue('autoScrollBandBottom', advancedStoredPercent(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, 78));
  setAdvancedRuntimeControlValue('smartPasteEnabled', isPasteSettingsEnabled);
  setAdvancedRuntimeControlValue('smartPasteLineSpacing', smartPasteLineSpacing);
  setAdvancedRuntimeControlValue('smartPasteParagraphGap', smartPasteParagraphGap);
  setAdvancedRuntimeControlValue('smartPasteFontSize', smartPasteFontSize);
  setAdvancedRuntimeControlValue('smartCopyEnabled', isCopySettingsEnabled);
  setAdvancedRuntimeControlValue('smartCopyMode', copyParaMode);
  setAdvancedRuntimeControlValue('smartCopyGaps', copyParagraphGaps);
  setAdvancedRuntimeControlValue('globalAutoApply', smartPasteAutoApply);
  setAdvancedRuntimeControlValue('reviewModeMargin', editorReviewModeMarginDefault());
  setAdvancedRuntimeControlValue('findMode', editorFindMode);
  setAdvancedRuntimeControlValue('replaceScope', editorReplaceScope);
  syncAdvancedSmartCopyConditionalControls();
  syncAdvancedAutoScrollConditionalControls();
  if (typeof syncCustomSelects === 'function') syncCustomSelects(document.getElementById('advancedEditorSettingsModal'));
}

function handleAdvancedRuntimeControlChange(event) {
  const control = event.target?.closest?.('[data-advanced-runtime-key]');
  if (!control) return;
  const key = control.dataset.advancedRuntimeKey;
  const value = control.type === 'checkbox' ? Boolean(control.checked) : control.value;
  control.classList.remove('is-invalid');

  if (key === 'smartCopyMode') {
    copyParaMode = value === 'single' ? 'single' : 'gap';
    syncAdvancedSmartCopyConditionalControls();
  } else if (key === 'smartCopyGaps') copyParagraphGaps = Math.max(0, Math.min(4, Math.round(Number(value) || 0)));
  else if (key === 'smartCopyEnabled') isCopySettingsEnabled = Boolean(value);
  else if (key === 'smartPasteEnabled') isPasteSettingsEnabled = Boolean(value);
  else if (key === 'smartPasteLineSpacing') smartPasteLineSpacing = Math.max(0, Math.min(3, Number(value) || 0));
  else if (key === 'smartPasteParagraphGap') smartPasteParagraphGap = Math.max(0, Math.min(3, Math.round(Number(value) || 0)));
  else if (key === 'smartPasteFontSize') smartPasteFontSize = Math.max(0, Math.min(36, Math.round(Number(value) || 0)));
  else if (key === 'globalAutoApply') {
    smartPasteAutoApply = Boolean(value);
    if (smartPasteAutoApply && typeof scheduleSmartPasteAutoApply === 'function') scheduleSmartPasteAutoApply();
    else if (typeof smartPasteAutoApplyTimer !== 'undefined') clearTimeout(smartPasteAutoApplyTimer);
  } else if (key === 'reviewModeMargin') {
    const margin = typeof setEditorReviewModeMarginDefault === 'function' ? setEditorReviewModeMarginDefault(value) : Number(value) || 0;
    if (typeof isEditorReviewMode === 'function' && isEditorReviewMode(document.getElementById('editor')) && typeof applyEditorSpacing === 'function') {
      const doc = typeof activeEditorDocument === 'function' ? activeEditorDocument() : null;
      applyEditorSpacing(doc?.lineHeight, doc?.paragraphGap, margin, { applyParagraphGap: false });
    }
  } else if (key === 'findMode') {
    editorFindMode = typeof normalizeEditorFindMode === 'function' ? normalizeEditorFindMode(value) : value;
    if (typeof saveEditorSettings === 'function') saveEditorSettings();
    if (typeof doFind === 'function' && typeof isFindOpen !== 'undefined' && isFindOpen && document.getElementById('findInp')?.value) doFind();
  }
  else if (key === 'replaceScope' && typeof setEditorReplaceScope === 'function') setEditorReplaceScope(value);
  else if (key === 'autoScrollEnabled') {
    isEditorAutoScrollEnabled = Boolean(value);
    if (typeof saveEditorSettings === 'function') saveEditorSettings();
  } else if (key === 'autoScrollMode') {
    if (typeof setEditorAutoScrollMode === 'function') setEditorAutoScrollMode(value, { enable: false });
    syncAdvancedAutoScrollConditionalControls();
  }
  else if (key === 'autoScrollEmptyOnly') {
    isEditorAutoScrollEmptyParagraphOnly = Boolean(value);
    if (typeof saveEditorSettings === 'function') saveEditorSettings();
  } else if (key === 'autoScrollFocusTime' && typeof setEditorAutoScrollFocusTime === 'function') setEditorAutoScrollFocusTime(value);
  else if (key === 'autoScrollDepth') localStorage.setItem(EDITOR_AUTO_SCROLL_DEPTH_KEY, `${Math.max(1, Math.min(100, Number(value) || 72))}%`);
  else if (key === 'autoScrollBandTop') localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, `${Math.max(1, Math.min(99, Number(value) || 34))}%`);
  else if (key === 'autoScrollBandBottom') localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, `${Math.max(2, Math.min(100, Number(value) || 78))}%`);

  if (key.startsWith('smartCopy') || key.startsWith('smartPaste') || key === 'globalAutoApply') {
    if (typeof savePasteCopySettings === 'function') savePasteCopySettings();
  }
  if (typeof updateEditorSettingsUI === 'function') updateEditorSettingsUI();
  if (key.startsWith('autoScroll') && typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
}

function focusInvalidAdvancedRuntimeControl(key, sectionKey, message) {
  selectAdvancedEditorTopSection(sectionKey);
  const control = advancedRuntimeControl(key);
  control?.classList.add('is-invalid');
  control?.focus();
  if (typeof showMiniReminder === 'function') showMiniReminder(message);
}

function syncAdvancedClipboardValuesFromPanel() {
  isPasteSettingsEnabled = Boolean(advancedRuntimeControlValue('smartPasteEnabled'));
  isCopySettingsEnabled = Boolean(advancedRuntimeControlValue('smartCopyEnabled'));
  smartPasteLineSpacing = Math.max(0, Math.min(3, Number(advancedRuntimeControlValue('smartPasteLineSpacing')) || 0));
  smartPasteParagraphGap = Math.max(0, Math.min(3, Math.round(Number(advancedRuntimeControlValue('smartPasteParagraphGap')) || 0)));
  smartPasteFontSize = Math.max(0, Math.min(36, Math.round(Number(advancedRuntimeControlValue('smartPasteFontSize')) || 0)));
  copyParaMode = advancedRuntimeControlValue('smartCopyMode') === 'single' ? 'single' : 'gap';
  copyParagraphGaps = Math.max(0, Math.min(4, Math.round(Number(advancedRuntimeControlValue('smartCopyGaps')) || 0)));
  smartPasteAutoApply = false;
  if (typeof savePasteCopySettings === 'function') savePasteCopySettings();
}

function syncSmartPasteFromGlobalFormatting() {
  const globalFmt = typeof getStoredOrRuntimeGlobalFormatting === 'function'
    ? getStoredOrRuntimeGlobalFormatting()
    : { globalLineSpacing: 0, globalParagraphGap: 1, globalFontSize: 16 };

  smartPasteLineSpacing = globalFmt.globalLineSpacing;
  smartPasteParagraphGap = globalFmt.globalParagraphGap;
  smartPasteFontSize = globalFmt.globalFontSize;

  setAdvancedRuntimeControlValue('smartPasteLineSpacing', smartPasteLineSpacing);
  setAdvancedRuntimeControlValue('smartPasteParagraphGap', smartPasteParagraphGap);
  setAdvancedRuntimeControlValue('smartPasteFontSize', smartPasteFontSize);

  if (typeof savePasteCopySettings === 'function') savePasteCopySettings();
  if (typeof setAdvancedEditorSettingsDirty === 'function') setAdvancedEditorSettingsDirty(true);

  if (typeof showMiniReminder === 'function') {
    showMiniReminder('Smart Paste settings synced from Global Text Formatting.');
  }
}

function getStoredOrRuntimeGlobalFormatting() {
  const stored = lmEditorAdvancedStored();
  const modal = document.getElementById('advancedEditorSettingsModal');
  const isModalOpen = modal && !modal.hidden;

  const alignmentCtrl = isModalOpen ? advancedRuntimeControl('globalAlignment') : null;
  const lineSpacingCtrl = isModalOpen ? advancedRuntimeControl('globalLineSpacing') : null;
  const paragraphGapCtrl = isModalOpen ? advancedRuntimeControl('globalParagraphGap') : null;
  const reviewMarginCtrl = isModalOpen ? advancedRuntimeControl('reviewModeMargin') : null;
  const fontFamilyCtrl = isModalOpen ? advancedRuntimeControl('globalFontFamily') : null;
  const fontSizeCtrl = isModalOpen ? advancedRuntimeControl('globalFontSize') : null;

  const alignment = alignmentCtrl ? alignmentCtrl.value : (stored.globalAlignment || stored.alignment || 'justify');
  const rawLineSpacing = lineSpacingCtrl ? Number(lineSpacingCtrl.value) : Number(stored.globalLineSpacing ?? stored.lineHeight ?? 0);
  const rawParagraphGap = paragraphGapCtrl ? Number(paragraphGapCtrl.value) : Number(stored.globalParagraphGap ?? stored.paragraphGap ?? 1);
  const rawReviewMargin = reviewMarginCtrl ? Number(reviewMarginCtrl.value) : Number(stored.reviewModeMargin ?? stored.reviewMargin ?? 0);
  const fontFamily = fontFamilyCtrl ? fontFamilyCtrl.value : (stored.globalFontFamily || stored.fontFamily || EDITOR_FONT_FAMILIES[0]);
  const rawFontSize = fontSizeCtrl ? Number(fontSizeCtrl.value) : Number(stored.globalFontSize ?? stored.fontSize ?? 16);

  return {
    globalAlignment: ['left', 'center', 'right', 'justify'].includes(alignment) ? alignment : 'justify',
    globalLineSpacing: Number.isFinite(rawLineSpacing) && rawLineSpacing >= 0 ? rawLineSpacing : 0,
    globalParagraphGap: Number.isFinite(rawParagraphGap) && rawParagraphGap >= 0 ? Math.round(rawParagraphGap) : 1,
    reviewModeMargin: Number.isFinite(rawReviewMargin) && rawReviewMargin >= 0 ? Math.round(rawReviewMargin) : 0,
    globalFontFamily: EDITOR_FONT_FAMILIES.includes(fontFamily) ? fontFamily : EDITOR_FONT_FAMILIES[0],
    globalFontSize: Number.isFinite(rawFontSize) && rawFontSize >= 10 ? Math.round(rawFontSize) : 16
  };
}

function storeAdvancedGlobalControls(next = lmEditorAdvancedStored()) {
  const current = getStoredOrRuntimeGlobalFormatting();
  next.globalAlignment = current.globalAlignment;
  next.globalLineSpacing = current.globalLineSpacing;
  next.globalParagraphGap = current.globalParagraphGap;
  delete next.globalParagraphMargin;
  next.reviewModeMargin = current.reviewModeMargin;
  next.globalFontFamily = current.globalFontFamily;
  next.globalFontSize = current.globalFontSize;

  if (typeof projectManifest !== 'undefined' && projectManifest) {
    projectManifest.globalTextFormatting = {
      globalFontSize: next.globalFontSize,
      globalLineSpacing: next.globalLineSpacing,
      globalParagraphGap: next.globalParagraphGap,
      reviewModeMargin: next.reviewModeMargin,
      globalAlignment: next.globalAlignment,
      globalFontFamily: next.globalFontFamily
    };
    if (typeof persistProjectManifestSnapshot === 'function') persistProjectManifestSnapshot();
  }

  localStorage.setItem(LM_EDITOR_ADVANCED_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

async function runAdvancedGlobalStyleApply() {
  storeAdvancedGlobalControls();
  const button = document.activeElement?.closest?.('.advanced-runtime-action button');
  if (button) button.disabled = true;
  try {
    if (typeof applySmartPasteStylesGlobally === 'function') await applySmartPasteStylesGlobally();
  } finally {
    if (button) button.disabled = false;
  }
}



function saveAdvancedEditorSettings() {
  const next = {};
  for (const item of LM_EDITOR_ADVANCED_SCHEMA) {
    const input = document.querySelector(`[data-advanced-editor-key="${item.key}"]`);
    const value = Number(input?.value);
    if (!Number.isFinite(value) || value < item.min || value > item.max) { revealAdvancedEditorSetting(item.key); input?.focus(); input?.classList.add('is-invalid'); return; }
    next[item.key] = value;
  }
  const invalidKey = next.focusWidthMin > next.focusWidthMax
    ? 'focusWidthMin'
    : next.focusWidthDefault < next.focusWidthMin || next.focusWidthDefault > next.focusWidthMax
      ? 'focusWidthDefault'
      : next.virtualWindowSize > next.workerWindowMaximum
        ? 'virtualWindowSize'
        : next.importMinimumWords > next.importDefaultWords || next.importDefaultWords > next.importMaximumWords
          ? 'importDefaultWords'
          : '';
  if (invalidKey) {
    const input = document.querySelector(`[data-advanced-editor-key="${invalidKey}"]`);
    revealAdvancedEditorSetting(invalidKey);
    input?.classList.add('is-invalid');
    input?.focus();
    if (typeof showMiniReminder === 'function') showMiniReminder('Related minimum, default and maximum values are inconsistent.');
    return;
  }

  const autoScrollDepth = Number(advancedRuntimeControlValue('autoScrollDepth'));
  const bandTop = Number(advancedRuntimeControlValue('autoScrollBandTop'));
  const bandBottom = Number(advancedRuntimeControlValue('autoScrollBandBottom'));
  const focusTime = Number(advancedRuntimeControlValue('autoScrollFocusTime'));
  if (!Number.isFinite(focusTime) || focusTime < 200 || focusTime > 5000) {
    focusInvalidAdvancedRuntimeControl('autoScrollFocusTime', 'autoscroll', 'Scroll duration must be between 200 and 5000 ms.');
    return;
  }
  if (!Number.isFinite(autoScrollDepth) || autoScrollDepth < 1 || autoScrollDepth > 100) {
    focusInvalidAdvancedRuntimeControl('autoScrollDepth', 'autoscroll', 'Single-marker position must be between 1% and 100%.');
    return;
  }
  if (!Number.isFinite(bandTop) || !Number.isFinite(bandBottom) || bandTop >= bandBottom) {
    focusInvalidAdvancedRuntimeControl('autoScrollBandTop', 'autoscroll', 'The comfort-band top must stay above its bottom boundary.');
    return;
  }
  const globalLineSpacing = Number(advancedRuntimeControlValue('globalLineSpacing'));
  const globalParagraphGap = Number(advancedRuntimeControlValue('globalParagraphGap'));
  const reviewModeMargin = Number(advancedRuntimeControlValue('reviewModeMargin'));
  const globalFontSize = Number(advancedRuntimeControlValue('globalFontSize'));
  if (!Number.isFinite(globalLineSpacing) || globalLineSpacing < 0 || globalLineSpacing > 3) {
    focusInvalidAdvancedRuntimeControl('globalLineSpacing', 'global', 'Global line spacing must be between 0 and 3.');
    return;
  }
  if (!Number.isFinite(globalParagraphGap) || globalParagraphGap < 0 || globalParagraphGap > 3) {
    focusInvalidAdvancedRuntimeControl('globalParagraphGap', 'global', 'Global paragraph gap must be between 0 and 3.');
    return;
  }
  if (!Number.isFinite(reviewModeMargin) || reviewModeMargin < 0 || reviewModeMargin > 120) {
    focusInvalidAdvancedRuntimeControl('reviewModeMargin', 'global', 'Review-mode margin must be between 0 and 120 px.');
    return;
  }
  if (!Number.isFinite(globalFontSize) || globalFontSize < 10 || globalFontSize > 36) {
    focusInvalidAdvancedRuntimeControl('globalFontSize', 'global', 'Global font size must be between 10 and 36 px.');
    return;
  }
  next.globalAlignment = ['left', 'center', 'right', 'justify'].includes(advancedRuntimeControlValue('globalAlignment')) ? advancedRuntimeControlValue('globalAlignment') : 'justify';
  next.globalLineSpacing = globalLineSpacing;
  next.globalParagraphGap = Number.isFinite(globalParagraphGap) ? Math.round(globalParagraphGap) : 1;
  next.reviewModeMargin = Math.round(reviewModeMargin);
  next.globalFontFamily = EDITOR_FONT_FAMILIES.includes(advancedRuntimeControlValue('globalFontFamily')) ? advancedRuntimeControlValue('globalFontFamily') : EDITOR_FONT_FAMILIES[0];
  next.globalFontSize = Math.round(globalFontSize);

  if (typeof projectManifest !== 'undefined' && projectManifest) {
    projectManifest.globalTextFormatting = {
      globalFontSize: next.globalFontSize,
      globalLineSpacing: next.globalLineSpacing,
      globalParagraphGap: next.globalParagraphGap,
      reviewModeMargin: next.reviewModeMargin,
      globalAlignment: next.globalAlignment,
      globalFontFamily: next.globalFontFamily
    };
    if (typeof persistProjectManifestSnapshot === 'function') persistProjectManifestSnapshot();
  }

  localStorage.setItem(LM_EDITOR_ADVANCED_SETTINGS_KEY, JSON.stringify(next));

  isEditorAutoScrollEnabled = Boolean(advancedRuntimeControlValue('autoScrollEnabled'));
  editorAutoScrollMode = advancedRuntimeControlValue('autoScrollMode') === 'band' ? 'band' : 'depth';
  isEditorAutoScrollEmptyParagraphOnly = Boolean(advancedRuntimeControlValue('autoScrollEmptyOnly'));
  editorFindMode = ['safe', 'raw', 'deep'].includes(advancedRuntimeControlValue('findMode')) ? advancedRuntimeControlValue('findMode') : 'safe';
  editorReplaceScope = ['all', 'after', 'before'].includes(advancedRuntimeControlValue('replaceScope')) ? advancedRuntimeControlValue('replaceScope') : 'all';
  localStorage.setItem(EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY, String(Math.round(focusTime)));
  localStorage.setItem(EDITOR_AUTO_SCROLL_DEPTH_KEY, `${autoScrollDepth}%`);
  localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, `${bandTop}%`);
  localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, `${bandBottom}%`);
  if (typeof saveEditorSettings === 'function') saveEditorSettings();
  syncAdvancedClipboardValuesFromPanel();
  if (typeof persistProjectManifestSnapshot === 'function') persistProjectManifestSnapshot();
  if (typeof applyAutoScrollCssVariablesFromSettings === 'function') applyAutoScrollCssVariablesFromSettings();
  if (typeof updateEditorSettingsUI === 'function') updateEditorSettingsUI();
  if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
  const saveBtn = document.querySelector('[data-advanced-settings-footer] .is-primary');
  const requiresReload = saveBtn?.dataset.requiresReload === 'true';

  if (typeof saveToStorage === 'function') saveToStorage(true);

  if (requiresReload) {
    location.reload();
    return;
  }

  captureAdvancedEditorSettingsBaseline();
  checkAdvancedEditorSettingsDirty();
  if (typeof showEditorToast === 'function') {
    showEditorToast('Advanced settings saved successfully', 'success');
  } else if (typeof showMiniReminder === 'function') {
    showMiniReminder('Advanced settings saved successfully.');
  }
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || document.getElementById('advancedEditorSettingsModal')?.hidden) return;
  const openInfo = document.querySelector('[data-advanced-setting-info]:not([hidden])');
  if (openInfo) closeAdvancedEditorSettingInfo();
  else closeAdvancedEditorSettings();
});
document.addEventListener('click', () => closeAdvancedEditorSettingInfo());

function ensureAdvancedSettingsDecisionPanel() {
  let panel = document.getElementById('advancedSettingsDecisionPanel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'advancedSettingsDecisionPanel';
  panel.className = 'advanced-settings-decision-backdrop';
  panel.hidden = true;
  panel.innerHTML = `<section class="advanced-settings-decision-card" role="alertdialog" aria-modal="true" aria-labelledby="advancedSettingsDecisionTitle" aria-describedby="advancedSettingsDecisionMessage"><div class="advanced-settings-decision-icon" aria-hidden="true">!</div><div><h3 id="advancedSettingsDecisionTitle"></h3><p id="advancedSettingsDecisionMessage"></p></div><div class="advanced-settings-decision-actions" data-advanced-settings-decision-actions></div></section>`;
  document.body.appendChild(panel);
  return panel;
}

function requestAdvancedSettingsDecision(options = {}) {
  const panel = ensureAdvancedSettingsDecisionPanel();
  const title = panel.querySelector('#advancedSettingsDecisionTitle');
  const message = panel.querySelector('#advancedSettingsDecisionMessage');
  const actions = panel.querySelector('[data-advanced-settings-decision-actions]');
  title.textContent = options.title || 'Please confirm';
  message.textContent = options.message || '';
  actions.innerHTML = '';
  const choices = Array.isArray(options.actions) && options.actions.length
    ? options.actions
    : [{ value: 'cancel', label: 'Cancel' }, { value: 'confirm', label: 'Confirm', tone: 'danger' }];
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      panel.hidden = true;
      panel.removeEventListener('click', handleBackdrop);
      document.removeEventListener('keydown', handleEscape, true);
      resolve(value);
    };
    const handleBackdrop = event => { if (event.target === panel) finish(options.dismissValue ?? null); };
    const handleEscape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(options.dismissValue ?? null);
    };
    choices.forEach(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      if (choice.tone) button.classList.add(`is-${choice.tone}`);
      button.addEventListener('click', () => finish(choice.value));
      actions.appendChild(button);
    });
    panel.addEventListener('click', handleBackdrop);
    document.addEventListener('keydown', handleEscape, true);
    panel.hidden = false;
    window.setTimeout(() => actions.querySelector('button')?.focus(), 20);
  });
}

function notifyAdvancedSettings(message, tone = 'success') {
  if (typeof showEditorToast === 'function') showEditorToast(message, tone);
  else if (typeof showMiniReminder === 'function') showMiniReminder(message);
}

window.runResetActiveProjectBrowserCache = async function runResetActiveProjectBrowserCache() {
  const confirmed = await requestAdvancedSettingsDecision({ title: 'Reset project browser cache?', message: 'Disk पर रखी project files (JSON/TXT) सुरक्षित रहेंगी और browser data files से दोबारा sync होगा।', actions: [{ value: false, label: 'Cancel' }, { value: true, label: 'Reset Cache', tone: 'danger' }] });
  if (!confirmed) return;

  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('lm_active_editor_state:') ||
        key.startsWith('lm_project_details_cache_') ||
        key === 'lm_naming_data' ||
        key === 'lm_chapter_drafts' ||
        key === 'lm_trash_drafts' ||
        key === 'lm_chapter_edit_drafts' ||
        key === 'lm_story_facts'
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    if (typeof readDraftsDataFromProject === 'function') {
      readDraftsDataFromProject().catch(() => {});
    }
    if (typeof readNamingDataFromProject === 'function') {
      readNamingDataFromProject().catch(() => {});
    }
    if (typeof readWordEditingDataFromProject === 'function') {
      readWordEditingDataFromProject().catch(() => {});
    }
    notifyAdvancedSettings('Project browser cache reset & re-synced from disk files', 'success');
  } catch (err) {
    console.error('Error resetting project browser cache:', err);
    notifyAdvancedSettings('कैश रीसेट के दौरान एक त्रुटि हुई: ' + err.message, 'error');
  }
};

window.runResetWordEditingBrowserCache = async function runResetWordEditingBrowserCache() {
  const confirmed = await requestAdvancedSettingsDecision({ title: 'Reset word dictionary cache?', message: 'Story_Word_Editing.json से replacement rules दोबारा load किए जाएंगे।', actions: [{ value: false, label: 'Cancel' }, { value: true, label: 'Re-sync Dictionary', tone: 'danger' }] });
  if (!confirmed) return;

  try {
    localStorage.removeItem('lm_advanced_word_editing_dictionary_v1');
    if (window.indexedDB) {
      try { window.indexedDB.deleteDatabase('lm-advanced-word-editing'); } catch { /* Ignore */ }
    }
    if (typeof readWordEditingDataFromProject === 'function') {
      readWordEditingDataFromProject().catch(() => {});
    }
    notifyAdvancedSettings('Word Editing dictionary cache cleared & re-synced', 'success');
  } catch (err) {
    console.error('Error resetting word editing cache:', err);
    notifyAdvancedSettings('त्रुटि: ' + err.message, 'error');
  }
};

window.runResetAllStudioBrowserCaches = async function runResetAllStudioBrowserCaches() {
  const confirmed = await requestAdvancedSettingsDecision({ title: 'Reset all studio browser storage?', message: 'सभी Lekhak Manch browser settings और caches हटेंगे। Disk files सुरक्षित रहेंगी और page refresh होगा।', actions: [{ value: false, label: 'Cancel' }, { value: true, label: 'Reset Everything', tone: 'danger' }] });
  if (!confirmed) return;

  try {
    const lmKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('lm_') || key.startsWith('lm-'))) {
        lmKeys.push(key);
      }
    }
    lmKeys.forEach(k => localStorage.removeItem(k));
    location.reload();
  } catch (err) {
    console.error('Error resetting all studio caches:', err);
    notifyAdvancedSettings('त्रुटि: ' + err.message, 'error');
  }
};

window.requestAdvancedSettingsDecision = requestAdvancedSettingsDecision;
window.notifyAdvancedSettings = notifyAdvancedSettings;

window.LM_EDITOR_ADVANCED_SCHEMA = LM_EDITOR_ADVANCED_SCHEMA;
window.lmEditorAdvancedNumber = lmEditorAdvancedNumber;
window.lmEditorAdvancedBoolean = lmEditorAdvancedBoolean;
window.lmEditorAdvancedString = lmEditorAdvancedString;
window.editorReviewModeMarginDefault = editorReviewModeMarginDefault;
window.setEditorReviewModeMarginDefault = setEditorReviewModeMarginDefault;
window.editorQuickSettingsPins = editorQuickSettingsPins;
window.isEditorQuickSettingPinned = isEditorQuickSettingPinned;
window.toggleEditorQuickSettingPin = toggleEditorQuickSettingPin;
window.selectAdvancedEditorSettingsCategory = selectAdvancedEditorSettingsCategory;
window.selectAdvancedEditorTopSection = selectAdvancedEditorTopSection;
window.handleAdvancedEditorSettingsNavKeydown = handleAdvancedEditorSettingsNavKeydown;
window.toggleAdvancedEditorSettingInfo = toggleAdvancedEditorSettingInfo;
window.closeAdvancedEditorSettingInfo = closeAdvancedEditorSettingInfo;
window.runAdvancedGlobalStyleApply = runAdvancedGlobalStyleApply;
window.syncSmartPasteFromGlobalFormatting = syncSmartPasteFromGlobalFormatting;
window.stepAdvancedNumberInput = stepAdvancedNumberInput;
window.openAdvancedEditorSettings = openAdvancedEditorSettings;
window.closeAdvancedEditorSettings = closeAdvancedEditorSettings;
window.resetAdvancedEditorSetting = resetAdvancedEditorSetting;
window.resetAllAdvancedEditorSettings = resetAllAdvancedEditorSettings;
window.saveAdvancedEditorSettings = saveAdvancedEditorSettings;
