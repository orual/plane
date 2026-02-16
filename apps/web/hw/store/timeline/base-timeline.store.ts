/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */

import { isEqual, set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// components
import type {
  ChartDataType,
  IBlockUpdateDependencyData,
  IGanttBlock,
  TGanttViews,
  EGanttBlockType,
} from "@plane/types";
import { renderFormattedPayloadDate } from "@plane/utils";
import { currentViewDataWithView } from "@/components/gantt-chart/data";
import {
  getDateFromPositionOnGantt,
  getItemPositionWidth,
  getPositionFromDate,
} from "@/components/gantt-chart/views/helpers";
// helpers
import type { ConflictInfo } from "../../helpers/dependency-conflict";
import { detectDependencyConflicts } from "../../helpers/dependency-conflict";
import { computeCpm } from "../../helpers/cpm-calculator";
import type { CpmResultMap } from "../../helpers/cpm-calculator";
// store
import type { RootStore } from "@/plane-web/store/root.store";

// types
type BlockData = {
  id: string;
  name: string;
  sort_order: number | null;
  start_date?: string | undefined | null;
  target_date?: string | undefined | null;
  project_id?: string | undefined | null;
};

export interface IBaseTimelineStore {
  // observables
  blocksMap: Record<string, IGanttBlock>;
  blockIds: string[] | undefined;
  currentView: TGanttViews;
  currentViewData: ChartDataType | undefined;
  activeBlockId: string | null;
  renderView: any;
  isDragging: boolean;
  isDependencyEnabled: boolean;
  previewBlockIds: Set<string>;
  dependencyDragState: {
    isDragging: boolean;
    sourceBlockId: string | null;
    sourceEndpoint: "left" | "right" | null;
    cursorX: number;
    cursorY: number;
    hoveredTargetBlockId: string | null;
    hoveredTargetEndpoint: "left" | "right" | null;
    isValidTarget: boolean;
  };
  cpmEnabled: boolean;
  crossProjectCpmEnabled: boolean;
  isDraggingBlock: boolean;
  //
  setBlockIds: (ids: string[]) => void;
  getBlockById: (blockId: string) => IGanttBlock;
  // computed functions
  getIsCurrentDependencyDragging: (blockId: string) => boolean;
  isBlockActive: (blockId: string) => boolean;
  getDependencyConflicts: (blockId: string) => Array<ConflictInfo>;
  hasConflict: (blockId: string) => boolean;
  cpmResults: CpmResultMap;
  isCritical: (blockId: string) => boolean;
  getSlack: (blockId: string) => number;
  getComputedDates: (blockId: string) => { start_date: string; target_date: string } | null;
  // actions
  updateCurrentView: (view: TGanttViews) => void;
  updateCurrentViewData: (data: ChartDataType | undefined) => void;
  updateActiveBlockId: (blockId: string | null) => void;
  updateRenderView: (data: any) => void;
  updateAllBlocksOnChartChangeWhileDragging: (addedWidth: number) => void;
  getUpdatedPositionAfterDrag: (
    id: string,
    shouldUpdateHalfBlock: boolean,
    ignoreDependencies?: boolean
  ) => IBlockUpdateDependencyData[];
  updateBlockPosition: (id: string, deltaLeft: number, deltaWidth: number, ignoreDependencies?: boolean) => void;
  getNumberOfDaysFromPosition: (position: number | undefined) => number | undefined;
  setIsDragging: (isDragging: boolean) => void;
  initGantt: () => void;
  startDependencyDrag: (blockId: string, endpoint: "left" | "right") => void;
  updateDependencyDragCursor: (x: number, y: number) => void;
  setDependencyDragTarget: (blockId: string | null, endpoint: "left" | "right" | null, isValid: boolean) => void;
  endDependencyDrag: () => void;
  computePreviewPositions: (draggedBlockId: string) => void;
  clearPreviewPositions: () => void;
  setCpmEnabled: (enabled: boolean) => void;
  setCrossProjectCpmEnabled: (enabled: boolean) => void;
  setDraggingBlock: (dragging: boolean) => void;

  getDateFromPositionOnGantt: (position: number, offsetDays: number) => Date | undefined;
  getPositionFromDateOnGantt: (date: string | Date, offSetWidth: number) => number | undefined;
}

export class BaseTimeLineStore implements IBaseTimelineStore {
  blocksMap: Record<string, IGanttBlock> = {};
  blockIds: string[] | undefined = undefined;

  isDragging: boolean = false;
  currentView: TGanttViews = "week";
  currentViewData: ChartDataType | undefined = undefined;
  activeBlockId: string | null = null;
  renderView: any = [];
  previewBlockIds: Set<string> = new Set();

  rootStore: RootStore;

  isDependencyEnabled = false;
  cpmEnabled = false;
  crossProjectCpmEnabled = false;
  isDraggingBlock = false;

  // Cache for CPM results during drag to avoid expensive recomputation
  private _lastCpmResults: CpmResultMap = new Map();

  // Dependency drag state
  dependencyDragState: {
    isDragging: boolean;
    sourceBlockId: string | null;
    sourceEndpoint: "left" | "right" | null;
    cursorX: number;
    cursorY: number;
    hoveredTargetBlockId: string | null;
    hoveredTargetEndpoint: "left" | "right" | null;
    isValidTarget: boolean;
  } = {
    isDragging: false,
    sourceBlockId: null,
    sourceEndpoint: null,
    cursorX: 0,
    cursorY: 0,
    hoveredTargetBlockId: null,
    hoveredTargetEndpoint: null,
    isValidTarget: false,
  };

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      blocksMap: observable,
      blockIds: observable,
      isDragging: observable.ref,
      currentView: observable.ref,
      currentViewData: observable,
      activeBlockId: observable.ref,
      renderView: observable,
      previewBlockIds: observable,
      dependencyDragState: observable.deep,
      cpmEnabled: observable,
      crossProjectCpmEnabled: observable,
      isDraggingBlock: observable,
      // computed
      cpmResults: computed,
      // actions
      setIsDragging: action,
      setBlockIds: action.bound,
      initGantt: action.bound,
      updateCurrentView: action.bound,
      updateCurrentViewData: action.bound,
      updateActiveBlockId: action.bound,
      updateRenderView: action.bound,
      startDependencyDrag: action.bound,
      updateDependencyDragCursor: action.bound,
      setDependencyDragTarget: action.bound,
      endDependencyDrag: action.bound,
      computePreviewPositions: action.bound,
      clearPreviewPositions: action.bound,
      setCpmEnabled: action,
      setCrossProjectCpmEnabled: action,
      setDraggingBlock: action,
    });

    this.initGantt();

    this.rootStore = _rootStore;
  }

  /**
   * Update Block Ids to derive blocks from
   * @param ids
   */
  setBlockIds = (ids: string[]) => {
    this.blockIds = ids;
  };

  /**
   * setIsDragging
   * @param isDragging
   */
  setIsDragging = (isDragging: boolean) => {
    runInAction(() => {
      this.isDragging = isDragging;
    });
  };

  /**
   * @description check if block is active
   * @param {string} blockId
   */
  isBlockActive = computedFn((blockId: string): boolean => this.activeBlockId === blockId);

  /**
   * @description update current view
   * @param {TGanttViews} view
   */
  updateCurrentView = (view: TGanttViews) => {
    this.currentView = view;
  };

  /**
   * @description update current view data
   * @param {ChartDataType | undefined} data
   */
  updateCurrentViewData = (data: ChartDataType | undefined) => {
    runInAction(() => {
      this.currentViewData = data;
    });
  };

  /**
   * @description update active block
   * @param {string | null} block
   */
  updateActiveBlockId = (blockId: string | null) => {
    this.activeBlockId = blockId;
  };

  /**
   * @description update render view
   * @param {any[]} data
   */
  updateRenderView = (data: any[]) => {
    this.renderView = data;
  };

  /**
   * @description initialize gantt chart with month view
   */
  initGantt = () => {
    const newCurrentViewData = currentViewDataWithView(this.currentView);

    runInAction(() => {
      this.currentViewData = newCurrentViewData;
      this.blocksMap = {};
      this.blockIds = undefined;
    });
  };

  /** Gets Block from Id */
  getBlockById = computedFn((blockId: string) => this.blocksMap[blockId]);

  /**
   * updates the BlocksMap from blockIds
   * @param getDataById
   * @returns
   */
  updateBlocks(getDataById: (id: string) => BlockData | undefined | null, type?: EGanttBlockType, index?: number) {
    if (!this.blockIds || !Array.isArray(this.blockIds) || this.isDragging) return true;

    const updatedBlockMaps: { path: string[]; value: any }[] = [];
    const newBlocks: IGanttBlock[] = [];

    // Loop through blockIds to generate blocks Data
    for (const blockId of this.blockIds) {
      const blockData = getDataById(blockId);
      if (!blockData) continue;

      const block: IGanttBlock = {
        data: blockData,
        id: blockData?.id,
        name: blockData.name,
        sort_order: blockData?.sort_order ?? undefined,
        start_date: blockData?.start_date ?? undefined,
        target_date: blockData?.target_date ?? undefined,
        meta: {
          type,
          index,
          project_id: blockData?.project_id,
        },
      };
      // Inject computed dates for dateless blocks when CPM is enabled
      if (this.cpmEnabled && !block.start_date && !block.target_date) {
        const computedDates = this.getComputedDates(blockId);
        if (computedDates) {
          block.start_date = computedDates.start_date;
          block.target_date = computedDates.target_date;
          block.dateSource = "computed";
        }
      }
      if (this.currentViewData && (this.currentViewData?.data?.startDate || this.currentViewData?.data?.dayWidth)) {
        block.position = getItemPositionWidth(this.currentViewData, block);
      }

      // create block updates if the block already exists, or push them to newBlocks
      if (this.blocksMap[blockId]) {
        for (const key of Object.keys(block)) {
          const currValue = this.blocksMap[blockId][key as keyof IGanttBlock];
          const nextValue = block[key as keyof IGanttBlock];
          if (!isEqual(currValue, nextValue)) {
            updatedBlockMaps.push({ path: [blockId, key], value: nextValue });
          }
        }
      } else {
        newBlocks.push(block);
      }
    }

    // update the store with the block updates
    runInAction(() => {
      for (const updatedBlock of updatedBlockMaps) {
        set(this.blocksMap, updatedBlock.path, updatedBlock.value);
      }

      for (const newBlock of newBlocks) {
        set(this.blocksMap, [newBlock.id], newBlock);
      }
    });
  }

  /**
   * returns number of days that the position pixels span across the timeline chart
   * @param position
   * @returns
   */
  getNumberOfDaysFromPosition = (position: number | undefined) => {
    if (!this.currentViewData || !position) return;

    return Math.round(position / this.currentViewData.data.dayWidth);
  };

  /**
   * returns position of the date on chart
   */
  getPositionFromDateOnGantt = computedFn((date: string | Date, offSetWidth: number) => {
    if (!this.currentViewData) return;

    return getPositionFromDate(this.currentViewData, date, offSetWidth);
  });

  /**
   * returns the date at which the position corresponds to on the timeline chart
   */
  getDateFromPositionOnGantt = computedFn((position: number, offsetDays: number) => {
    if (!this.currentViewData) return;

    return getDateFromPositionOnGantt(position, this.currentViewData, offsetDays);
  });

  /**
   * Adds width on Chart position change while the blocks are being dragged
   * @param addedWidth
   */
  updateAllBlocksOnChartChangeWhileDragging = action((addedWidth: number) => {
    if (!this.blockIds || !this.isDragging) return;

    runInAction(() => {
      this.blockIds?.forEach((blockId) => {
        const currBlock = this.blocksMap[blockId];

        if (!currBlock || !currBlock.position) return;

        currBlock.position.marginLeft += addedWidth;
      });
    });
  });

  /**
   * returns updates dates of blocks post drag.
   * @param id
   * @param shouldUpdateHalfBlock if is a half block then update the incomplete block only if this is true
   * @returns
   */
  getUpdatedPositionAfterDrag = action((id: string, shouldUpdateHalfBlock: boolean) => {
    const currBlock = this.blocksMap[id];

    if (!currBlock?.position || !this.currentViewData) return [];

    const updatePayload: IBlockUpdateDependencyData = { id, meta: currBlock.meta };

    // If shouldUpdateHalfBlock or the start date is available then update start date
    if (shouldUpdateHalfBlock || currBlock.start_date) {
      updatePayload.start_date = renderFormattedPayloadDate(
        getDateFromPositionOnGantt(currBlock.position.marginLeft, this.currentViewData)
      );
    }
    // If shouldUpdateHalfBlock or the target date is available then update target date
    if (shouldUpdateHalfBlock || currBlock.target_date) {
      updatePayload.target_date = renderFormattedPayloadDate(
        getDateFromPositionOnGantt(currBlock.position.marginLeft + currBlock.position.width, this.currentViewData, -1)
      );
    }

    return [updatePayload];
  });

  /**
   * updates the block's position such as marginLeft and width while dragging
   * @param id
   * @param deltaLeft
   * @param deltaWidth
   * @returns
   */
  updateBlockPosition = action((id: string, deltaLeft: number, deltaWidth: number) => {
    const currBlock = this.blocksMap[id];

    if (!currBlock?.position) return;

    const newMarginLeft = currBlock.position.marginLeft + deltaLeft;
    const newWidth = currBlock.position.width + deltaWidth;

    runInAction(() => {
      set(this.blocksMap, [id, "position"], {
        marginLeft: newMarginLeft ?? currBlock.position?.marginLeft,
        width: newWidth ?? currBlock.position?.width,
      });
    });
  });

  /**
   * @description check if the current block's dependency is being dragged
   * @param {string} blockId
   */
  getIsCurrentDependencyDragging = computedFn(
    (blockId: string) => this.dependencyDragState.isDragging && this.dependencyDragState.sourceBlockId === blockId
  );

  /**
   * @description start a dependency drag operation
   * @param {string} blockId the source block ID
   * @param {("left" | "right")} endpoint the endpoint ("left" or "right")
   */
  startDependencyDrag = (blockId: string, endpoint: "left" | "right") => {
    runInAction(() => {
      this.dependencyDragState.isDragging = true;
      this.dependencyDragState.sourceBlockId = blockId;
      this.dependencyDragState.sourceEndpoint = endpoint;
      this.dependencyDragState.cursorX = 0;
      this.dependencyDragState.cursorY = 0;
      this.dependencyDragState.hoveredTargetBlockId = null;
      this.dependencyDragState.hoveredTargetEndpoint = null;
      this.dependencyDragState.isValidTarget = false;
    });
  };

  /**
   * @description update cursor position during dependency drag
   * @param {number} x cursor x coordinate
   * @param {number} y cursor y coordinate
   */
  updateDependencyDragCursor = (x: number, y: number) => {
    runInAction(() => {
      this.dependencyDragState.cursorX = x;
      this.dependencyDragState.cursorY = y;
    });
  };

  /**
   * @description set the hovered target block during dependency drag
   * @param {string | null} blockId the target block ID (null if no target)
   * @param {("left" | "right" | null)} endpoint the target endpoint
   * @param {boolean} isValid whether the target is valid
   */
  setDependencyDragTarget = (blockId: string | null, endpoint: "left" | "right" | null, isValid: boolean) => {
    runInAction(() => {
      this.dependencyDragState.hoveredTargetBlockId = blockId;
      this.dependencyDragState.hoveredTargetEndpoint = endpoint;
      this.dependencyDragState.isValidTarget = isValid;
    });
  };

  /**
   * @description end a dependency drag operation and reset state
   */
  endDependencyDrag = () => {
    runInAction(() => {
      this.dependencyDragState.isDragging = false;
      this.dependencyDragState.sourceBlockId = null;
      this.dependencyDragState.sourceEndpoint = null;
      this.dependencyDragState.cursorX = 0;
      this.dependencyDragState.cursorY = 0;
      this.dependencyDragState.hoveredTargetBlockId = null;
      this.dependencyDragState.hoveredTargetEndpoint = null;
      this.dependencyDragState.isValidTarget = false;
    });
  };

  /**
   * @description toggle CPM calculation
   * @param enabled whether to enable CPM calculation
   */
  setCpmEnabled = (enabled: boolean): void => {
    this.cpmEnabled = enabled;
  };

  /**
   * @description toggle cross-project CPM calculation
   * @param enabled whether to enable cross-project CPM
   */
  setCrossProjectCpmEnabled = (enabled: boolean): void => {
    this.crossProjectCpmEnabled = enabled;
  };

  /**
   * @description set drag state to suppress CPM recalculation during drag
   * @param dragging whether a block is currently being dragged
   */
  setDraggingBlock = (dragging: boolean): void => {
    this.isDraggingBlock = dragging;
  };

  /**
   * Find downstream dependents of a block by traversing the relation graph
   * @param blockId the source block ID
   * @param visited set of already-visited block IDs
   * @param depth current traversal depth (max 100)
   * @returns set of downstream dependent block IDs
   */
  private findDownstreamDependents(blockId: string, visited: Set<string> = new Set(), depth: number = 0): Set<string> {
    const dependents = new Set<string>();

    // Depth limit to prevent unbounded traversal
    if (depth >= 100) return dependents;

    // Avoid revisiting nodes
    if (visited.has(blockId)) return dependents;
    visited.add(blockId);

    // Get all relations from the relation store
    const relationMap = this.rootStore.issue.issueDetail.relation.relationMap;
    const issueRelations = relationMap[blockId];

    if (!issueRelations) return dependents;

    // Relation types that affect downstream blocks:
    // - "blocking": A blocks B, so if A moves right, B must move right (A's successors are B's)
    // - "start_before": A starts before B, so if A starts later, B must start later (A's successors are B's)
    // - "finish_before": A finishes before B, so if A finishes later, B must finish later (A's successors are B's)
    // - "implemented_by": A is implemented by B (structural FS), so B must complete after A (B's predecessors include A)

    // For A to have dependents, we look at relations where A is the predecessor:
    // - "blocking": relationMap[A].blocking = [B, C] means A blocks B, C
    // - "start_before": relationMap[A].start_before = [B] means A starts before B
    // - "finish_before": relationMap[A].finish_before = [B] means A finishes before B
    // - "implements": relationMap[A].implements = [B] means A implements B (A is predecessor, B is successor)

    const blockingDependents = issueRelations["blocking"] ?? [];
    const startBeforeDependents = issueRelations["start_before"] ?? [];
    const finishBeforeDependents = issueRelations["finish_before"] ?? [];
    const implementsDependents = issueRelations["implements"] ?? [];

    const allDependents = [
      ...blockingDependents,
      ...startBeforeDependents,
      ...finishBeforeDependents,
      ...implementsDependents,
    ];

    for (const dependent of allDependents) {
      if (!dependents.has(dependent)) {
        dependents.add(dependent);
        // Recursively find dependents of this dependent
        const transitiveDependents = this.findDownstreamDependents(dependent, visited, depth + 1);
        transitiveDependents.forEach((d) => dependents.add(d));
      }
    }

    return dependents;
  }

  /**
   * Compute preview positions for all downstream dependents of a dragged block
   * @param draggedBlockId the block being dragged
   */
  computePreviewPositions = (draggedBlockId: string) => {
    if (!this.currentViewData) return;

    const draggedBlock = this.blocksMap[draggedBlockId];
    if (!draggedBlock || !draggedBlock.position) return;

    // Find all downstream dependents
    const dependents = this.findDownstreamDependents(draggedBlockId);

    // If no dependents, do nothing (AC6.6)
    if (dependents.size === 0) return;

    const dayWidth = this.currentViewData.data.dayWidth;

    runInAction(() => {
      const relationMap = this.rootStore.issue.issueDetail.relation.relationMap;

      // Build a reverse lookup map: targetBlockId -> Set of {relationType, predecessorId}
      // This avoids O(4*N*D) scans per dependent, reducing to O(N) preprocessing + O(D) per dependent
      const reverseLookup: Record<string, Array<{ relationType: string; predecessorId: string }>> = {};

      for (const [predecessorId, relations] of Object.entries(relationMap)) {
        const { blocking = [], start_before = [], finish_before = [], implements: implementsRels = [] } = relations;

        // Add blocking relations
        for (const targetId of blocking) {
          if (!reverseLookup[targetId]) reverseLookup[targetId] = [];
          reverseLookup[targetId].push({ relationType: "blocking", predecessorId });
        }

        // Add start_before relations
        for (const targetId of start_before) {
          if (!reverseLookup[targetId]) reverseLookup[targetId] = [];
          reverseLookup[targetId].push({ relationType: "start_before", predecessorId });
        }

        // Add finish_before relations
        for (const targetId of finish_before) {
          if (!reverseLookup[targetId]) reverseLookup[targetId] = [];
          reverseLookup[targetId].push({ relationType: "finish_before", predecessorId });
        }

        // Add implements relations
        for (const targetId of implementsRels) {
          if (!reverseLookup[targetId]) reverseLookup[targetId] = [];
          reverseLookup[targetId].push({ relationType: "implements", predecessorId });
        }
      }

      for (const dependentId of dependents) {
        const dependentBlock = this.blocksMap[dependentId];
        if (!dependentBlock || !dependentBlock.position) continue;

        // Compute constraints from all predecessors via the reverse lookup
        let maxMarginLeft: number | null = null;
        let maxRightEdge: number | null = null;

        const predecessorList = reverseLookup[dependentId];
        if (!predecessorList) continue;

        for (const { relationType, predecessorId } of predecessorList) {
          const predBlock = this.blocksMap[predecessorId];
          if (!predBlock?.position) continue;

          if (relationType === "blocking" || relationType === "implements") {
            // FS: successor marginLeft = predecessor marginLeft + predecessor width + dayWidth (one day gap)
            const constrainedMarginLeft = predBlock.position.marginLeft + predBlock.position.width + dayWidth;
            if (maxMarginLeft === null || constrainedMarginLeft > maxMarginLeft) {
              maxMarginLeft = constrainedMarginLeft;
            }
          } else if (relationType === "start_before") {
            // SS: successor marginLeft = predecessor marginLeft
            if (maxMarginLeft === null || predBlock.position.marginLeft > maxMarginLeft) {
              maxMarginLeft = predBlock.position.marginLeft;
            }
          } else if (relationType === "finish_before") {
            // FF: successor right edge = predecessor right edge
            const constrainedRightEdge = predBlock.position.marginLeft + predBlock.position.width;
            if (maxRightEdge === null || constrainedRightEdge > maxRightEdge) {
              maxRightEdge = constrainedRightEdge;
            }
          }
        }

        // Update the dependent block position if we have constraints
        if (maxMarginLeft !== null) {
          set(this.blocksMap, [dependentId, "position"], {
            marginLeft: maxMarginLeft,
            width: dependentBlock.position.width,
          });
          this.previewBlockIds.add(dependentId);
        } else if (maxRightEdge !== null) {
          // FF constraint only
          const newMarginLeft = maxRightEdge - dependentBlock.position.width;
          set(this.blocksMap, [dependentId, "position"], {
            marginLeft: newMarginLeft,
            width: dependentBlock.position.width,
          });
          this.previewBlockIds.add(dependentId);
        }
      }
    });
  };

  /**
   * Clear preview positions
   */
  clearPreviewPositions = () => {
    runInAction(() => {
      this.previewBlockIds.clear();
    });
  };

  /**
   * Compute CPM results for the entire block graph.
   * Returns empty map if CPM is disabled.
   * During drag operations, returns cached results to avoid expensive recomputation.
   * Automatically recomputes when block dates or relations change.
   * @returns Map of block IDs to CPM calculation results
   */
  get cpmResults(): CpmResultMap {
    if (!this.cpmEnabled) return new Map();
    if (this.isDraggingBlock) return this._lastCpmResults;

    const relationMap = this.rootStore.issue.issueDetail.relation.relationMap;
    const getIssueDates = (id: string) => {
      const block = this.blocksMap[id];
      if (!block) return undefined;
      return {
        start_date: block.start_date,
        target_date: block.target_date,
      };
    };

    const result = computeCpm(relationMap, getIssueDates);
    this._lastCpmResults = result;
    return result;
  }

  /**
   * Check if a block is on the critical path (zero slack).
   * Uses computedFn for per-block memoization.
   * @param blockId the block to check
   * @returns true if the block has zero slack
   */
  isCritical = computedFn((blockId: string): boolean => {
    const result = this.cpmResults.get(blockId);
    return result?.isCritical ?? false;
  });

  /**
   * Get the total float (slack) for a block in days.
   * Uses computedFn for per-block memoization.
   * @param blockId the block to check
   * @returns slack value in days (0 for blocks not in CPM)
   */
  getSlack = computedFn((blockId: string): number => {
    const result = this.cpmResults.get(blockId);
    return result?.slack ?? 0;
  });

  /**
   * Get computed dates for a dateless block from CPM results.
   * Returns null for dated blocks or blocks not in CPM results.
   * Uses computedFn for per-block memoization.
   * @param blockId the block to check
   * @returns computed start/target dates or null
   */
  getComputedDates = computedFn((blockId: string): { start_date: string; target_date: string } | null => {
    const block = this.blocksMap[blockId];
    if (!block) return null;
    if (block.start_date && block.target_date) return null;

    const result = this.cpmResults.get(blockId);
    if (!result) return null;

    return { start_date: result.es, target_date: result.ef };
  });

  /**
   * Get dependency conflicts for a block
   * Uses computedFn for MobX reactivity — automatically updates when dates or relations change
   * @param blockId the block to check for conflicts
   * @returns array of ConflictInfo objects describing violations, or empty array
   */
  getDependencyConflicts = computedFn((blockId: string): Array<ConflictInfo> => {
    const block = this.blocksMap[blockId];
    if (!block) return [];

    const issueDates = {
      start_date: block.start_date ?? null,
      target_date: block.target_date ?? null,
    };

    // Get the relation map from the issue detail store
    const relationMap = this.rootStore.issue.issueDetail.relation.relationMap;

    // Lookup function to get dates from blocks or issues
    const getIssueDates = (id: string) => {
      // First try to get from blocksMap
      const blockData = this.blocksMap[id];
      if (blockData) {
        return {
          start_date: blockData.start_date ?? null,
          target_date: blockData.target_date ?? null,
        };
      }

      // Fall back to issue store
      const issueData = this.rootStore.issue.issueDetail.issue.getIssueById(id);
      if (issueData) {
        return {
          start_date: issueData.start_date ?? null,
          target_date: issueData.target_date ?? null,
        };
      }

      return undefined;
    };

    return detectDependencyConflicts(blockId, issueDates, relationMap, getIssueDates);
  });

  /**
   * Convenience method to check if a block has any conflicts
   * @param blockId the block to check
   * @returns true if the block has any dependency conflicts
   */
  hasConflict = computedFn((blockId: string): boolean => this.getDependencyConflicts(blockId).length > 0);
}
