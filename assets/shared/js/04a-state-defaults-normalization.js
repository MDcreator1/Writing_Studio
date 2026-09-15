const translations = {
  en: {
    locale: 'en-US',
    title: 'Lekhak Manch \u2014 Novel Writing Editor',
    brand: 'Lekhak Manch',
    fontHindi: 'Kokila (Hindi)',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    alignJustify: 'Justify',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    fontSize: 'Font Size',
    openProjectTitle: 'Open Workspace Folder',
    saveChapterTitle: 'Save',
    storyProject: 'Story Project',
    storyInfoTitle: 'Information',
    storyInfoDetailsTitle: 'Details',
    storyInfoKicker: 'Manifest',
    storyInfoEdit: 'Edit details',
    storyInfoStopEdit: 'Stop editing',
    storyInfoLastSaved: 'Last Edit',
    storyInfoCreated: 'Created',
    storySynopsisEmpty: 'No synopsis or notes added yet.',
    storyTitleLabel: 'Title',
    storyTypeLabel: 'Type',
    storyAuthorLabel: 'Author',
    storyLanguageLabel: 'Language',
    storySynopsisLabel: 'Synopsis / Notes',
    storyTypeNovel: 'Novel',
    storyTypeStory: 'Story',
    storyTypeNews: 'News Article',
    storyInfoSave: 'Save Info',
    storyInfoCancel: 'Cancel',
    storyInfoSaved: 'Story info saved',
    storyDelete: 'Delete Story',
    storyDeleteConfirmTitle: 'Delete this story?',
    storyDeleteConfirmBody: 'This will permanently remove this story folder from the workspace.',
    storyDeleted: 'Story deleted',
    storyDeleting: 'Deleting story...',
    untitledStory: 'Untitled Story',
    unknownAuthor: 'Unknown author',
    parts: 'Parts',
    partPrefix: 'Part',
    addPart: '+ New Part',
    editPart: 'Edit part',
    partDetails: 'Part Details',
    partCreated: 'Created',
    partStatus: 'Status',
    partSummary: 'Summary / Description',
    partDelete: 'Delete Empty Part',
    partEmptyStatus: 'Empty part',
    partActiveStatus: 'Active part',
    partDraftStatus: 'Draft part',
    partDeleted: 'Part deleted',
    partDeletedKeepChapters: 'Part deleted; chapters kept',
    addChapterToPart: '+ Chapter',
    partInfoTitle: 'Part Information',
    partInfoKicker: 'Part',
    partTitleLabel: 'Part title',
    partNumberLabel: 'Part number',
    partSynopsisLabel: 'Part notes / synopsis',
    partInfoSave: 'Save Info',
    partInfoCancel: 'Cancel',
    partInfoSaved: 'Part info saved',
    partDeleteKeepChapters: 'Delete Part Only',
    duplicatePartTitle: 'A part with this title already exists.',
    noChaptersInPart: 'No chapters in this part',
    noSavedChapters: 'No chapters saved yet',
    chapterDetails: 'Chapter Details',
    chapterCreated: 'Created',
    chapterPartLabel: 'Part',
    chapterPathLabel: 'File Path',
    chapterTitleLabel: 'Chapter title',
    chapterActiveStatus: 'Active chapter',
    chapterDraftStatus: 'Draft chapter',
    chapterInfoSave: 'Save Title',
    chapterInfoSaved: 'Chapter title saved',
    chapterAlreadySaved: 'Chapter already saved',
    chapterEditSaved: 'Chapter edits saved',
    duplicateChapterTitle: 'A chapter with this title already exists.',
    chapterDelete: 'Delete Empty Chapter',
    chapterDeleted: 'Chapter permanently deleted',
    chaptersDeleted: 'Chapters permanently deleted',
    moveChapterToDraft: 'Move to Draft',
    moveChaptersToDraft: 'Move Chapters to Draft',
    movingChapterToDraft: 'Moving chapter to draft...',
    movingChaptersToDraft: 'Moving chapters to drafts...',
    chapterMovedToDraft: 'Chapter moved to drafts',
    chaptersMovedToDraft: 'Chapters moved to drafts',
    recentChaptersToDraft: 'Recent chapters to draft',
    recentChaptersToDraftBody: 'Enter how many recent chapters from this list should become drafts.',
    chapterConvertCountLabel: 'Recent chapters',
    rawChaptersLabel: 'Raw Chapters',
    promoteModeTitle: 'Promote draft',
    promoteModeBody: 'Choose a direct save or open the chapter splitter before this draft becomes a chapter.',
    rawPromote: 'Raw Promote',
    rawPromoteBody: 'Save this draft as one chapter without changing the text.',
    advancedPromote: 'Advanced Promote',
    advancedPromoteBody: 'Split, preview, edit, copy, clear, delete, or reverse chapters before saving.',
    advancedPromoteTitle: 'Advanced Promote',
    advancedPromoteKicker: 'Draft splitter',
    advancedPromoteSource: 'Source Draft',
    advancedPromoteCreatedChapters: 'Created Chapters',
    advancedPromoteViews: 'Advanced promote views',
    advancedPromoteFullSource: 'Full source draft',
    advancedPromoteSettings: 'Create chapters',
    advancedPromoteWordLimit: 'Words per chapter',
    advancedPromoteChapterCount: 'Chapter count',
    advancedPromoteEndingNote: 'Ending note',
    advancedPromoteAppendNote: 'Append note',
    advancedPromotePermanentConclusion: 'Permanent conclusion',
    advancedPromotePermanentConclusionBody: 'Saved for this project and automatically added to every created chapter.',
    advancedPromoteConclusionPlaceholder: 'Write the reusable chapter conclusion...',
    advancedPromoteConclusionReady: 'Auto-add on',
    advancedPromoteConclusionEmpty: 'No conclusion set',
    advancedPromoteConclusionAdded: 'Conclusion added',
    advancedPromoteNoConclusion: 'No conclusion',
    advancedPromoteChapterConclusion: 'Chapter conclusion',
    advancedPromoteChapterConclusionBody: 'This is appended to the chapter when promoted.',
    advancedPromoteUsePermanent: 'Use permanent',
    advancedPromotePermanentStatus: 'Permanent conclusion',
    advancedPromoteCustomStatus: 'Custom conclusion',
    advancedPromoteCreate: 'Create Chapters',
    advancedPromoteReverse: 'Reverse Creation',
    advancedPromoteApply: 'Promote Chapters',
    advancedPromoteRemainder: 'Text staying in source draft',
    advancedPromoteRemainderBody: 'This text is not promoted and will remain saved in the same draft.',
    advancedPromoteNoChapters: 'Create split chapters to preview them here.',
    advancedPromoteNoFullChapter: 'The source does not contain enough words for a full chapter at this parameter.',
    advancedPromoteRegenerateRequired: 'Source or split settings changed. Create chapters again before promoting.',
    advancedPromoteEmptyChapter: 'This chapter is empty.',
    advancedPromoteCopy: 'Copy',
    advancedPromoteCopied: 'Chapter copied',
    advancedPromoteEdit: 'Edit',
    advancedPromoteClear: 'Clear',
    advancedPromoteDelete: 'Delete',
    advancedPromotePreview: 'Preview / Edit',
    advancedPromoteFullPreview: 'Full chapter preview / edit',
    advancedPromoteReady: 'Ready',
    advancedPromoteBelowParameter: 'Below parameter',
    advancedPromoteBelowParameterBody: 'Every non-empty chapter must meet the word parameter before promotion.',
    advancedPromoteBodyWords: 'body words',
    advancedPromoteFinalWords: 'final words',
    advancedPromoteProposed: 'proposed',
    advancedPromoteRemaining: 'remaining',
    advancedPromoteLastLine: 'Last line',
    advancedPromoteWords: 'words',
    advancedPromoteNoRemainder: 'No remaining text',
    advancedPromoteDestination: 'Destination',
    advancedPromoteCreateFirst: 'Create at least one chapter first.',
    advancedPromoteSaved: 'Draft promoted into chapters',
    promoteDestinationTitle: 'Where should this draft go?',
    promoteDestinationBody: 'Raw chapters are present. Choose whether this draft should become a chapter in the recent part or stay outside parts as a raw chapter.',
    promoteSelectedDrafts: 'Promote selected drafts',
    promoteSelectedDestinationTitle: 'Where should the selected drafts go?',
    promoteSelectedDestinationBody: 'The selected drafts will become chapters in their current top-to-bottom order.',
    selectedDraftsPromoted: '{count} drafts promoted to chapters',
    promoteToRecentPart: 'Recent Part',
    promoteToRawChapters: 'Raw Chapters',
    promoteConfirm: 'Promote',
    editChapter: 'Edit Chapter',
    chapterLockedTitle: 'Click Edit Chapter to unlock editing',
    chapterEditRecoveryKicker: 'Recovery',
    chapterEditRecoveryTitle: 'Unsaved chapter edit found',
    chapterEditRecoveryBody: 'A temporary edit draft exists for this chapter. Do you want to continue with those recent changes?',
    chapterEditRecoveryUse: 'Use Recent Changes',
    chapterEditRecoveryDiscard: 'Discard Changes',
    chapterEditRecoveryDiscarded: 'Recent edit draft discarded',
    chapterEditSameReminder: 'Saved chapter matches edit draft. Opening edit draft.',
    chapterEditMismatchPrefix: 'Edit draft changes:',
    chapterEditMismatchTitle: 'title edited',
    chapterEditMismatchText: 'text edited',
    chapterEditMismatchAlignment: 'alignment changed',
    chapterEditMismatchLineHeight: 'line height changed',
    chapterEditMismatchParagraphGap: 'paragraph break changed',
    chapterEditMismatchParagraphMargin: 'paragraph margin changed',
    chapterEditMismatchFontFamily: 'font changed',
    chapterEditMismatchFontSize: 'text size changed',
    chapterEditMismatchSelectionFormatting: 'selection formatting changed',
    chapterEditClosing: 'Saving edit draft...',
    chapterEditCloseFailed: 'Edit draft save failed',
    drafts: 'Drafts',
    draftPrefix: 'Draft',
    draftCreated: 'Draft created',
    draftSaved: 'Draft saved',
    draftAlreadySaved: 'Draft already saved',
    draftPromoted: 'Draft saved as chapter',
    draftDeleted: 'Draft deleted',
    draftMovedToTrash: 'Draft moved to trash',
    draftsMovedToTrash: 'Drafts moved to trash',
    draftActions: 'Draft actions',
    trash: 'Trash',
    trashDrafts: 'Trash',
    trashEmpty: 'Trash is empty',
    trashActions: 'Trash actions',
    trashMode: 'Trash mode',
    workspace: 'Workspace',
    restoreDraft: 'Restore Draft',
    restoreDrafts: 'Restore Drafts',
    restoreAllDrafts: 'Restore All Drafts',
    permanentlyDeleteDraft: 'Delete Forever',
    permanentlyDeleteDrafts: 'Delete Forever',
    draftRestored: 'Draft restored',
    draftsRestored: 'Drafts restored',
    draftDeletedForever: 'Draft permanently deleted',
    draftsDeletedForever: 'Drafts permanently deleted',
    saveDraftAsChapter: 'Save as Chapter',
    deleteDraft: 'Delete Draft',
    deleteDraftConfirm: 'Delete this draft permanently?',
    deleteDrafts: 'Delete Drafts',
    deleteAllDrafts: 'Delete All Drafts',
    deleteSelectedDrafts: 'Delete Selected Drafts',
    draftDeleteLastDocumentBlocked: 'Keep at least one draft or chapter in the story.',
    deleteAllDraftsConfirmTitle: 'Delete all drafts?',
    deleteAllDraftsConfirmBody: 'This will move every draft to trash. You can restore them later.',
    deleteSelectedDraftsConfirmTitle: 'Delete selected drafts?',
    deleteSelectedDraftsConfirmBody: 'This will move {count} selected drafts to trash. You can restore them later.',
    draftNameCleanupKicker: 'Naming cleanup',
    draftNameCleanupTitle: 'Delete names from this draft?',
    draftNameCleanupBody: '{count} saved name(s) were added from the draft you are deleting. Delete those names too, or keep them without an attached document?',
    draftNameCleanupDelete: 'Yes, Delete Names',
    draftNameCleanupKeep: 'No, Keep Names',
    draftNameCleanupRemember: 'Remember this choice',
    draftNameCleanupAlways: 'Always',
    draftNameCleanupOnce: 'Once',
    draftSelectionHint: 'Shift-click drafts to select a range.',
    storyLibraryTitle: 'Projects',
    newStory: 'New Project',
    openExistingStories: 'Recent Project',
    existingStoriesTitle: 'Recent Projects',
    noExistingStoriesFound: 'No recent projects found',
    noStoryAvailable: 'No story available yet',
    chooseWorkspaceFirst: 'Choose a workspace folder first.',
    projectTypeUnsupported: 'Only Story Writing, Novel Writing, and News Article Writing can be created right now.',
    createStory: 'Create Story',
    storyCreated: 'Story created',
    storyCreateFailed: 'Story create failed. Please try again.',
    duplicateStoryTitle: 'A story with this title already exists.',
    projectGateTitle: 'Choose a workspace folder',
    projectGateBody: 'Select an empty local folder. Lekhak Manch will keep it empty until you create or open a story.',
    projectGateNote: 'Your browser will ask permission once. After that this project can reopen automatically.',
    projectSelect: 'Choose Folder',
    projectUnsupported: 'This browser does not support local folder writing. Please use Chrome or Edge.',
    projectPermissionNeeded: 'Permission is needed to read and save this story folder.',
    loading: 'Working...',
    loadingProject: 'Loading story project...',
    creatingPart: 'Creating new part...',
    creatingChapter: 'Creating new chapter...',
    savingProject: 'Saving project...',
    titleCopied: 'Title copied to clipboard',
    saving: 'Saving...',
    unsaved: 'Unsaved changes',
    editorSettings: 'Editor settings',
    autosaveSetting: 'Autosave',
    editorAutoScrollSetting: 'Auto scroll',
    editorAutoScrollMode: 'Auto scroll mode',
    editorAutoScrollModeDepth: 'Depth marker',
    editorAutoScrollModeBand: 'Loop marker',
    editorAutoScrollModeDepthShort: 'Depth',
    editorAutoScrollModeBandShort: 'Loop',
    editorAutoScrollEmptyOnly: 'Paragraph Follow',
    editorAutoScrollClickReposition: 'Click to reposition marker',
    editorAutoScrollFocusSpeed: 'Scrolling Speed',
    editorAutoScrollApplyAll: 'Apply to all documents',
    findSettings: 'Find settings',
    replaceSettings: 'Replace settings',
    safeFind: 'Safe find',
    rawFind: 'Raw find',
    deepFind: 'Deep find',
    deepFinding: 'Deep Finding',
    safeFindShort: 'Safe',
    rawFindShort: 'Raw',
    deepFindShort: 'Deep',
    replaceScopeAfter: 'Replace only after matches',
    replaceScopeBefore: 'Replace only pre matches',
    replaceScopeAll: 'Replace all matches',
    replaceScopeAfterShort: 'After',
    replaceScopeBeforeShort: 'Pre',
    replaceScopeAllShort: 'All',
    statusVisibilitySetting: 'Choose status details',
    saveStatusSetting: 'Save status',
    readingTimeSetting: 'Reading time',
    settingOn: 'On',
    settingOff: 'Off',
    toolDockTitle: 'Writing tools',
    findTitle: 'Find / Replace',
    findOnlyTitle: 'Find',
    darkTitle: 'Dark mode',
    aiTitleShort: 'AI Assistant',
    focusTitle: 'Focus mode',
    exportTitle: 'Export .txt',
    findPlaceholder: 'Find...',
    replacePlaceholder: 'Replace...',
    replaceOne: 'Replace One',
    replaceAll: 'Replace All',
    replaceCountSingle: '1 word replaced',
    replaceCountMany: '{count} words replaced',
    prev: 'Prev',
    next: 'Next',
    close: 'Close',
    showReplace: 'Show replace',
    hideReplace: 'Hide replace',
    chapters: 'Chapters',
    addChapter: '+ New Chapter',
    addDraft: '+ New Draft',
    editorPlaceholder: 'Start writing here... your story is waiting.',
    sideNotes: 'Side Notes',
    tagsTab: 'Naming',
    notesTab: 'Facts',
    namingTab: 'Naming',
    factsTab: 'Facts',
    namingPanelTitle: 'Naming Board',
    namingPanelHint: 'Categories are story-wide; names are shown for the active chapter.',
    addCategory: '+ Category',
    addCategoryPlaceholder: 'Add category...',
    categoryActionsTitle: 'Category options',
    categoryManagerHeading: 'Manager',
    categoryManagerTitle: 'Category visibility',
    categoryManagerVisibility: 'Category visibility',
    categoryManagerShortcuts: 'Category shortcuts',
    categoryShortcutsTitle: 'Category shortcuts',
    categoryInfoTitle: 'Category information',
    categoryInfoPlaceholder: 'What should this category remember?',
    categoryInfoEmpty: 'No information saved for this category.',
    saveCategory: 'Save Category',
    showCategory: 'Show',
    hideCategory: 'Hide',
    categoryHidden: 'Hidden in naming panel',
    hideCategoryInChapter: 'Hide from panel',
    showCategoryInChapter: 'Show in panel',
    noVisibleCategories: 'No categories visible for this chapter. Use the settings button below to show one.',
    editCategoryTitle: 'Edit category title',
    categoryTitleSaved: 'Category title saved',
    categorySaved: 'Category saved',
    duplicateCategoryTitle: 'A naming category with this title already exists.',
    deleteCategoryTitle: 'Delete empty category',
    deleteCategoryBody: 'This category has no names anywhere in the story.',
    categoryDeleted: 'Category deleted',
    categoryHiddenSaved: 'Category hidden for this chapter',
    categoryShownSaved: 'Category shown for this chapter',
    categoryShortcutSaved: 'Category shortcut saved',
    categoryShortcutUnsaved: 'Shortcut not saved yet',
    categoryShortcutDuplicate: 'This shortcut is already used by another category.',
    categoryShortcutNeedsAlt: 'Shortcut must start with Alt.',
    categoryShortcutNeedsKey: 'Add at least one key after Alt.',
    categoryShortcutForbiddenKey: 'Ctrl, Shift and Tab cannot be used in category shortcuts.',
    categoryShortcutEditTitle: 'Edit shortcut',
    categoryShortcutAutoHint: 'Clear and save to return to auto shortcut.',
    addNameTitle: 'Add Name',
    namePlaceholder: 'Name',
    similarNamePlaceholder: 'Similar name',
    addSimilarNameTitle: 'Add similar name',
    nameDescriptionPlaceholder: 'Description / details',
    saveName: 'Save Name',
    nameSaved: 'Name saved',
    editNameTitle: 'Edit Name',
    nameEdited: 'Name updated',
    deleteNameTitle: 'Delete this name?',
    deleteNameBody: 'Are you sure you want to permanently delete this name and its description?',
    cancelDeleteName: 'Cancel',
    confirmDeleteName: 'Delete',
    nameDeleted: 'Name deleted',
    nameAddedAt: 'Added',
    nameEditedAt: 'Edited',
    tagNamePlaceholder: 'Enter a name...',
    addTag: '+ Add',
    factSearchPlaceholder: 'Search facts by keyword...',
    factKeywordPlaceholder: 'Fact keyword...',
    factDescriptionPlaceholder: 'Write the full fact description...',
    addFact: '+ Add Fact',
    factChapterLabel: 'Chapter',
    factComposerTitle: 'Add Fact',
    factKeywordRequired: 'Please enter a fact keyword.',
    factDescriptionRequired: 'Please write the fact description.',
    aiModeNormal: 'Normal',
    aiModeChooseTool: 'Choose AI Tool',
    aiManualBoardKicker: 'Normal Chat',
    aiManualBoardTitle: 'ChatGPT app bridge',
    aiManualBoardPlaceholder: 'Send a message to ChatGPT...',
    aiManualBoardSave: 'Save',
    aiManualBoardSaved: 'AI board saved',
    aiNormalSend: 'Send',
    aiNormalIntro: 'Messages sent here will use the local ChatGPT app bridge.',
    aiNormalBridgeFailed: 'ChatGPT bridge request failed. Start lekhak_gpt_bridge.py and keep the ChatGPT app available.',
    aiNormalThinking: 'Thinking...',
    aiIntro: 'Hello! I am your writing assistant. Choose a quick prompt below or type your own request.',
    aiPromptDefault: '\u2014 Quick Suggestions \u2014',
    aiInputPlaceholder: 'Ask AI something... (Enter = send)',
    aiSend: 'Send',
    aiUnavailable: 'AI connection is not configured yet. The panel is ready, and we can connect it in the next step.',
    aiProviderLabel: 'AI Tool',
    aiConnect: 'Connect',
    aiConnectionSaved: 'AI connection saved',
    aiDisconnected: 'AI account disconnected',
    aiConnectedAs: 'Connected as',
    aiNotConnected: 'Not connected',
    aiAccountName: 'Account',
    aiAuthMode: 'Connection',
    aiBridgeUrl: 'Bridge URL',
    aiToken: 'Token / key',
    aiConnectionNote: 'Use an official API or OAuth bridge for real account access. Password login is not stored here.',
    aiSaveConnection: 'Save Connection',
    aiDisconnect: 'Disconnect',
    aiNewChat: 'New Chat',
    aiDeleteChat: 'Delete chat',
    aiNoBridge: 'This account is saved, but no bridge URL is configured yet. Your chat is saved locally; connect an official API/OAuth bridge to receive live replies.',
    aiBridgeFailed: 'AI bridge request failed. Check the bridge URL, provider credentials, and browser CORS settings.',
    aiThinking: 'Thinking...',
    aiChatUntitled: 'New chat',
    aiManualMode: 'Manual connection note saved. Add a local API/OAuth bridge URL when you want live replies.',
    aiChatDeleted: 'Chat deleted',
    chapterStatus: 'Chapter',
    autosave: '\u25CF Autosave',
    autosaveOff: '\u25CB Autosave off',
    saved: '\u2713 Saved',
    words: 'words',
    characters: 'characters',
    paragraphs: 'paragraphs',
    sentences: 'sentences',
    minute: 'min',
    matches: 'matches',
    defaultChapterTitle: 'Chapter 1',
    chapterPrompt: 'Chapter name:',
    editChapterTitle: 'Edit chapter title',
    chapterTitleSaved: 'Chapter title saved',
    editStoryTitle: 'Edit story title',
    storyTitleSaved: 'Story title saved',
    newChapterPrefix: 'Chapter',
    noTags: 'No names added yet',
    noTagsInChapter: 'No names added in this chapter',
    showExistingNames: 'Show existing names',
    showOtherNames: 'Show other names',
    hideExistingNames: 'Hide names',
    activeChapterMentions: 'In active chapter',
    times: 'times',
    factsInCurrentChapter: 'Facts in this chapter',
    recentFacts: 'Recent facts',
    pinnedFacts: 'Pinned facts',
    noFacts: 'No facts added yet',
    noFactMatches: 'No facts match this keyword',
    showMoreFacts: 'Show More',
    showLessFacts: 'Show Less',
    factDeleteTitle: 'Delete fact',
    factPinTitle: 'Pin fact',
    factUnpinTitle: 'Unpin fact',
    factDetailTitle: 'Fact details',
    editFactTitle: 'Edit fact',
    saveFact: 'Save Fact',
    factSaved: 'Fact saved',
    factEdited: 'Fact updated',
    factDeleted: 'Fact deleted',
    factDeleteConfirmTitle: 'Delete this fact?',
    factDeleteConfirmBody: 'Are you sure you want to permanently delete this fact?',
    duplicateFactKeyword: 'A fact with this keyword already exists.',
    exportFile: 'novel.txt',
    focusClose: 'Close Focus',
    tagCategories: {
      char: 'Character',
      place: 'Place',
      thing: 'Object',
      other: 'Other'
    },
    tagOptions: {
      char: 'Character',
      place: 'Place',
      thing: 'Object',
      other: 'Other'
    },
    aiPrompts: [
      { label: 'Review writing', value: 'Review my writing and suggest improvements.' },
      { label: 'Make it emotional', value: 'Make this scene more emotional.' },
      { label: 'What to write next', value: 'Give me a few ideas for the next paragraph.' },
      { label: 'Character development', value: 'Help me write this character with more depth.' },
      { label: 'Rewrite scene', value: 'Write a better alternative for this scene.' },
      { label: 'Create summary', value: 'Summarize my story.' }
    ]
  }
};

