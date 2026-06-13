(function () {
  const storyInfoCreateIndexPosition = {
    selector: '#story-info-modal',
    gap: 20,
    topOffset: 55,
    leftOffset: 140,
    rightOffset: 0,
    panelWidth: 430,
    viewportPadding: 12
  };
  const storyInfoCreateHomePosition = {
    selector: '#story-info-modal',
    gap: 20,
    topOffset: 50,
    leftOffset: 120,
    rightOffset: 0,
    panelWidth: 430,
    viewportPadding: 12
  };
  const aiConnectionPanelPosition = {
    selector: '#ai-connection-panel',
    gap: 12,
    topOffset: 0,
    leftOffset: -245,
    rightOffset: 0,
    panelWidth: 360,
    viewportPadding: 12
  };
  const panelPositions = {
    storyInfoDetails: {
      selector: '#story-info-modal',
      gap: 25,
      topOffset: -8,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 430,
      viewportPadding: 12
    },
    storyInfoCreateIndex: storyInfoCreateIndexPosition,
    storyInfoCreateHome: storyInfoCreateHomePosition,
    storySummaryMenuPanel: {
      selector: '#storySummaryMenuPanel',
      gap: 25,
      topOffset: null,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 210,
      viewportPadding: 12
    },
    storyLibraryPanel: {
      selector: '#storyLibraryPanel',
      gap: 8,
      topOffset: 10,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 250,
      viewportPadding: 12
    },
    projectDetailsStoryLibraryPanel: {
      selector: '#projectDetailsStoryLibraryPanel',
      gap: 8,
      topOffset: 10,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 310,
      viewportPadding: 12
    },
    homeRecentProjectsPanel: {
      selector: '#homeRecentProjectsModal',
      gap: 20,
      topOffset: 50,
      leftOffset: 120,
      rightOffset: 0,
      panelWidth: 430,
      viewportPadding: 12
    },
    projectDetailsNameFilterPanel: {
      selector: '#projectDetailsNameFilterPanel',
      gap: 8,
      topOffset: 6,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 318,
      viewportPadding: 12
    },
    projectDetailsNameSortPanel: {
      selector: '#projectDetailsNameSortPanel',
      gap: 8,
      topOffset: 6,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 235,
      viewportPadding: 12
    },
    themeModePanel: {
      selector: '#themeModePanel',
      gap: 8,
      topOffset: 10,
      leftOffset: 60,
      rightOffset: 0,
      panelWidth: 184,
      viewportPadding: 10
    },
    aiConnectionPanel: aiConnectionPanelPosition,
    partDetailsPanel: {
      selector: '#partDetailsPanel',
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    },
    chapterDetailsPanel: {
      selector: '#chapterDetailsPanel',
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    },
    draftActionsPanel: {
      selector: '#draftDetailsPanel.draft-actions-panel:not(.draft-delete-confirm-panel):not(.chapter-to-draft-panel):not(.draft-promote-destination-panel)',
      gap: 15,
      topOffset: -15,
      leftOffset: 0,
      rightOffset: 0
    },
    draftDeleteConfirmPanel: {
      selector: '#draftDetailsPanel.draft-delete-confirm-panel',
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    },
    chapterToDraftPanel: {
      selector: '#draftDetailsPanel.chapter-to-draft-panel',
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    },
    draftPromoteDestinationPanel: {
      selector: '#draftDetailsPanel.draft-promote-destination-panel',
      gap: 15,
      topOffset: 50,
      leftOffset: 50,
      rightOffset: 0
    },
    draftActionPromoteDestinationPanel: {
      selector: '#draftDetailsPanel.draft-promote-destination-panel',
      gap: 15,
      topOffset: -60,
      leftOffset: -300,
      rightOffset: 0
    },
    editorPromoteDestinationPanel: {
      selector: '#draftDetailsPanel.draft-promote-destination-panel',
      gap: 15,
      topOffset: 50,
      leftOffset: 50,
      rightOffset: 0
    },
    categoryInputPanel: {
      selector: '#categoryInputPanel',
      gap: 15,
      topOffset: -70,
      leftOffset: 350,
      rightOffset: 0
    },
    categoryActionPanel: {
      selector: '#categoryActionPanel.category-action-card-panel',
      gap: 0,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 10
    },
    categoryManagerPanel: {
      selector: '#categoryActionPanel.category-manager-panel',
      gap: 18,
      topOffset: 0,
      leftOffset: 10,
      rightOffset: 0
    },
    categoryInfoPopover: {
      selector: '#categoryInfoPopover',
      anchorSide: 'right',
      gap: 20,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 300
    },
    namingEntryDescriptionPopover: {
      selector: '#namingEntryDescriptionPopover',
      placement: 'right',
      alignment: 'start',
      gap: 12,
      offsetX: 0,
      offsetY: 0,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0,
      viewportPadding: 12,
      clampMode: 'viewport',
      offsetMode: 'afterClamp',
      preserveAnchorGap: true
    },
    nameDetailPanel: {
      selector: '#nameDetailPanel',
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    },
    factDetailPanel: {
      selector: '#factDetailPanel',
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    },
    focusChapterContextPanel: window.lmFocusPanelPositionConfig?.('focusChapterContextPanel', {
      selector: '#focusChapterContextPanel',
      gap: 16,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 315,
      viewportPadding: 12
    }) || {
      selector: '#focusChapterContextPanel',
      gap: 16,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 315,
      viewportPadding: 12
    },
    focusFactsPanel: window.lmFocusPanelPositionConfig?.('focusFactsPanel', {
      selector: '#focusFactsPanel',
      gap: 16,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 315,
      viewportPadding: 12
    }) || {
      selector: '#focusFactsPanel',
      gap: 16,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 315,
      viewportPadding: 12
    }
  };

  const variantOrder = [
    'draftActionPromoteDestinationPanel',
    'editorPromoteDestinationPanel',
    'draftPromoteDestinationPanel',
    'chapterToDraftPanel',
    'draftDeleteConfirmPanel',
    'draftActionsPanel',
    'categoryManagerPanel',
    'categoryActionPanel',
    'categoryInfoPopover',
    'namingEntryDescriptionPopover',
    'storySummaryMenuPanel',
    'storyLibraryPanel',
    'projectDetailsStoryLibraryPanel',
    'homeRecentProjectsPanel',
    'projectDetailsNameFilterPanel',
    'projectDetailsNameSortPanel',
    'themeModePanel',
    'aiConnectionPanel',
    'partDetailsPanel',
    'chapterDetailsPanel',
    'categoryInputPanel',
    'nameDetailPanel',
    'factDetailPanel',
    'focusChapterContextPanel',
    'focusFactsPanel'
  ];

  const draggableExcludedIds = [
    'floating-tools',
    'find-bar',
    'namingEntryPanel',
    'factComposerPanel',
    'categoryInputPanel'
  ];

  function panelNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function resolvePanelPositionKey(target, context = {}) {
    if (context.positionKey) return context.positionKey;
    if (typeof target === 'string') return target;
    if (!target) return '';
    if (target.dataset?.positionKey) return target.dataset.positionKey;
    for (const key of variantOrder) {
      const selector = panelPositions[key]?.selector;
      if (selector && target.matches?.(selector)) return key;
    }
    return target.id || '';
  }

  function isPanelPositionConfigExcluded(target) {
    const id = typeof target === 'string' ? target : target?.id;
    return Boolean(id && draggableExcludedIds.includes(id));
  }

  function floatingPanelPositionConfig(target, fallback = {}, context = {}) {
    const key = resolvePanelPositionKey(target, context);
    if (isPanelPositionConfigExcluded(target)) {
      return { ...fallback, __positionConfigExcluded: true };
    }
    return {
      ...fallback,
      ...(panelPositions[key] || {})
    };
  }

  function applyFloatingPanelPositionOffsets(position, target, fallback = {}, context = {}) {
    const config = floatingPanelPositionConfig(target, fallback, context);
    if (config.__positionConfigExcluded) return position;
    return {
      left: position.left + panelNumber(config.leftOffset, 0) - panelNumber(config.rightOffset, 0),
      top: position.top + panelNumber(config.topOffset, 0)
    };
  }

  window.LEKHAK_FLOATING_PANEL_POSITIONS = {
    panelPositions,
    variantOrder,
    draggableExcludedIds
  };
  window.lmPanelNumber = panelNumber;
  window.lmFloatingPanelPositionConfig = floatingPanelPositionConfig;
  window.lmApplyFloatingPanelPositionOffsets = applyFloatingPanelPositionOffsets;
  window.lmIsFloatingPanelPositionConfigExcluded = isPanelPositionConfigExcluded;
})();