let chapters = [];
let chapterDrafts = [];
let chapterTrashDrafts = [];
let chapterEditDrafts = {};
let curChap = 0;
let curDraft = -1;
let curTrashDraft = -1;
let activeEditorMode = 'chapter';
let trashReturnEditorState = null;
let isChapterEditUnlocked = false;
let activeChapterEditKey = null;
let pendingChapterEditRecoveryIndex = null;
let isChapterEditToggleBusy = false;
let pendingChapterTitleCommitPromise = null;
let tags = { char: [], place: [], thing: [], other: [] };
let namingData = { schemaVersion: 2, categories: defaultNamingCategories(), entries: [] };
let storyFacts = [];
let isProjectDataLoading = false;
let findMatches = [];
let findIdx = 0;
let editorScrollHideTimer = null;
let isEditorScrollbarHovered = false;
let editorScrollThumbDrag = null;
let autoSaveTimer = null;
let autoSaveIntervalTimer = null;
let isAutoSaveRunning = false;
let autoSaveRerunRequested = false;
let saveStatusHideTimer = null;
let saveStatusSettleTimer = null;
let sidePanelSaveLineHideTimer = null;
let storySummarySaveIndicatorTimer = null;
let isDark = false;
let isAIOpen = false;
let activeSidePanel = 'naming';
let isFocus = false;
let isToolDockOpen = false;
let isFontToolsOpen = false;
let isFindOpen = false;
let isReplaceOpen = false;
let editorAutoScrollMode = 'depth';
let isEditorAutoScrollModeSelectorOpen = false;
let openDockSelectId = null;
let hasStoredChapters = false;
let workspaceDirectoryHandle = null;
let projectDirectoryHandle = null;
let activeProjectTypeFolderName = '';
let projectManifest = null;
let storyInfoPanelMode = 'edit';
let storyInfoAnchorId = 'storySummaryMenuBtn';
let isStoryInfoEditing = false;
let curPart = 0;
let expandedPartIndex = 0;
let activePartDetailsIndex = null;
let activeChapterDetailsIndex = null;
let activeDraftDetailsIndex = null;
let selectedDraftIndexes = new Set();
let lastSelectedDraftIndex = null;
let selectedTrashDraftIndexes = new Set();
let lastSelectedTrashDraftIndex = null;
let selectedChapterIndexes = new Set();
let selectedChapterScope = null;
let chapterListOverflowMode = 'normal';
let chapterPanelOverflowRaf = null;
let isPartsListCollapsedByRaw = false;
let isPartsListForceExpanded = false;
let isRawChapterSectionExpanded = false;
let isDraftTrashMode = false;
let sidebarScrollHideTimers = {};
let sidebarScrollHoverKind = '';
let sidebarScrollThumbDrag = null;
let isEditingChapterTitle = false;
let isEditorSettingsOpen = false;
let isStatusSelectorOpen = false;
let isFindSettingsSelectorOpen = false;
let isReplaceSettingsSelectorOpen = false;
let isAutoSaveEnabled = true;
let isEditorAutoScrollEnabled = true;
let isEditorAutoScrollEmptyParagraphOnly = false;
let isEditorAutoScrollClickRepositionEnabled = true;
let editorFindMode = 'safe';
let editorReplaceScope = 'all';
let isPasteSettingsEnabled = true;
let isPasteSettingsSelectorOpen = false;
let copyParaMode = 'gap';
let copyParagraphGaps = 1;
let smartPasteLineSpacing = 0;
let smartPasteParagraphGap = 0;
let smartPasteFontSize = 0;
let isCopySettingsEnabled = true;
let isCopySettingsSelectorOpen = false;
let smartPasteAutoApply = false;

let lastSavedChapterHTML = '';
let savedEditorRange = null;
let activeInlineFormats = {
  bold: false,
  italic: false,
  underline: false
};
let inlineFormatSyncLockedUntil = 0;
let expandedNamingCategoryId = 'characters';
let activeNamingCategoryId = null;
let activeNamingEntryId = null;
let activeEditingNamingEntryId = null;
let activeEditingFactId = null;
let activeFloatingAnchor = null;
let visibleFactCount = 10;
let toolDockDragState = null;
let toolDockOrientation = 'horizontal';
let toolDockHandleClickTimer = null;
let floatingPanelDragState = null;
let suppressNextToolDockClick = false;
let appLoadingDepth = 0;
let appLoaderHideTimer = null;
let miniReminderTimer = null;
let visibleEditorStatuses = {
  save: true,
  words: true,
  characters: false,
  paragraphs: true,
  sentences: false,
  readingTime: false
};

const PROJECT_DB_NAME = 'lekhak-manch-project';
const PROJECT_DB_STORE = 'handles';
const PROJECT_HANDLE_KEY = 'active-folder';
const WORKSPACE_HANDLE_KEY = 'workspace-folder';
const PROJECT_MANIFEST_FILE = 'Chapters_info.json';
const PROJECT_NAMING_FILE = 'Story_Naming.json';
const PROJECT_DRAFTS_FILE = 'Story_Drafts.json';
const PROJECT_WORD_EDITING_FILE = 'Story_Word_Editing.json';
const PROJECT_TRASH_DIR = 'Trash';
const PROJECT_TRASH_DRAFTS_FILE = 'Trash/Trash_Drafts.json';
const PROJECT_CHAPTER_EDIT_DRAFTS_FILE = 'Temp_Chapter_Draft.json';
const PROJECT_CHAPTER_EDIT_DRAFTS_DIR = 'Edited_Chapter';
const PROJECT_MODE_KEY = 'lm_project_mode';
const WORKSPACE_FOLDER_KEY = 'lm_workspace_folder_name';
const PROJECT_FOLDER_KEY = 'lm_project_folder_name';
const PROJECT_TYPE_FOLDER_KEY = 'lm_project_type_folder_name';
const PROJECT_MANIFEST_KEY = 'lm_project_manifest';
const ACTIVE_EDITOR_STATE_STORAGE_PREFIX = 'lm_active_editor_state:';
const DRAFTS_STORAGE_KEY = 'lm_chapter_drafts';
const TRASH_DRAFTS_STORAGE_KEY = 'lm_trash_drafts';
const CHAPTER_EDIT_DRAFTS_STORAGE_KEY = 'lm_chapter_edit_drafts';
const NAMING_STORAGE_KEY = 'lm_naming_data';
const DRAFT_NAMING_DELETE_PROMPT_KEY = 'lm_draft_naming_delete_prompt';
const FACTS_STORAGE_KEY = 'lm_story_facts';
const AUTOSAVE_ENABLED_KEY = 'lm_autosave_enabled';
const EDITOR_AUTO_SCROLL_ENABLED_KEY = 'lm_editor_auto_scroll_enabled';
const EDITOR_AUTO_SCROLL_DEPTH_KEY = 'lm_editor_auto_scroll_depth';
const EDITOR_AUTO_SCROLL_MODE_KEY = 'lm_editor_auto_scroll_mode';
const EDITOR_AUTO_SCROLL_EMPTY_ONLY_KEY = 'lm_editor_auto_scroll_empty_only';
const EDITOR_AUTO_SCROLL_CLICK_REPOSITION_KEY = 'lm_editor_auto_scroll_click_reposition_enabled';
const EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY = 'lm_editor_auto_scroll_focus_time';
const EDITOR_AUTO_SCROLL_BAND_TOP_KEY = 'lm_editor_auto_scroll_band_top';
const EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY = 'lm_editor_auto_scroll_band_bottom';
const STATUS_VISIBILITY_KEY = 'lm_editor_statuses_visible';
const FIND_MODE_STORAGE_KEY = 'lm_editor_find_mode';
const REPLACE_SCOPE_STORAGE_KEY = 'lm_editor_replace_scope';
const TOOL_DOCK_POSITION_KEY = 'lm_tool_dock_position';
const FLOATING_PANEL_POSITION_KEY = 'lm_floating_panel_positions';
const EDITOR_STATUS_KEYS = ['save', 'words', 'characters', 'paragraphs', 'sentences', 'readingTime'];
const EDITOR_STAT_KEYS = ['words', 'characters', 'paragraphs', 'sentences', 'readingTime'];
const EDITOR_FIND_MODES = ['safe', 'raw', 'deep'];
const EDITOR_REPLACE_SCOPES = ['after', 'before', 'all'];
const EDITOR_AUTO_SCROLL_MODES = ['depth', 'band'];
const EDITOR_ALIGNMENTS = ['left', 'center', 'right', 'justify'];
const EDITOR_LINE_HEIGHTS = [1.6, 1.8, 1.92, 2.1, 2.3];
const EDITOR_PARAGRAPH_GAPS = [0, 1, 2, 3];
const EDITOR_PARAGRAPH_MARGIN_MIN = 0;
const EDITOR_PARAGRAPH_MARGIN_MAX = 120;
const EDITOR_FONT_FAMILIES = [
  "'Lora',serif",
  "'Times New Roman',serif",
  'Kokila,serif',
  "'Playfair Display',serif",
  "'Georgia',serif",
  "'Courier New',monospace"
];
const EDITOR_FONT_SIZE_MIN = 10;
const EDITOR_FONT_SIZE_MAX = 36;
const EDITOR_PARAGRAPH_GAP_BR_CLASS = 'editor-paragraph-gap-br';
const EDITOR_FILE_GAP_BR_CLASS = 'editor-file-gap-br';
const FACTS_PAGE_SIZE = 10;

// Paste & Copy settings storage keys
const PASTE_SETTINGS_ENABLED_KEY = 'lm_paste_settings_enabled';
const COPY_SETTINGS_ENABLED_KEY = 'lm_copy_settings_enabled';
const COPY_PARA_MODE_KEY = 'lm_copy_para_mode';
const EDITOR_COPY_PARA_MODES = ['gap', 'single'];
const COPY_PARAGRAPH_GAPS_KEY = 'lm_copy_paragraph_gaps';
const SMART_PASTE_LINE_SPACING_KEY = 'lm_smart_paste_line_spacing';
const SMART_PASTE_PARAGRAPH_GAP_KEY = 'lm_smart_paste_paragraph_gap';
const SMART_PASTE_FONT_SIZE_KEY = 'lm_smart_paste_font_size';
const SMART_PASTE_AUTO_APPLY_KEY = 'lm_smart_paste_auto_apply';
const SMART_PASTE_LINE_SPACING_MAX = 3;
const SMART_PASTE_PARAGRAPH_GAP_MAX = 3;
const SMART_PASTE_FONT_SIZE_MAX = 36;

function hasActiveStory() {
  return Boolean(projectManifest && projectDirectoryHandle);
}

function editorFileGapHTML() {
  return `<span class="${EDITOR_FILE_GAP_BR_CLASS}" data-file-paragraph-gap="true" aria-hidden="true"></span>`;
}


function createEditorParagraphGapNode() {
  const gapNode = document.createElement('p');
  gapNode.className = EDITOR_PARAGRAPH_GAP_BR_CLASS;
  gapNode.dataset.editorParagraphGap = 'true';
  gapNode.setAttribute('aria-hidden', 'true');
  gapNode.appendChild(document.createElement('br'));
  return gapNode;
}
const CROSS_CLOSE_SVG = lmIcon('close');
const DRAFT_DELETE_SVG = lmIcon('draftDelete');
const DRAFT_PROMOTE_SVG = lmIcon('promoteDraft');
const TRASH_MODE_SVG = lmIcon('trashMode');
const CHAPTER_TO_DRAFT_SVG = lmIcon('chapterToDraft');
const RESTORE_DRAFT_SVG = lmIcon('restoreDraft');

function normalizeStoryFacts(facts = []) {
  if (!Array.isArray(facts)) return [];
  return facts
    .map((fact, index) => {
      if (!fact) return null;
      const isTextFact = typeof fact === 'string';
      const keyword = String(isTextFact ? `Fact ${index + 1}` : fact.keyword || fact.title || fact.key || '').trim();
      const description = String(isTextFact ? fact : fact.description || fact.text || fact.fact || '').trim();
      if (!keyword && !description) return null;
      const createdAt = fact.createdAt || fact.time || new Date().toISOString();
      const descriptionHistory = Array.isArray(fact.descriptionHistory)
        ? fact.descriptionHistory
            .filter(item => item && typeof item === 'object')
            .map(item => ({
              description: String(item.description || '').trim(),
              editedAt: item.editedAt || item.updatedAt || createdAt,
              chapterMeta: item.chapterMeta || item.meta || item.descriptionMeta || null
            }))
        : [];
      const hasExplicitChapterIndex = Number.isInteger(fact.chapterIndex) && fact.chapterIndex >= 0;
      const hasChapterStatus = Boolean(fact.chapterKey || hasExplicitChapterIndex || fact.chapterNo || fact.chapterTitle);
      const foundChapterIndex = hasChapterStatus && fact.chapterKey
        ? chapters.findIndex(chapter => (chapter.contentPath || '') === fact.chapterKey)
        : -1;
      const chapterIndex = hasExplicitChapterIndex
        ? fact.chapterIndex
        : foundChapterIndex;
      const chapter = chapterIndex >= 0 ? chapters[chapterIndex] || {} : {};
      const chapterNo = hasChapterStatus ? fact.chapterNo || chapter.chapterNo || (chapterIndex >= 0 ? chapterIndex + 1 : '') : '';
      const chapterTitle = hasChapterStatus
        ? chapter.title ? chapterDisplayTitle(chapter, chapterIndex) : fact.chapterTitle || ''
        : '';

      return {
        id: String(fact.id || `fact-${Date.now()}-${index}`),
        keyword: keyword || `Fact ${index + 1}`,
        description,
        chapterKey: hasChapterStatus ? fact.chapterKey || (chapterIndex >= 0 ? chapterStorageKey(chapterIndex) : '') : '',
        chapterIndex,
        chapterNo,
        chapterTitle: chapterTitle || '',
        createdAt,
        pinned: Boolean(fact.pinned),
        updatedAt: fact.updatedAt || createdAt,
        descriptionMeta: fact.descriptionMeta || fact.meta || null,
        descriptionHistory
      };
    })
    .filter(Boolean);
}

function chapterDisplayTitle(chapter, index = curChap) {
  if (!chapter) return text().noSavedChapters;
  const isDefaultTitle = chapter.title === translations.en.defaultChapterTitle ||
    chapter.title === 'अध्याय 1';
  const isBlankDefaultChapter = index === 0 &&
    isDefaultTitle &&
    !chapter.content &&
    !(chapter.notes && chapter.notes.length);
  return isBlankDefaultChapter ? text().defaultChapterTitle : chapter.title;
}

function factTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return date.toLocaleTimeString(text().locale, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString(text().locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function factChapterOptionLabel(chapter, index) {
  const number = Number.isInteger(index) && index >= 0
    ? index + 1
    : chapter?.chapterNo || 1;
  return `${text().chapterStatus} ${number} \u2014 ${chapterDisplayTitle(chapter, index)}`;
}

function normalizeEditorAlignment(alignment) {
  return EDITOR_ALIGNMENTS.includes(alignment) ? alignment : 'justify';
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeEditorLineHeight(value) {
  const numericValue = Number(value);
  return EDITOR_LINE_HEIGHTS.includes(numericValue) ? numericValue : 1.92;
}

function normalizeEditorParagraphGap(value) {
  const numericValue = Number(value);
  if ([8, 16, 24].includes(numericValue)) return clampNumber(Math.round(numericValue / 8), 0, 3);
  return EDITOR_PARAGRAPH_GAPS.includes(numericValue) ? numericValue : 0;
}

function normalizeEditorParagraphMargin(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return clampNumber(Math.round(numericValue), EDITOR_PARAGRAPH_MARGIN_MIN, EDITOR_PARAGRAPH_MARGIN_MAX);
}

function isEditorSpacingValueUnset(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function normalizeOptionalEditorLineHeight(value) {
  if (isEditorSpacingValueUnset(value)) return null;
  const numericValue = Number(value);
  return EDITOR_LINE_HEIGHTS.includes(numericValue) ? numericValue : null;
}

function getClosestEditorLineHeight(value) {
  if (value === undefined || value === null || Number(value) <= 0) {
    return null;
  }
  const numericValue = Number(value);
  let closest = EDITOR_LINE_HEIGHTS[0];
  let minDiff = Math.abs(numericValue - closest);
  for (let i = 1; i < EDITOR_LINE_HEIGHTS.length; i++) {
    const diff = Math.abs(numericValue - EDITOR_LINE_HEIGHTS[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = EDITOR_LINE_HEIGHTS[i];
    }
  }
  return closest;
}

function normalizeOptionalEditorParagraphGap(value) {
  if (isEditorSpacingValueUnset(value)) return null;
  const numericValue = Number(value);
  return EDITOR_PARAGRAPH_GAPS.includes(numericValue) ? numericValue : null;
}

function normalizeOptionalEditorParagraphMargin(value) {
  if (isEditorSpacingValueUnset(value)) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return clampNumber(Math.round(numericValue), EDITOR_PARAGRAPH_MARGIN_MIN, EDITOR_PARAGRAPH_MARGIN_MAX);
}

function normalizeEditorFontFamily(value) {
  const fontValue = String(value || '').trim();
  return EDITOR_FONT_FAMILIES.includes(fontValue) ? fontValue : EDITOR_FONT_FAMILIES[0];
}

function normalizeEditorFontSize(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 16;
  return clampNumber(Math.round(numericValue), EDITOR_FONT_SIZE_MIN, EDITOR_FONT_SIZE_MAX);
}

function editorGlobalTextFormattingDefaults() {
  let stored = {};
  if (typeof getStoredOrRuntimeGlobalFormatting === 'function') {
    const fmt = getStoredOrRuntimeGlobalFormatting();
    const rawLineHeight = Number(fmt.globalLineSpacing ?? fmt.lineHeight);
    const rawParagraphGap = Number(fmt.globalParagraphGap ?? fmt.paragraphGap);
    const rawFontSize = Number(fmt.globalFontSize ?? fmt.fontSize);
    return {
      alignment: normalizeEditorAlignment(fmt.globalAlignment || fmt.alignment || 'justify'),
      lineHeight: Number.isFinite(rawLineHeight) && rawLineHeight > 0 ? getClosestEditorLineHeight(rawLineHeight) : null,
      paragraphGap: normalizeEditorParagraphGap(Number.isFinite(rawParagraphGap) ? rawParagraphGap : 1),
      fontFamily: normalizeEditorFontFamily(fmt.globalFontFamily || fmt.fontFamily || EDITOR_FONT_FAMILIES[0]),
      fontSize: normalizeEditorFontSize(Number.isFinite(rawFontSize) && rawFontSize > 0 ? rawFontSize : 16)
    };
  }

  if (typeof projectManifest !== 'undefined' && projectManifest?.globalTextFormatting) {
    stored = projectManifest.globalTextFormatting;
  } else {
    try { stored = JSON.parse(localStorage.getItem('lm_editor_advanced_settings_v1') || '{}') || {}; }
    catch { stored = {}; }
  }
  const rawLineHeight = Number(stored.globalLineSpacing ?? stored.lineHeight);
  const rawParagraphGap = Number(stored.globalParagraphGap ?? stored.paragraphGap);
  const rawFontSize = Number(stored.globalFontSize ?? stored.fontSize);
  return {
    alignment: normalizeEditorAlignment(stored.globalAlignment || stored.alignment || 'justify'),
    lineHeight: Number.isFinite(rawLineHeight) && rawLineHeight > 0 ? getClosestEditorLineHeight(rawLineHeight) : null,
    paragraphGap: normalizeEditorParagraphGap(Number.isFinite(rawParagraphGap) ? rawParagraphGap : 1),
    fontFamily: normalizeEditorFontFamily(stored.globalFontFamily || stored.fontFamily || EDITOR_FONT_FAMILIES[0]),
    fontSize: normalizeEditorFontSize(Number.isFinite(rawFontSize) && rawFontSize > 0 ? rawFontSize : 16)
  };
}

function hasOwnEditorFormattingValue(source, key, legacyKey = '') {
  if (!source || typeof source !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(source, key) ||
    Boolean(legacyKey && Object.prototype.hasOwnProperty.call(source, legacyKey));
}

function normalizeEditorDocumentFormatting(source = {}) {
  const fallback = editorGlobalTextFormattingDefaults();
  const valueFor = (key, legacyKey = '') => (
    Object.prototype.hasOwnProperty.call(source, key) ? source[key] : source[legacyKey]
  );

  return {
    alignment: hasOwnEditorFormattingValue(source, 'alignment')
      ? normalizeEditorAlignment(source.alignment)
      : fallback.alignment,
    lineHeight: hasOwnEditorFormattingValue(source, 'lineHeight', 'line_height')
      ? normalizeOptionalEditorLineHeight(valueFor('lineHeight', 'line_height'))
      : fallback.lineHeight,
    paragraphGap: hasOwnEditorFormattingValue(source, 'paragraphGap', 'paragraph_gap')
      ? normalizeOptionalEditorParagraphGap(valueFor('paragraphGap', 'paragraph_gap'))
      : fallback.paragraphGap,
    paragraphMargin: hasOwnEditorFormattingValue(source, 'paragraphMargin', 'paragraph_margin')
      ? normalizeOptionalEditorParagraphMargin(valueFor('paragraphMargin', 'paragraph_margin'))
      : null,
    fontFamily: hasOwnEditorFormattingValue(source, 'fontFamily', 'font_family')
      ? normalizeEditorFontFamily(valueFor('fontFamily', 'font_family'))
      : fallback.fontFamily,
    fontSize: hasOwnEditorFormattingValue(source, 'fontSize', 'font_size')
      ? normalizeEditorFontSize(valueFor('fontSize', 'font_size'))
      : fallback.fontSize
  };
}

function editorContentHasRichFormatting(content = '') {
  const html = String(content || '');
  return /<(?:b|strong|i|em|u|s|strike|span|font|mark|sub|sup)\b/i.test(html) ||
    /<(?:p|div|li|blockquote|h[1-6])\b[^>]*\s(?:style|class|align)=/i.test(html);
}

function editorDocumentRichContentForStorage(documentItem) {
  if (!documentItem || typeof documentItem !== 'object') return '';
  const content = String(documentItem.content || '');
  if (documentItem._contentLoadState === 'loaded' || content) {
    return editorContentHasRichFormatting(content) ? content : '';
  }
  return String(documentItem.richContentHTML || '');
}

function applyEditorGlobalTextFormatting(documentItem) {
  if (!documentItem || typeof documentItem !== 'object') return documentItem;
  Object.assign(documentItem, normalizeEditorDocumentFormatting(documentItem));
  return documentItem;
}

function createDefaultChapter() {
  return {
    id: 1,
    title: translations.en.defaultChapterTitle,
    content: '',
    _contentLoadState: 'loaded',
    _contentPresented: false,
    notes: [],
    contentPath: 'Chapters/chapter_01.txt',
    partIndex: 0,
    chapterNo: 1,
    createdAt: new Date().toISOString(),
    ...editorGlobalTextFormattingDefaults()
  };
}

function createDefaultDraft(index = 0) {
  return {
    id: Date.now() + index,
    title: `${text().draftPrefix} ${index + 1}`,
    content: '',
    _contentLoadState: 'loaded',
    _contentPresented: false,
    notes: [],
    contentPath: draftFilePath(index),
    draftNo: index + 1,
    createdAt: new Date().toISOString(),
    ...editorGlobalTextFormattingDefaults(),
    _wordCount: 0
  };
}

function chapterFilePath(index) {
  return `Chapters/chapter_${String(index + 1).padStart(2, '0')}.txt`;
}

function draftFilePath(index) {
  return `Drafts/draft_${String(index + 1).padStart(2, '0')}.txt`;
}

function trashDraftFilePath(index) {
  return `${PROJECT_TRASH_DIR}/draft_${String(index + 1).padStart(2, '0')}.txt`;
}

function chapterEditDraftFilePath(index = 0) {
  return `${PROJECT_CHAPTER_EDIT_DRAFTS_DIR}/chapter_edit_${String(index + 1).padStart(2, '0')}.txt`;
}

function isDraftContentKey(key) {
  return String(key || '').replace(/\\/g, '/').startsWith('Drafts/');
}

function normalizeNamingEntryStatus(entry = {}) {
  if (Object.prototype.hasOwnProperty.call(entry, 'source')) return entry.source?.documentType || 'undefined';
  const rawStatus = String(entry.chapterStatus || entry.documentType || entry.status || '').toLowerCase();
  if (rawStatus === 'draft' || rawStatus === 'chapter' || rawStatus === 'orphan') return rawStatus;
  if (rawStatus === 'undefined' || rawStatus === 'pending' || rawStatus === 'unattached') return 'undefined';
  if (
    entry.missingNameMentionAt ||
    entry.missingNameMentionMeta ||
    entry.sourceState === 'missing-name-mention' ||
    entry.namingSourceState === 'missing-name-mention'
  ) {
    return 'undefined';
  }
  return isDraftContentKey(entry.chapterKey || entry.contentPath || entry.draftKey) ? 'draft' : 'chapter';
}

function isUndefinedNamingEntry(entry = {}) {
  return normalizeNamingEntryStatus(entry) === 'undefined';
}

function isMissingDocumentNamingEntry(entry = {}) {
  return isUndefinedNamingEntry(entry) && Boolean(
    entry.missingDocumentAt ||
    entry.missingDocumentMeta ||
    entry.sourceState === 'missing-document' ||
    entry.namingSourceState === 'missing-document'
  );
}

function isOrphanStyleNamingEntry(entry = {}) {
  const hasNullSource = Object.prototype.hasOwnProperty.call(entry, 'source') && entry.source === null;
  return hasNullSource || normalizeNamingEntryStatus(entry) === 'orphan' || isMissingDocumentNamingEntry(entry);
}

function nextDraftFilePath() {
  const usedPaths = new Set(chapterDrafts.map(draft => draft.contentPath).filter(Boolean));
  let pathIndex = chapterDrafts.length;
  let path = draftFilePath(pathIndex);
  while (usedPaths.has(path)) {
    pathIndex += 1;
    path = draftFilePath(pathIndex);
  }
  return path;
}

function defaultPartTitle(index = 0) {
  return `${text().partPrefix || 'Part'} ${index + 1}`;
}

function defaultNamingCategories() {
  return [
    { id: 'characters', title: 'Character Names', color: 'char', info: '' },
    { id: 'places', title: 'Place Names', color: 'place', info: '' },
    { id: 'objects', title: 'Objects / Items', color: 'thing', info: '' },
    { id: 'groups', title: 'Groups / Families', color: 'other', info: '' }
  ];
}

function namingCategoryId(title) {
  return String(title || 'category')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `category-${Date.now()}`;
}

function normalizeNamingData(data = { schemaVersion: 2 }) {
  if (data.schemaVersion >= 2) return normalizeNamingV2Data(data);
  const defaults = defaultNamingCategories();
  const rawCategories = Array.isArray(data.categories) ? data.categories : [];
  const removedCategoryIds = new Set(Array.isArray(data.removedCategoryIds) ? data.removedCategoryIds : []);
  const rawHiddenByChapter = data.hiddenByChapter && typeof data.hiddenByChapter === 'object'
    ? data.hiddenByChapter
    : {};
  const rawVisibleByChapter = data.visibleByChapter && typeof data.visibleByChapter === 'object'
    ? data.visibleByChapter
    : {};
  const rawDetectedByChapter = data.detectedByChapter && typeof data.detectedByChapter === 'object'
    ? data.detectedByChapter
    : {};
  const hiddenByChapter = Object.fromEntries(
    Object.entries(rawHiddenByChapter).map(([chapterKey, categoryIds]) => [
      chapterKey,
      [...new Set(Array.isArray(categoryIds) ? categoryIds.map(String) : [])]
    ])
  );
  const visibleByChapter = Object.fromEntries(
    Object.entries(rawVisibleByChapter).map(([chapterKey, categoryIds]) => [
      chapterKey,
      [...new Set(Array.isArray(categoryIds) ? categoryIds.map(String) : [])]
    ])
  );
  const detectedByChapter = Object.fromEntries(
    Object.entries(rawDetectedByChapter).map(([chapterKey, entryIds]) => [
      chapterKey,
      [...new Set(Array.isArray(entryIds) ? entryIds.map(String) : [])]
    ])
  );
  const categoryMap = new Map();

  [...defaults.filter(category => !removedCategoryIds.has(category.id)), ...rawCategories].forEach((sourceCategory, index) => {
    const category = sourceCategory && typeof sourceCategory === 'object' ? sourceCategory : {};
    const title = category.title || category.label || defaults[index]?.title || `Category ${index + 1}`;
    const id = category.id || namingCategoryId(title);
    categoryMap.set(id, {
      ...category,
      id,
      title,
      color: category.color || defaults[index % defaults.length]?.color || 'other',
      info: category.info || category.description || category.details || '',
      shortcut: String(category.shortcut || category.shortcutSequence || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    });
  });

  const entries = Array.isArray(data.entries) ? data.entries : [];
  const invalidEntries = [
    ...(Array.isArray(data.invalidEntries) ? data.invalidEntries : []),
    ...entries.filter(entry => !entry || !String(entry.name || '').trim())
  ];
  return {
    ...data,
    categories: [...categoryMap.values()],
    removedCategoryIds: [...removedCategoryIds],
    hiddenByChapter,
    visibleByChapter,
    detectedByChapter,
    invalidEntries,
    entries: entries
      .filter(entry => entry && String(entry.name || '').trim())
      .map((entry, index) => {
        const createdAt = entry.createdAt || new Date().toISOString();
        const descriptionHistory = Array.isArray(entry.descriptionHistory)
          ? entry.descriptionHistory
              .filter(item => item && typeof item.description === 'string')
              .map(item => ({
                ...(typeof item.previousDescription === 'string'
                  ? { previousDescription: item.previousDescription }
                  : {}),
                description: item.description,
                editedAt: item.editedAt || item.updatedAt || createdAt,
                chapterMeta: item.chapterMeta || item.meta || null
              }))
          : [];
        const invalidDescriptionHistory = Array.isArray(entry.descriptionHistory)
          ? entry.descriptionHistory.filter(item => !item || typeof item.description !== 'string')
          : [];

        const chapterStatus = normalizeNamingEntryStatus(entry);
        const isDraftEntry = chapterStatus === 'draft';
        const isOrphanEntry = chapterStatus === 'orphan';
        const isUndefinedEntry = chapterStatus === 'undefined';
        const draftIndex = Number.isInteger(entry.draftIndex) ? entry.draftIndex : (isDraftEntry ? curDraft : null);
        const chapterIndex = Number.isInteger(entry.chapterIndex) ? entry.chapterIndex : (isDraftEntry || isOrphanEntry || isUndefinedEntry ? null : curChap);
        const chapterKey = entry.chapterKey ||
          (isDraftEntry
            ? entry.draftKey || entry.contentPath || activeEditorStorageKey()
            : isOrphanEntry || isUndefinedEntry
              ? entry.draftKey || entry.contentPath || ''
              : chapterStorageKey(chapterIndex ?? curChap));
        const draftTitle = entry.draftTitle || (draftIndex !== null ? chapterDrafts[draftIndex]?.title : '') || '';
        const chapterTitle = entry.chapterTitle ||
          (isDraftEntry
            ? draftTitle || text().draftPrefix
            : isOrphanEntry || isUndefinedEntry
              ? draftTitle
              : chapters[chapterIndex ?? curChap]?.title || '');
        const primaryNameKey = String(entry.name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
        const similarNames = [...new Map(
          (Array.isArray(entry.similarNames) ? entry.similarNames : Array.isArray(entry.aliases) ? entry.aliases : [])
            .map(value => String(value || '').trim().replace(/\s+/g, ' '))
            .filter(value => value && value.toLocaleLowerCase() !== primaryNameKey)
            .map(value => [value.toLocaleLowerCase(), value])
        ).values()];

        return {
          ...entry,
          id: entry.id || `name-${Date.now()}-${index}`,
          categoryId: entry.categoryId || entry.category || defaults[0].id,
          chapterKey,
          chapterIndex,
          chapterNo: entry.chapterNo || (chapterIndex !== null ? chapters[chapterIndex]?.chapterNo || chapterIndex + 1 : null),
          chapterTitle,
          chapterStatus,
          documentType: chapterStatus,
          draftKey: entry.draftKey || (isDraftEntry ? chapterKey : null),
          draftIndex,
          draftNo: entry.draftNo || (draftIndex !== null ? chapterDrafts[draftIndex]?.draftNo || draftIndex + 1 : null),
          draftTitle,
          contentPath: entry.contentPath || chapterKey,
          resolvedAt: entry.resolvedAt || null,
          resolvedFromDraft: entry.resolvedFromDraft || null,
          chapterSavedAt: entry.chapterSavedAt || entry.chapter_saved_at || null,
          draftPromotedAt: entry.draftPromotedAt || entry.draft_promoted_at || entry.promotedAt || entry.promoted_at || null,
          orphanedAt: entry.orphanedAt || entry.orphaned_at || entry.detachedAt || null,
          orphanedFromDraft: entry.orphanedFromDraft || entry.orphaned_from_draft || entry.detachedFromDraft || null,
          missingDocumentAt: entry.missingDocumentAt || entry.missing_document_at || null,
          missingDocumentMeta: entry.missingDocumentMeta || entry.missing_document_meta || null,
          missingNameMentionAt: entry.missingNameMentionAt || entry.missing_name_mention_at || null,
          missingNameMentionMeta: entry.missingNameMentionMeta || entry.missing_name_mention_meta || null,
          sourceState: entry.sourceState || entry.namingSourceState || '',
          name: entry.name,
          similarNames,
          description: entry.description || entry.details || '',
          createdAt,
          updatedAt: entry.updatedAt || createdAt,
          descriptionMeta: entry.descriptionMeta || entry.meta || null,
          descriptionHistory,
          invalidDescriptionHistory: [
            ...(Array.isArray(entry.invalidDescriptionHistory) ? entry.invalidDescriptionHistory : []),
            ...invalidDescriptionHistory
          ]
        };
      })
  };
}

// Compatibility properties are derived, non-enumerable views, never persisted.
function namingSourceReadView(entry) {
  const fields = {
    chapterStatus: () => entry.source?.documentType || 'undefined',
    documentType: () => entry.source?.documentType || 'undefined',
    chapterKey: () => entry.source?.documentKey || '',
    contentPath: () => entry.source?.documentKey || '',
    chapterIndex: () => entry.source?.documentType === 'chapter' ? entry.source.documentIndex : null,
    chapterNo: () => entry.source?.documentType === 'chapter' ? entry.source.documentNo : null,
    chapterTitle: () => entry.source?.documentTitle || '',
    draftKey: () => entry.source?.documentType === 'draft' ? entry.source.documentKey : null,
    draftIndex: () => entry.source?.documentType === 'draft' ? entry.source.documentIndex : null,
    draftNo: () => entry.source?.documentType === 'draft' ? entry.source.documentNo : null,
    draftTitle: () => entry.source?.documentType === 'draft' ? entry.source.documentTitle : ''
  };
  Object.entries(fields).forEach(([key, get]) => {
    if (!Object.prototype.hasOwnProperty.call(entry, key)) Object.defineProperty(entry, key, { get, configurable: true });
  });
  return entry;
}

function normalizeNamingV2Data(data) {
  return {
    ...data,
    categories: data.categories || defaultNamingCategories(),
    removedCategoryIds: data.removedCategoryIds || [],
    hiddenByChapter: data.hiddenByChapter || {},
    visibleByChapter: data.visibleByChapter || {},
    detectedByChapter: data.detectedByChapter || {},
    invalidEntries: data.invalidEntries || [],
    invalidDescriptionHistory: data.invalidDescriptionHistory || [],
    entries: (data.entries || []).map(entry => namingSourceReadView({ ...entry }))
  };
}

function normalizeDocumentKey(key) {
  return String(key || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function createNamingSource(document, documentType, index, timestamp = new Date().toISOString()) {
  return {
    documentType,
    ...(document.id != null ? { documentId: String(document.id) } : {}),
    documentKey: normalizeDocumentKey(document.contentPath || (documentType === 'draft' ? draftFilePath(index) : chapterFilePath(index))),
    documentIndex: index,
    documentNo: (documentType === 'draft' ? document.draftNo : document.chapterNo) || index + 1,
    documentTitle: document.title || '',
    attachedAt: timestamp,
    checkedAt: timestamp
  };
}

function sourcesIdentifySameDocument(left, right) {
  if (!left || !right) return false;
  if (left.documentType && right.documentType && left.documentType !== right.documentType) return false;
  if (String(left.documentId ?? '').trim() && String(right.documentId ?? '').trim()) return String(left.documentId) === String(right.documentId);
  const key = normalizeDocumentKey(left.documentKey);
  return Boolean(key && key === normalizeDocumentKey(right.documentKey));
}

function namingDocumentRegistry(timestamp = new Date().toISOString()) {
  return [
    ...chapters.map((document, index) => ({ document, index, documentType: 'chapter', source: createNamingSource(document, 'chapter', index, timestamp) })),
    ...chapterDrafts.map((document, index) => ({ document, index, documentType: 'draft', source: createNamingSource(document, 'draft', index, timestamp) }))
  ];
}

function sourceFromNamingMeta(meta, timestamp = new Date().toISOString()) {
  if (!meta) return null;
  const identity = { documentType: meta.documentType || meta.chapterStatus, documentId: meta.documentId, documentKey: meta.documentKey || meta.draftKey || meta.chapterKey || meta.contentPath };
  const match = namingDocumentRegistry(timestamp).find(item => sourcesIdentifySameDocument(item.source, identity));
  return match ? match.source : null;
}

function normalizeDescriptionForComparison(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function normalizeNamingAliases(values, name) {
  const primary = String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return [...new Map((Array.isArray(values) ? values : []).map(value => String(value || '').trim().replace(/\s+/g, ' '))
    .filter(value => value && value.toLocaleLowerCase() !== primary).map(value => [value.toLocaleLowerCase(), value])).values()];
}

function applyNamingEntryEdit(entry, next, editedBy = null) {
  const aliases = normalizeNamingAliases(next.similarNames, next.name);
  const descriptionChanged = normalizeDescriptionForComparison(entry.description) !== normalizeDescriptionForComparison(next.description);
  const aliasKeys = values => normalizeNamingAliases(values, next.name).map(value => value.toLocaleLowerCase()).sort();
  const changed = descriptionChanged || entry.name !== next.name || entry.categoryId !== next.categoryId ||
    JSON.stringify(aliasKeys(entry.similarNames)) !== JSON.stringify(aliasKeys(aliases));
  if (!changed) return false;
  const editedAt = new Date().toISOString();
  if (descriptionChanged) entry.descriptionHistory = [...(entry.descriptionHistory || []), {
    description: String(entry.description ?? ''), editedAt, ...(editedBy ? { editedBy } : {})
  }].slice(-50);
  entry.name = next.name;
  entry.categoryId = next.categoryId;
  entry.similarNames = aliases;
  if (descriptionChanged) entry.description = String(next.description ?? '').trim();
  entry.updatedAt = editedAt;
  return true;
}

function migrateNamingDataset(raw, registry = namingDocumentRegistry()) {
  if (raw.schemaVersion >= 2) return raw;
  const data = JSON.parse(JSON.stringify(raw));
  data.invalidEntries ||= [];
  data.invalidDescriptionHistory ||= [];
  const obsolete = ('chapterStatus documentType chapterKey chapterIndex chapterNo chapterTitle draftKey draftIndex draftNo draftTitle contentPath descriptionMeta resolvedAt resolvedFromDraft orphanedAt orphanedFromDraft missingDocumentAt missingDocumentMeta missingNameMentionAt missingNameMentionMeta sourceState namingSourceState originSource sourceHistory chapterSavedAt draftPromotedAt attachedAt chapter_saved_at draft_promoted_at promotedAt promoted_at orphaned_at orphaned_from_draft detachedAt detachedFromDraft missing_document_at missing_document_meta missing_name_mention_at missing_name_mention_meta').split(' ');
  data.entries = (data.entries || []).flatMap((entry, index) => {
    if (!entry || !String(entry.name || '').trim()) { data.invalidEntries.push(entry); return []; }
    const createdAt = entry.createdAt || new Date().toISOString();
    const status = normalizeNamingEntryStatus({
      chapterStatus: entry.chapterStatus || entry.documentType || entry.descriptionMeta?.chapterStatus || entry.descriptionMeta?.documentType,
      chapterKey: entry.chapterKey || entry.draftKey || entry.contentPath || entry.descriptionMeta?.contentPath
    });
    const legacy = { documentType: status, documentKey: (status === 'draft' ? entry.draftKey || entry.chapterKey : entry.chapterKey) || entry.contentPath || entry.descriptionMeta?.contentPath };
    const existing = entry.source && ['chapter', 'draft'].includes(entry.source.documentType) && entry.source.documentKey && registry.find(item => sourcesIdentifySameDocument(item.source, entry.source));
    const match = existing || ((status === 'draft' || status === 'chapter') && registry.find(item => sourcesIdentifySameDocument(item.source, legacy)));
    const source = match ? { ...match.source, attachedAt: existing ? entry.source.attachedAt || createdAt : createdAt } : null;
    if (existing && entry.source.checkedAt) source.checkedAt = entry.source.checkedAt;
    const history = [];
    const rawHistory = Array.isArray(entry.descriptionHistory) ? entry.descriptionHistory : [];
    if (entry.descriptionHistory != null && !Array.isArray(entry.descriptionHistory)) data.invalidDescriptionHistory.push(entry.descriptionHistory);
    for (const item of rawHistory) {
      if (!item || typeof item.description !== 'string') { data.invalidDescriptionHistory.push(item); continue; }
      history.push({ description: item.description, editedAt: item.editedAt || item.updatedAt || createdAt, ...(item.editedBy ? { editedBy: item.editedBy } : {}) });
    }
    if (Array.isArray(entry.invalidDescriptionHistory)) data.invalidDescriptionHistory.push(...entry.invalidDescriptionHistory);
    const migrated = { ...entry, id: entry.id || `name-${Date.now()}-${index}`, categoryId: entry.categoryId || entry.category || 'characters',
      similarNames: normalizeNamingAliases(entry.similarNames || entry.aliases, entry.name), description: String(entry.description ?? entry.details ?? ''),
      descriptionHistory: history.slice(-50), source, createdAt, updatedAt: entry.updatedAt || createdAt };
    obsolete.forEach(key => delete migrated[key]);
    delete migrated.invalidDescriptionHistory;
    return [migrated];
  });
  data.schemaVersion = 2;
  data.migrationReport = { migrated: data.entries.length, unattached: data.entries.filter(entry => !entry.source).length,
    quarantinedEntries: data.invalidEntries.length, quarantinedHistory: data.invalidDescriptionHistory.length };
  for (const key of ['categories', 'hiddenByChapter', 'visibleByChapter', 'detectedByChapter', 'removedCategoryIds']) {
    if (JSON.stringify(raw[key]) !== JSON.stringify(data[key])) throw new Error(`Naming migration changed ${key}`);
  }
  const valid = (raw.entries || []).filter(entry => entry && String(entry.name || '').trim());
  valid.forEach((entry, index) => {
    for (const key of ['id', 'categoryId', 'name', 'description', 'createdAt', 'updatedAt']) {
      if (entry[key] != null && entry[key] !== data.entries[index][key]) throw new Error(`Naming migration changed ${key}`);
    }
  });
  return data;
}

function namingEntryBelongsToDraft(entry, identity) {
  return entry.source?.documentType === 'draft' && sourcesIdentifySameDocument(entry.source, identity);
}

function remapNamesForAdvancedPromotion({ draftIdentity, createdChapters, remainderDraft, promotedAt }) {
  let changed = false;
  for (const entry of namingData.entries) {
    if (!namingEntryBelongsToDraft(entry, draftIdentity)) continue;
    const match = createdChapters.find(item => isNamingEntryUsedInText(entry, item.text));
    entry.source = match ? createNamingSource(match.chapter, 'chapter', match.index, promotedAt)
      : remainderDraft && isNamingEntryUsedInText(entry, remainderDraft.text)
        ? createNamingSource(remainderDraft.draft, 'draft', remainderDraft.index, promotedAt) : null;
    changed = true;
  }
  return changed;
}

function deduplicateNamingDescriptionHistory(entry) {
  if (!Array.isArray(entry.descriptionHistory)) return 0;
  const retained = [];
  let removed = 0;
  for (const item of entry.descriptionHistory) {
    const previous = retained[retained.length - 1];
    // Preserve the first snapshot (including its original dates/metadata).
    // A -> B -> A is a real edit sequence, not a duplicate run.
    if (typeof item?.description === 'string' && previous?.description === item.description) {
      removed++;
    } else {
      retained.push(item);
    }
  }
  if (removed) entry.descriptionHistory = retained;
  return removed;
}

function refreshNamingEntrySource(entry, documents, checkedAt = new Date().toISOString(), matcher = null) {
  const used = item => matcher ? matcher(item.text || '') : isNamingEntryUsedInText(entry, item.text || '');
  const current = documents.find(item => sourcesIdentifySameDocument(entry.source, item.source));
  // A draft is a future-story workspace, so it cannot remain the creation
  // source after the same name has appeared in a saved chapter. Preserve an
  // already-valid chapter source, but promote draft sources to the first
  // matching chapter in story order.
  const firstChapterMatch = entry.source?.documentType === 'draft'
    ? documents.find(item => item.source?.documentType === 'chapter' && used(item))
    : null;
  const match = firstChapterMatch || (current && used(current) ? current : documents.find(used));
  const previous = entry.source;
  entry.source = match ? { ...match.source, checkedAt,
    attachedAt: sourcesIdentifySameDocument(previous, match.source) ? previous.attachedAt || checkedAt : checkedAt } : null;
}

function chapterStorageKey(index = curChap) {
  return chapters[index]?.contentPath || chapterFilePath(index);
}

function currentDescriptionChapterMeta(timestamp = new Date().toISOString()) {
  if (isDraftActive()) {
    const draft = chapterDrafts[curDraft] || {};
    const draftKey = activeEditorStorageKey();
    const draftTitle = activeEditorDisplayTitle();
    return {
      chapterStatus: 'draft',
      documentType: 'draft',
      chapterKey: draftKey,
      chapterIndex: null,
      chapterNo: null,
      chapterTitle: draftTitle,
      draftKey,
      draftIndex: curDraft,
      draftNo: draft.draftNo || curDraft + 1,
      draftTitle,
      contentPath: draft.contentPath || draftKey,
      savedAt: timestamp
    };
  }

  const chapter = chapters[curChap] || {};
  return {
    chapterStatus: 'chapter',
    documentType: 'chapter',
    chapterKey: chapterStorageKey(curChap),
    chapterIndex: curChap,
    chapterNo: chapter.chapterNo || curChap + 1,
    chapterTitle: chapterDisplayTitle(chapter, curChap),
    contentPath: chapter.contentPath || chapterFilePath(curChap),
    savedAt: timestamp
  };
}

function undefinedDescriptionChapterMeta(timestamp = new Date().toISOString()) {
  return {
    chapterStatus: 'undefined',
    documentType: 'undefined',
    chapterKey: '',
    chapterIndex: null,
    chapterNo: null,
    chapterTitle: '',
    draftKey: null,
    draftIndex: null,
    draftNo: null,
    draftTitle: '',
    contentPath: '',
    savedAt: timestamp
  };
}

function migrateLegacyTagsToNaming() {
  const legacyCategoryMap = {
    char: 'characters',
    place: 'places',
    thing: 'objects',
    other: 'groups'
  };
  const entries = [];

  Object.entries(tags || {}).forEach(([legacyKey, tagList]) => {
    if (!Array.isArray(tagList)) return;
    tagList.forEach((tag, index) => {
      const chapterIndex = Number.isInteger(tag.chapIdx) ? tag.chapIdx : curChap;
      entries.push({
        id: `legacy-${legacyKey}-${chapterIndex}-${index}`,
        categoryId: legacyCategoryMap[legacyKey] || 'groups',
        chapterKey: chapterStorageKey(chapterIndex),
        chapterIndex,
        chapterTitle: tag.chap || chapters[chapterIndex]?.title || '',
        name: tag.name,
        description: tag.description || ''
      });
    });
  });

  if (entries.length) {
    namingData = normalizeNamingData(migrateNamingDataset({ ...namingData, schemaVersion: 1, entries }));
    localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingData));
  }
}

function createDefaultPart(index = 0) {
  return {
    no: index + 1,
    title: defaultPartTitle(index),
    synopsis: '',
    createdAt: new Date().toISOString(),
    chapters: index === 0 ? [createDefaultChapter()] : []
  };
}

function normalizeChapter(chapter, index = 0, partIndex = 0, chapterIndex = index) {
  const source = chapter || {};
  const wordVal = Number.isFinite(source._wordCount)
    ? source._wordCount
    : (Number.isFinite(source.wordCount)
      ? source.wordCount
      : (typeof countWordsFromText === 'function' && typeof htmlToCountableText === 'function' && (source.content || source.contentHTML)
        ? countWordsFromText(htmlToCountableText(source.content || source.contentHTML))
        : null));
  return {
    id: source.id || source.no || Date.now() + index,
    title: source.title || `${translations.en.newChapterPrefix} ${index + 1}`,
    content: source.content || source.contentHTML || source.content_html || '',
    notes: Array.isArray(source.notes) ? source.notes : [],
    contentPath: source.contentPath || source.content_path || chapterFilePath(index),
    contentHandle: source.contentHandle || null,
    _contentLoadState: ['loaded', 'failed', 'quarantined'].includes(source._contentLoadState)
      ? source._contentLoadState : (source.content || source.contentHTML || source.content_html ? 'loaded' : 'unloaded'),
    _contentPresented: source._contentPresented === true,
    partIndex: Number.isInteger(source.partIndex) ? source.partIndex : partIndex,
    chapterNo: source.chapterNo || source.no || chapterIndex + 1,
    createdAt: source.createdAt || source.created_at || source.created || new Date().toISOString(),
    ...normalizeEditorDocumentFormatting(source),
    richContentHTML: source.richContentHTML || source.rich_content_html || '',
    editorSettings: source.editorSettings && typeof source.editorSettings === 'object'
      ? { ...source.editorSettings }
      : source.editor_settings && typeof source.editor_settings === 'object'
        ? { ...source.editor_settings }
        : null,
    wordCount: wordVal,
    _wordCount: wordVal,
    _wordCountVerifiedSignature: typeof source._wordCountVerifiedSignature === 'string'
      ? source._wordCountVerifiedSignature
      : ''
  };
}

function normalizeDraft(draft, index = 0) {
  const source = draft || {};
  const wordVal = Number.isFinite(source._wordCount)
    ? source._wordCount
    : (Number.isFinite(source.wordCount)
      ? source.wordCount
      : (typeof countWordsFromText === 'function' && typeof htmlToCountableText === 'function' && (source.content || source.contentHTML)
        ? countWordsFromText(htmlToCountableText(source.content || source.contentHTML))
        : null));
  return {
    id: source.id || Date.now() + index,
    title: source.title || `${text().draftPrefix} ${index + 1}`,
    content: source.content || source.contentHTML || source.content_html || '',
    notes: Array.isArray(source.notes) ? source.notes : [],
    contentPath: source.contentPath || source.content_path || draftFilePath(index),
    contentHandle: source.contentHandle || null,
    _contentLoadState: ['loaded', 'failed', 'quarantined'].includes(source._contentLoadState)
      ? source._contentLoadState : (source.content || source.contentHTML || source.content_html ? 'loaded' : 'unloaded'),
    _contentPresented: source._contentPresented === true,
    draftNo: source.draftNo || source.no || index + 1,
    createdAt: source.createdAt || source.created_at || source.created || new Date().toISOString(),
    ...normalizeEditorDocumentFormatting(source),
    richContentHTML: source.richContentHTML || source.rich_content_html || '',
    editorSettings: source.editorSettings && typeof source.editorSettings === 'object'
      ? { ...source.editorSettings }
      : source.editor_settings && typeof source.editor_settings === 'object'
        ? { ...source.editor_settings }
        : null,
    wordCount: wordVal,
    _wordCount: wordVal,
    _wordCountVerifiedSignature: typeof source._wordCountVerifiedSignature === 'string'
      ? source._wordCountVerifiedSignature
      : ''
  };
}

function normalizeDrafts(drafts = []) {
  return Array.isArray(drafts)
    ? drafts.map((draft, index) => ({ ...normalizeDraft(draft, index), draftNo: index + 1 }))
    : [];
}

function normalizeTrashDraft(draft, index = 0) {
  const source = draft || {};
  const normalizedDraft = normalizeDraft({
    ...source,
    contentPath: source.contentPath || source.content_path || trashDraftFilePath(index)
  }, index);

  return {
    ...normalizedDraft,
    draftNo: source.draftNo || source.no || index + 1,
    deletedAt: source.deletedAt || source.deleted_at || new Date().toISOString(),
    originalDraftNo: source.originalDraftNo || source.original_draft_no || source.draftNo || source.no || index + 1,
    originalContentPath: source.originalContentPath || source.original_content_path || ''
  };
}

function normalizeTrashDrafts(drafts = []) {
  return Array.isArray(drafts)
    ? drafts.map((draft, index) => ({ ...normalizeTrashDraft(draft, index), draftNo: index + 1 }))
    : [];
}

function normalizeChapterEditDraft(draft = {}, fallbackKey = '') {
  const source = draft || {};
  const chapterKey = source.chapterKey || source.chapter_key || fallbackKey;
  const chapterIndex = Number.isInteger(source.chapterIndex) ? source.chapterIndex : null;
  const pathIndex = Number.isInteger(chapterIndex) && chapterIndex >= 0 ? chapterIndex : 0;
  const createdAt = source.createdAt || source.created_at || new Date().toISOString();
  const content = source.content || source.contentHTML || source.content_html || '';
  return {
    id: source.id || `chapter-edit-${Date.now()}`,
    chapterKey,
    chapterIndex,
    title: source.title || source.chapterTitle || '',
    content,
    contentPath: source.contentPath || source.content_path || chapterEditDraftFilePath(pathIndex),
    contentHandle: source.contentHandle || null,
    draftNo: source.draftNo || source.no || pathIndex + 1,
    ...normalizeEditorDocumentFormatting(source),
    richContentHTML: source.richContentHTML || source.rich_content_html || '',
    editorSettings: source.editorSettings && typeof source.editorSettings === 'object'
      ? { ...source.editorSettings }
      : source.editor_settings && typeof source.editor_settings === 'object'
        ? { ...source.editor_settings }
        : null,
    createdAt,
    updatedAt: source.updatedAt || source.updated_at || createdAt,
    lastAutosavedHTML: source.lastAutosavedHTML || source.last_autosaved_html || content,
    lastAutosavedText: source.lastAutosavedText || source.last_autosaved_text || ''
  };
}

function normalizeChapterEditDrafts(data = {}) {
  const rawDrafts = Array.isArray(data)
    ? Object.fromEntries(data.map((draft, index) => [draft?.chapterKey || `draft-${index}`, draft]))
    : data && typeof data === 'object'
      ? data
      : {};

  return Object.fromEntries(
    Object.entries(rawDrafts)
      .filter(([, draft]) => draft && typeof draft === 'object')
      .map(([chapterKey, draft]) => [chapterKey, normalizeChapterEditDraft(draft, chapterKey)])
      .filter(([chapterKey]) => Boolean(chapterKey))
  );
}

function normalizePart(part, index = 0) {
  const source = part || {};
  const rawChapters = Array.isArray(source.chapters) ? source.chapters : [];
  return {
    no: source.no || index + 1,
    title: source.title || defaultPartTitle(index),
    synopsis: source.synopsis || source.description || '',
    createdAt: source.createdAt || source.created_at || source.created || new Date().toISOString(),
    chapters: rawChapters
  };
}

function chaptersFromManifest(manifest = projectManifest) {
  const normalizedManifest = normalizeProjectManifest(manifest || createProjectManifest());
  const flatChapters = [];

  if (!normalizedManifest.parts.length) {
    normalizedManifest.chapters.forEach((chapter, chapterIndex) => {
      flatChapters.push(normalizeChapter(chapter, flatChapters.length, -1, chapterIndex));
    });
    return flatChapters;
  }

  normalizedManifest.parts.forEach((part, partIndex) => {
    part.chapters.forEach((chapter, chapterIndex) => {
      flatChapters.push(normalizeChapter(chapter, flatChapters.length, partIndex, chapterIndex));
    });
  });
  normalizedManifest.chapters.forEach((chapter, chapterIndex) => {
    flatChapters.push(normalizeChapter(chapter, flatChapters.length, -1, chapterIndex));
  });

  return flatChapters;
}
