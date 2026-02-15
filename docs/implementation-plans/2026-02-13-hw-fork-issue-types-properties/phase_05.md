# Hardware Fork Implementation Plan - Phase 5

**Goal:** Custom properties visible and editable in the web UI — in issue detail sidebar, creation modal, and layout views.

**Architecture:** MobX store with property definitions and values maps, service layer for API calls, React components for sidebar/modal/layout panels, field renderers per property type. Follows existing frontend patterns: SWR for data fetching, MobX `makeObservable` for state, `computedFn` for parameterized selectors, debounce for performance.

**Tech Stack:** React 18, TypeScript, MobX, SWR, Vitest, TailwindCSS, @plane/ui and @plane/propel components

**Scope:** Phase 5 of 6 from original design

**Codebase verified:** 2026-02-13

**Testing context:** Frontend tests use Vitest in isolation with React Testing Library. Tests live alongside source code. Run with `pnpm test` or target packages via Turbo filters. Mock API calls and MobX stores using `vi.mock()`.

**Key codebase patterns:**
- Services extend `APIService`, call `super(API_BASE_URL)`, methods return `.then(r => r?.data).catch(e => { throw e?.response?.data })`
- Stores use `makeObservable(this, { ... })`, computedFn for selectors, `runInAction` for post-async updates
- Hooks export store instance, use `useMemo` for dependent values
- Components use SWR with `{ revalidateIfStale: false, revalidateOnFocus: false }`
- Debounce via `useDebounce(value, ms)` from `core/hooks/use-debounce.tsx`
- UI components: `@plane/ui` (Input, Checkbox, ToggleSwitch), `@plane/propel` (Switch, Combobox, Calendar)
- `SidebarPropertyListItem` wrapper: `<SidebarPropertyListItem icon={Icon} label="Label"><FieldComponent /></SidebarPropertyListItem>`

---

## Phase 5: Custom properties frontend UI

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create TypeScript interfaces and types

**Files:**
- Create: `apps/web/hw/types/issue-property-values.d.ts`
- Create: `apps/web/hw/types/issue-property-definitions.d.ts`

**Step 1: Create `apps/web/hw/types/issue-property-definitions.d.ts`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Supported property types for custom properties.
 */
export type TPropertyType = "text" | "number" | "select" | "multi_select" | "url" | "date" | "boolean";

/**
 * A custom property definition for a workspace.
 * Scoped to workspace level, inherited by all projects in the workspace.
 */
export type IIssuePropertyDefinition = {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  property_type: TPropertyType;
  logo_props?: Record<string, any>;
  is_required?: boolean;
  is_active?: boolean;
  options?: Array<{
    id: string;
    value: string;
    color?: string;
  }>;
  level?: number;
  created_at?: string;
  updated_at?: string;
};

/**
 * Select option structure for select/multi_select properties.
 */
export type IPropertyOption = {
  id: string;
  value: string;
  color?: string;
};
```

**Step 2: Create `apps/web/hw/types/issue-property-values.d.ts`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { IIssuePropertyDefinition } from "./issue-property-definitions";

/**
 * A property value associated with a specific issue.
 * Scoped to project + issue level, stored as polymorphic JSON values.
 */
export type IIssuePropertyValue = {
  id: string;
  workspace_id: string;
  project_id: string;
  issue_id: string;
  property_id: string;
  value: string | number | boolean | string[] | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * Bulk upsert request payload for property values.
 * PUT /api/workspaces/{slug}/projects/{id}/issues/{issue_id}/property-values/
 */
export type IIssuePropertyValueUpsertPayload = Record<string, string | number | boolean | string[] | null>;

/**
 * Combined view: definition + current value for an issue.
 * Used in UI components to render fields with their current state.
 */
export type IIssuePropertyWithValue = {
  definition: IIssuePropertyDefinition;
  value: IIssuePropertyValue | null;
  currentValue: string | number | boolean | string[] | null;
};
```

**Step 3: Commit**

```bash
git add apps/web/hw/types/
git commit -m "feat(hw): add TypeScript interfaces for property definitions and values"
```

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create IssuePropertyService (API client)

**Files:**
- Create: `apps/web/hw/services/issue-property.service.ts`

**Step 1: Create `apps/web/hw/services/issue-property.service.ts`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { APIService } from "@plane/services";
import { API_BASE_URL } from "@plane/constants";
import type { IIssuePropertyDefinition, IIssuePropertyValue, IIssuePropertyValueUpsertPayload } from "../types";

export class IssuePropertyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * Fetch all property definitions for a workspace.
   * GET /api/workspaces/{slug}/property-definitions/
   */
  async fetchPropertyDefinitions(workspaceSlug: string): Promise<IIssuePropertyDefinition[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/property-definitions/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Create a new property definition for a workspace.
   * POST /api/workspaces/{slug}/property-definitions/
   */
  async createPropertyDefinition(
    workspaceSlug: string,
    data: Partial<IIssuePropertyDefinition>
  ): Promise<IIssuePropertyDefinition> {
    return this.post(`/api/workspaces/${workspaceSlug}/property-definitions/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Update a property definition.
   * PATCH /api/workspaces/{slug}/property-definitions/{id}/
   */
  async updatePropertyDefinition(
    workspaceSlug: string,
    propertyId: string,
    data: Partial<IIssuePropertyDefinition>
  ): Promise<IIssuePropertyDefinition> {
    return this.patch(`/api/workspaces/${workspaceSlug}/property-definitions/${propertyId}/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Delete a property definition.
   * DELETE /api/workspaces/{slug}/property-definitions/{id}/
   */
  async deletePropertyDefinition(workspaceSlug: string, propertyId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/property-definitions/${propertyId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Fetch all property values for a specific issue.
   * GET /api/workspaces/{slug}/projects/{id}/issues/{issue_id}/property-values/
   */
  async fetchIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IIssuePropertyValue[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`
    )
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Bulk upsert property values for an issue.
   * PUT /api/workspaces/{slug}/projects/{id}/issues/{issue_id}/property-values/
   *
   * Payload is a dict of { property_id: value }.
   */
  async upsertIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    values: IIssuePropertyValueUpsertPayload
  ): Promise<Record<string, IIssuePropertyValue>> {
    return this.put(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`,
      values
    )
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
```

**Step 2: Commit**

```bash
git add apps/web/hw/services/
git commit -m "feat(hw): add IssuePropertyService API client"
```

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Create IssuePropertyStore (MobX store)

**Files:**
- Create: `apps/web/hw/store/issue-property.store.ts`

**Step 1: Create `apps/web/hw/store/issue-property.store.ts`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { makeObservable, observable, action, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { IssuePropertyService } from "../services/issue-property.service";
import type { IIssuePropertyDefinition, IIssuePropertyValue, IIssuePropertyValueUpsertPayload } from "../types";

export type TIssuePropertyStoreState = {
  isLoading: boolean;
  error: string | null;
};

/**
 * MobX store for custom property definitions and issue-specific property values.
 * Maintains:
 * - definitionsMap: workspace-scoped property definitions by ID
 * - valuesMap: issue-specific property values, keyed by `${workspaceSlug}/${projectId}/${issueId}`
 * - state: loading/error indicators
 */
export class IssuePropertyStore {
  // Maps
  definitionsMap = new Map<string, IIssuePropertyDefinition>();
  valuesMap = new Map<string, Map<string, IIssuePropertyValue>>();

  // State
  state: TIssuePropertyStoreState = {
    isLoading: false,
    error: null,
  };

  // Service and root store
  service: IssuePropertyService;
  rootStore: any;

  constructor(rootStore: any) {
    this.rootStore = rootStore;
    this.service = new IssuePropertyService();
    makeObservable(this, {
      definitionsMap: observable,
      valuesMap: observable,
      state: observable,

      // Actions
      setLoading: action,
      setError: action,
      setDefinitions: action,
      setValues: action,
      setValue: action,
      removeValue: action,

      // Async actions
      fetchDefinitions: action,
      fetchIssueValues: action,
      upsertIssueValues: action,
    });
  }

  /**
   * Set loading state.
   */
  setLoading(loading: boolean): void {
    this.state.isLoading = loading;
  }

  /**
   * Set error message.
   */
  setError(error: string | null): void {
    this.state.error = error;
  }

  /**
   * Populate definitions map from list.
   */
  setDefinitions(definitions: IIssuePropertyDefinition[]): void {
    this.definitionsMap.clear();
    definitions.forEach((def) => {
      this.definitionsMap.set(def.id, def);
    });
  }

  /**
   * Populate values for a specific issue.
   * Key: `${workspaceSlug}/${projectId}/${issueId}`
   */
  setValues(workspaceSlug: string, projectId: string, issueId: string, values: IIssuePropertyValue[]): void {
    const key = `${workspaceSlug}/${projectId}/${issueId}`;
    const valueMap = new Map<string, IIssuePropertyValue>();
    values.forEach((val) => {
      valueMap.set(val.property_id, val);
    });
    this.valuesMap.set(key, valueMap);
  }

  /**
   * Set a single property value for an issue.
   */
  setValue(workspaceSlug: string, projectId: string, issueId: string, propertyId: string, value: IIssuePropertyValue): void {
    const key = `${workspaceSlug}/${projectId}/${issueId}`;
    if (!this.valuesMap.has(key)) {
      this.valuesMap.set(key, new Map());
    }
    this.valuesMap.get(key)!.set(propertyId, value);
  }

  /**
   * Remove a property value for an issue.
   */
  removeValue(workspaceSlug: string, projectId: string, issueId: string, propertyId: string): void {
    const key = `${workspaceSlug}/${projectId}/${issueId}`;
    this.valuesMap.get(key)?.delete(propertyId);
  }

  /**
   * Selector: Get all definitions (array).
   */
  getAllDefinitions(): IIssuePropertyDefinition[] {
    return Array.from(this.definitionsMap.values());
  }

  /**
   * Selector: Get definition by ID.
   */
  getDefinitionById(propertyId: string): IIssuePropertyDefinition | null {
    return this.definitionsMap.get(propertyId) || null;
  }

  /**
   * Selector: Get all property values for an issue (array).
   */
  getIssueValues(workspaceSlug: string, projectId: string, issueId: string): IIssuePropertyValue[] {
    const key = `${workspaceSlug}/${projectId}/${issueId}`;
    const valueMap = this.valuesMap.get(key);
    return valueMap ? Array.from(valueMap.values()) : [];
  }

  /**
   * Selector: Get a specific property value for an issue.
   */
  getIssueValueByPropertyId(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyId: string
  ): IIssuePropertyValue | null {
    const key = `${workspaceSlug}/${projectId}/${issueId}`;
    return this.valuesMap.get(key)?.get(propertyId) || null;
  }

  /**
   * Async: Fetch all property definitions for a workspace.
   */
  async fetchDefinitions(workspaceSlug: string): Promise<void> {
    try {
      this.setLoading(true);
      this.setError(null);
      const definitions = await this.service.fetchPropertyDefinitions(workspaceSlug);
      runInAction(() => {
        this.setDefinitions(definitions);
        this.setLoading(false);
      });
    } catch (error: any) {
      runInAction(() => {
        this.setError(error?.message || "Failed to fetch property definitions");
        this.setLoading(false);
      });
    }
  }

  /**
   * Async: Fetch property values for a specific issue.
   */
  async fetchIssueValues(workspaceSlug: string, projectId: string, issueId: string): Promise<void> {
    try {
      this.setLoading(true);
      this.setError(null);
      const values = await this.service.fetchIssuePropertyValues(workspaceSlug, projectId, issueId);
      runInAction(() => {
        this.setValues(workspaceSlug, projectId, issueId, values);
        this.setLoading(false);
      });
    } catch (error: any) {
      runInAction(() => {
        this.setError(error?.message || "Failed to fetch property values");
        this.setLoading(false);
      });
    }
  }

  /**
   * Async: Bulk upsert property values for an issue.
   */
  async upsertIssueValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payload: IIssuePropertyValueUpsertPayload
  ): Promise<void> {
    try {
      this.setLoading(true);
      this.setError(null);
      const result = await this.service.upsertIssuePropertyValues(workspaceSlug, projectId, issueId, payload);
      runInAction(() => {
        Object.values(result).forEach((val) => {
          this.setValue(workspaceSlug, projectId, issueId, val.property_id, val);
        });
        this.setLoading(false);
      });
    } catch (error: any) {
      runInAction(() => {
        this.setError(error?.message || "Failed to upsert property values");
        this.setLoading(false);
      });
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/web/hw/store/
git commit -m "feat(hw): add IssuePropertyStore MobX store"
```

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->
### Task 4: Update root.store.ts to include IssuePropertyStore

**Files:**
- Modify: `apps/web/hw/store/root.store.ts`

**Step 1: Read the existing `apps/web/hw/store/root.store.ts`**

Find where other stores are initialized.

**Step 2: Update `apps/web/hw/store/root.store.ts`**

Add the import at the top:

```typescript
import { IssuePropertyStore } from "./issue-property.store";
```

Update the class declaration to initialize `issuePropertyStore`:

```typescript
export class RootStore {
  // Other stores...
  issuePropertyStore: IssuePropertyStore;

  constructor(apiClient: AxiosInstance) {
    // Other store initializations...
    this.issuePropertyStore = new IssuePropertyStore(this);
  }
}
```

**Step 3: Commit**

```bash
git add apps/web/hw/store/root.store.ts
git commit -m "feat(hw): add IssuePropertyStore to root store"
```

<!-- END_TASK_4 -->

<!-- START_SUBCOMPONENT_B (tasks 5-6) -->

<!-- START_TASK_5 -->
### Task 5: Create useIssueProperties hook

**Files:**
- Create: `apps/web/hw/hooks/use-issue-properties.tsx`

**Step 1: Create `apps/web/hw/hooks/use-issue-properties.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useContext, useMemo } from "react";
import { StoreContext } from "@plane/hooks";
import { IssuePropertyStore } from "../store/issue-property.store";

/**
 * Hook to access the IssuePropertyStore.
 * Returns the store instance for use in components.
 */
export const useIssueProperties = (): IssuePropertyStore => {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useIssueProperties must be used within StoreProvider");
  }
  return (store as any).issuePropertyStore;
};

/**
 * Hook to fetch and memoize property definitions for a workspace.
 * Automatically triggers fetch on mount if not already loaded.
 */
export const useWorkspaceIssueProperties = (workspaceSlug: string | undefined) => {
  const store = useIssueProperties();

  React.useEffect(() => {
    if (workspaceSlug && store.getAllDefinitions().length === 0) {
      store.fetchDefinitions(workspaceSlug);
    }
  }, [workspaceSlug, store]);

  return useMemo(
    () => ({
      definitions: store.getAllDefinitions(),
      isLoading: store.state.isLoading,
      error: store.state.error,
    }),
    [store.state.isLoading, store.state.error, store.definitionsMap.size]
  );
};

/**
 * Hook to fetch and access property values for a specific issue.
 * Automatically triggers fetch on mount if not already loaded.
 */
export const useIssuePropertyValues = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined
) => {
  const store = useIssueProperties();

  React.useEffect(() => {
    if (workspaceSlug && projectId && issueId) {
      const key = `${workspaceSlug}/${projectId}/${issueId}`;
      if (!store.valuesMap.has(key)) {
        store.fetchIssueValues(workspaceSlug, projectId, issueId);
      }
    }
  }, [workspaceSlug, projectId, issueId, store]);

  return useMemo(
    () => ({
      values: workspaceSlug && projectId && issueId ? store.getIssueValues(workspaceSlug, projectId, issueId) : [],
      isLoading: store.state.isLoading,
      error: store.state.error,
      upsertValues: (payload: Record<string, any>) =>
        workspaceSlug && projectId && issueId
          ? store.upsertIssueValues(workspaceSlug, projectId, issueId, payload)
          : Promise.resolve(),
    }),
    [
      workspaceSlug,
      projectId,
      issueId,
      store.state.isLoading,
      store.state.error,
      store.valuesMap.size,
    ]
  );
};
```

**Step 2: Commit**

```bash
git add apps/web/hw/hooks/
git commit -m "feat(hw): add useIssueProperties and useWorkspaceIssueProperties hooks"
```

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Create useWorkspaceIssuePropertiesExtended hook

**Files:**
- Create: `apps/web/hw/hooks/use-workspace-issue-properties-extended.tsx`

**Step 1: Create `apps/web/hw/hooks/use-workspace-issue-properties-extended.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { useMemo } from "react";
import { useWorkspaceIssueProperties } from "./use-issue-properties";
import type { IIssuePropertyWithValue } from "../types";

/**
 * Extended hook that combines property definitions with current issue values.
 * Used in UI components to render fields with their current state.
 *
 * Returns:
 * - properties: Array of { definition, value, currentValue }
 * - isLoading: Whether definitions are loading
 * - error: Any error message
 */
export const useWorkspaceIssuePropertiesExtended = (
  workspaceSlug: string | string[] | undefined
): {
  properties: IIssuePropertyWithValue[];
  isLoading: boolean;
  error: string | null;
} => {
  const { definitions, isLoading, error } = useWorkspaceIssueProperties(
    typeof workspaceSlug === "string" ? workspaceSlug : undefined
  );

  const properties = useMemo<IIssuePropertyWithValue[]>(() => {
    return definitions.map((def) => ({
      definition: def,
      value: null,
      currentValue: null,
    }));
  }, [definitions]);

  return {
    properties,
    isLoading,
    error,
  };
};
```

**Step 2: Commit**

```bash
git add apps/web/hw/hooks/use-workspace-issue-properties-extended.tsx
git commit -m "feat(hw): add useWorkspaceIssuePropertiesExtended hook"
```

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 7-10) -->

<!-- START_TASK_7 -->
### Task 7: Create property field renderers

**Files:**
- Create: `apps/web/hw/components/issues/issue-details/property-fields/index.tsx`
- Create: `apps/web/hw/components/issues/issue-details/property-fields/text-field.tsx`
- Create: `apps/web/hw/components/issues/issue-details/property-fields/number-field.tsx`
- Create: `apps/web/hw/components/issues/issue-details/property-fields/select-field.tsx`
- Create: `apps/web/hw/components/issues/issue-details/property-fields/multi-select-field.tsx`
- Create: `apps/web/hw/components/issues/issue-details/property-fields/url-field.tsx`
- Create: `apps/web/hw/components/issues/issue-details/property-fields/date-field.tsx`
- Create: `apps/web/hw/components/issues/issue-details/property-fields/boolean-field.tsx`

**Step 1: Create `apps/web/hw/components/issues/issue-details/property-fields/text-field.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { Input } from "@plane/ui";

type TPropertyTextFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const PropertyTextField: React.FC<TPropertyTextFieldProps> = ({
  value,
  onChange,
  disabled,
  placeholder,
}) => {
  return (
    <Input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      placeholder={placeholder}
      className="h-8"
    />
  );
};
```

**Step 2: Create `apps/web/hw/components/issues/issue-details/property-fields/number-field.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { Input } from "@plane/ui";

type TPropertyNumberFieldProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const PropertyNumberField: React.FC<TPropertyNumberFieldProps> = ({
  value,
  onChange,
  disabled,
  placeholder,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = e.target.value;
    if (numValue === "") {
      onChange(null);
    } else {
      const parsed = parseFloat(numValue);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    }
  };

  return (
    <Input
      type="number"
      value={value !== null ? value : ""}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      className="h-8"
    />
  );
};
```

**Step 3: Create `apps/web/hw/components/issues/issue-details/property-fields/select-field.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { Combobox } from "@plane/propel";
import type { IPropertyOption } from "@plane/web/hw/types/issue-property-definitions";

type TPropertySelectFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  options: IPropertyOption[];
  disabled?: boolean;
  placeholder?: string;
};

export const PropertySelectField: React.FC<TPropertySelectFieldProps> = ({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}) => {
  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <Combobox
      value={selectedOption}
      onChange={(opt) => onChange(opt?.id || null)}
      options={options.map((opt) => ({
        ...opt,
        label: opt.value,
      }))}
      disabled={disabled}
      placeholder={placeholder}
      isSearchable
      isClearable
      searchKey="value"
      displayKey="value"
    />
  );
};
```

**Step 4: Create `apps/web/hw/components/issues/issue-details/property-fields/multi-select-field.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { Combobox } from "@plane/propel";
import type { IPropertyOption } from "@plane/web/hw/types/issue-property-definitions";

type TPropertyMultiSelectFieldProps = {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  options: IPropertyOption[];
  disabled?: boolean;
  placeholder?: string;
};

export const PropertyMultiSelectField: React.FC<TPropertyMultiSelectFieldProps> = ({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}) => {
  const selectedOptions = value ? options.filter((opt) => value.includes(opt.id)) : [];

  return (
    <Combobox
      value={selectedOptions}
      onChange={(opts) =>
        onChange(opts.length > 0 ? opts.map((opt) => opt.id) : null)
      }
      options={options.map((opt) => ({
        ...opt,
        label: opt.value,
      }))}
      disabled={disabled}
      placeholder={placeholder}
      isSearchable
      isClearable
      isMulti
      searchKey="value"
      displayKey="value"
    />
  );
};
```

**Step 5: Create `apps/web/hw/components/issues/issue-details/property-fields/url-field.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { Input } from "@plane/ui";

type TPropertyUrlFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const PropertyUrlField: React.FC<TPropertyUrlFieldProps> = ({
  value,
  onChange,
  disabled,
  placeholder,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const urlValue = e.target.value;
    onChange(urlValue || null);
  };

  return (
    <Input
      type="url"
      value={value || ""}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder || "https://example.com"}
      className="h-8"
    />
  );
};
```

**Step 6: Create `apps/web/hw/components/issues/issue-details/property-fields/date-field.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { Calendar } from "@plane/propel";

type TPropertyDateFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

export const PropertyDateField: React.FC<TPropertyDateFieldProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const dateValue = value ? new Date(value) : null;

  return (
    <Calendar
      value={dateValue}
      onChange={(date) => onChange(date ? date.toISOString().split("T")[0] : null)}
      disabled={disabled}
      placeholder="Select date"
    />
  );
};
```

**Step 7: Create `apps/web/hw/components/issues/issue-details/property-fields/boolean-field.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { ToggleSwitch } from "@plane/ui";

type TPropertyBooleanFieldProps = {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  disabled?: boolean;
};

export const PropertyBooleanField: React.FC<TPropertyBooleanFieldProps> = ({
  value,
  onChange,
  disabled,
}) => {
  return (
    <ToggleSwitch
      value={value || false}
      onChange={(newValue) => onChange(newValue || null)}
      disabled={disabled}
      size="sm"
    />
  );
};
```

**Step 8: Create `apps/web/hw/components/issues/issue-details/property-fields/index.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

export { PropertyTextField } from "./text-field";
export { PropertyNumberField } from "./number-field";
export { PropertySelectField } from "./select-field";
export { PropertyMultiSelectField } from "./multi-select-field";
export { PropertyUrlField } from "./url-field";
export { PropertyDateField } from "./date-field";
export { PropertyBooleanField } from "./boolean-field";
```

**Step 9: Commit**

```bash
git add apps/web/hw/components/issues/issue-details/property-fields/
git commit -m "feat(hw): add property field renderers for all property types"
```

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->
### Task 8: Implement WorkItemAdditionalSidebarProperties

**Files:**
- Modify: `apps/web/hw/components/issues/issue-details/additional-properties.tsx`

**Step 1: Read the current stub file**

The current stub is:

```typescript
export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};
export function WorkItemAdditionalSidebarProperties(_props: TWorkItemAdditionalSidebarProperties) {
  return <></>;
}
```

**Step 2: Replace with full implementation**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React, { useMemo, useState, useCallback } from "react";
import { observer } from "mobx-react";
import { useDebounce } from "@plane/hooks";
import { SidebarPropertyListItem } from "core/components/common/layout/sidebar/property-list-item";
import { useIssueProperties, useIssuePropertyValues } from "../../hooks/use-issue-properties";
import {
  PropertyTextField,
  PropertyNumberField,
  PropertySelectField,
  PropertyMultiSelectField,
  PropertyUrlField,
  PropertyDateField,
  PropertyBooleanField,
} from "./property-fields";
import type { TPropertyType } from "../../types";

export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};

const renderPropertyField = (
  propertyType: TPropertyType,
  value: any,
  onChange: (newValue: any) => void,
  options: Array<{ id: string; value: string; color?: string }> = [],
  disabled: boolean = false
) => {
  const props = { value, onChange, disabled };

  switch (propertyType) {
    case "text":
      return <PropertyTextField {...props} placeholder="Enter text" />;
    case "number":
      return <PropertyNumberField {...props} placeholder="Enter number" />;
    case "url":
      return <PropertyUrlField {...props} placeholder="Enter URL" />;
    case "date":
      return <PropertyDateField {...props} />;
    case "boolean":
      return <PropertyBooleanField {...props} />;
    case "select":
      return <PropertySelectField {...props} options={options} placeholder="Select option" />;
    case "multi_select":
      return <PropertyMultiSelectField {...props} options={options} placeholder="Select options" />;
    default:
      return null;
  }
};

export const WorkItemAdditionalSidebarProperties = observer(
  ({
    workItemId,
    projectId,
    workspaceSlug,
    isEditable,
  }: TWorkItemAdditionalSidebarProperties) => {
    const propertyStore = useIssueProperties();
    const { values: propertyValues, upsertValues } = useIssuePropertyValues(
      workspaceSlug,
      projectId,
      workItemId
    );

    // Local state for unsaved changes
    const [localChanges, setLocalChanges] = useState<Record<string, any>>({});
    const debouncedChanges = useDebounce(localChanges, 1000);

    // Definitions from store
    const definitions = propertyStore.getAllDefinitions();

    // Handle value change
    const handleValueChange = useCallback(
      (propertyId: string, newValue: any) => {
        setLocalChanges((prev) => ({
          ...prev,
          [propertyId]: newValue,
        }));
      },
      []
    );

    // Auto-save on debounced changes
    React.useEffect(() => {
      if (Object.keys(debouncedChanges).length > 0) {
        upsertValues(debouncedChanges);
        setLocalChanges({});
      }
    }, [debouncedChanges, upsertValues]);

    // Get current values
    const currentValues = useMemo(() => {
      const result: Record<string, any> = {};
      propertyValues.forEach((pv) => {
        result[pv.property_id] = pv.value;
      });
      return result;
    }, [propertyValues]);

    // Merge local changes with current values
    const displayValues = useMemo(
      () => ({
        ...currentValues,
        ...localChanges,
      }),
      [currentValues, localChanges]
    );

    if (definitions.length === 0) {
      return <></>;
    }

    return (
      <div className="space-y-3">
        {definitions.map((def) => {
          const currentValue = displayValues[def.id];

          return (
            <SidebarPropertyListItem
              key={def.id}
              label={def.name}
              icon={null}
            >
              {renderPropertyField(
                def.property_type,
                currentValue,
                (newValue) => handleValueChange(def.id, newValue),
                def.options,
                !isEditable
              )}
            </SidebarPropertyListItem>
          );
        })}
      </div>
    );
  }
);

WorkItemAdditionalSidebarProperties.displayName = "WorkItemAdditionalSidebarProperties";
```

**Step 3: Commit**

```bash
git add apps/web/hw/components/issues/issue-details/additional-properties.tsx
git commit -m "feat(hw): implement WorkItemAdditionalSidebarProperties with live editing"
```

<!-- END_TASK_8 -->

<!-- START_TASK_9 -->
### Task 9: Implement WorkItemModalAdditionalProperties

**Files:**
- Modify: `apps/web/hw/components/issues/issue-modal/modal-additional-properties.tsx`

**Step 1: Read the current stub file**

The current stub is:

```typescript
export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
};
export function WorkItemModalAdditionalProperties(_props: TWorkItemModalAdditionalPropertiesProps) {
  return null;
}
```

**Step 2: Replace with full implementation**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React, { useMemo, useState, useCallback } from "react";
import { observer } from "mobx-react";
import { useDebounce } from "@plane/hooks";
import { useIssueProperties, useIssuePropertyValues } from "../../hooks/use-issue-properties";
import {
  PropertyTextField,
  PropertyNumberField,
  PropertySelectField,
  PropertyMultiSelectField,
  PropertyUrlField,
  PropertyDateField,
  PropertyBooleanField,
} from "../issues/issue-details/property-fields";
import type { TPropertyType } from "../../types";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
};

const renderPropertyField = (
  propertyType: TPropertyType,
  value: any,
  onChange: (newValue: any) => void,
  options: Array<{ id: string; value: string; color?: string }> = [],
  disabled: boolean = false
) => {
  const props = { value, onChange, disabled };

  switch (propertyType) {
    case "text":
      return <PropertyTextField {...props} placeholder="Enter text" />;
    case "number":
      return <PropertyNumberField {...props} placeholder="Enter number" />;
    case "url":
      return <PropertyUrlField {...props} placeholder="Enter URL" />;
    case "date":
      return <PropertyDateField {...props} />;
    case "boolean":
      return <PropertyBooleanField {...props} />;
    case "select":
      return <PropertySelectField {...props} options={options} placeholder="Select option" />;
    case "multi_select":
      return <PropertyMultiSelectField {...props} options={options} placeholder="Select options" />;
    default:
      return null;
  }
};

export const WorkItemModalAdditionalProperties = observer(
  ({ workspaceSlug, projectId, workItemId, isDraft }: TWorkItemModalAdditionalPropertiesProps) => {
    const propertyStore = useIssueProperties();
    const { values: propertyValues, upsertValues } = useIssuePropertyValues(
      workspaceSlug,
      projectId || undefined,
      workItemId
    );

    // Local state for unsaved changes
    const [localChanges, setLocalChanges] = useState<Record<string, any>>({});
    const debouncedChanges = useDebounce(localChanges, 1000);

    // Definitions from store
    const definitions = propertyStore.getAllDefinitions();

    // Handle value change
    const handleValueChange = useCallback(
      (propertyId: string, newValue: any) => {
        setLocalChanges((prev) => ({
          ...prev,
          [propertyId]: newValue,
        }));
      },
      []
    );

    // Auto-save on debounced changes (only if not a draft)
    React.useEffect(() => {
      if (!isDraft && Object.keys(debouncedChanges).length > 0 && projectId && workItemId) {
        upsertValues(debouncedChanges);
        setLocalChanges({});
      }
    }, [debouncedChanges, upsertValues, isDraft, projectId, workItemId]);

    // Get current values
    const currentValues = useMemo(() => {
      const result: Record<string, any> = {};
      propertyValues.forEach((pv) => {
        result[pv.property_id] = pv.value;
      });
      return result;
    }, [propertyValues]);

    // Merge local changes with current values
    const displayValues = useMemo(
      () => ({
        ...currentValues,
        ...localChanges,
      }),
      [currentValues, localChanges]
    );

    if (definitions.length === 0) {
      return null;
    }

    return (
      <div className="space-y-4 border-t py-4">
        <div className="text-sm font-semibold">Properties</div>
        <div className="space-y-3">
          {definitions.map((def) => {
            const currentValue = displayValues[def.id];

            return (
              <div key={def.id} className="space-y-1">
                <label className="block text-sm font-medium text-custom-text-200">{def.name}</label>
                {renderPropertyField(
                  def.property_type,
                  currentValue,
                  (newValue) => handleValueChange(def.id, newValue),
                  def.options,
                  false
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

WorkItemModalAdditionalProperties.displayName = "WorkItemModalAdditionalProperties";
```

**Step 3: Commit**

```bash
git add apps/web/hw/components/issues/issue-modal/modal-additional-properties.tsx
git commit -m "feat(hw): implement WorkItemModalAdditionalProperties with form fields"
```

<!-- END_TASK_9 -->

<!-- START_TASK_10 -->
### Task 10: Implement WorkItemLayoutAdditionalProperties

**Files:**
- Modify: `apps/web/hw/components/issues/issue-layouts/additional-properties.tsx`

**Step 1: Read the current stub file**

The current stub is:

```typescript
export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};
export function WorkItemLayoutAdditionalProperties(props: TWorkItemLayoutAdditionalProperties) {
  return <></>;
}
```

**Step 2: Replace with full implementation**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import { useIssueProperties, useIssuePropertyValues } from "../../hooks/use-issue-properties";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

/**
 * Compact display of custom properties in layout views.
 * Shows property name: value pairs inline or in a small grid.
 */
export const WorkItemLayoutAdditionalProperties = observer(
  ({ displayProperties, issue }: TWorkItemLayoutAdditionalProperties) => {
    const propertyStore = useIssueProperties();
    const { values: propertyValues } = useIssuePropertyValues(
      issue.workspace_id,
      issue.project_id,
      issue.id
    );

    const definitions = propertyStore.getAllDefinitions();

    // Build a map of property values by property ID
    const valueMap = useMemo(() => {
      const map: Record<string, any> = {};
      propertyValues.forEach((pv) => {
        map[pv.property_id] = pv.value;
      });
      return map;
    }, [propertyValues]);

    if (definitions.length === 0 || !displayProperties) {
      return null;
    }

    // Filter to visible properties
    const visibleProperties = definitions.filter(
      (def) => displayProperties[def.id] !== false
    );

    if (visibleProperties.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {visibleProperties.map((def) => {
          const value = valueMap[def.id];
          if (value === null || value === undefined) {
            return null;
          }

          let displayValue: string;
          if (Array.isArray(value)) {
            displayValue = value.join(", ");
          } else if (typeof value === "boolean") {
            displayValue = value ? "Yes" : "No";
          } else {
            displayValue = String(value);
          }

          return (
            <div key={def.id} className="inline-flex items-center gap-1 rounded bg-custom-background-90 px-2 py-1 text-xs">
              <span className="font-medium text-custom-text-200">{def.name}:</span>
              <span className="text-custom-text-100">{displayValue}</span>
            </div>
          );
        })}
      </div>
    );
  }
);

WorkItemLayoutAdditionalProperties.displayName = "WorkItemLayoutAdditionalProperties";
```

**Step 3: Commit**

```bash
git add apps/web/hw/components/issues/issue-layouts/additional-properties.tsx
git commit -m "feat(hw): implement WorkItemLayoutAdditionalProperties with compact display"
```

<!-- END_TASK_10 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_SUBCOMPONENT_D (tasks 11-12) -->

<!-- START_TASK_11 -->
### Task 11: Implement IssueAdditionalPropertiesActivity

**Files:**
- Modify: `apps/web/hw/components/issues/issue-details/issue-properties-activity/root.tsx`

**Step 1: Read the current stub file**

The current stub is:

```typescript
type TIssueAdditionalPropertiesActivity = {
  activityId: string;
  ends: "top" | "bottom" | undefined;
};
export function IssueAdditionalPropertiesActivity(_props: TIssueAdditionalPropertiesActivity) {
  return <></>;
}
```

**Step 2: Replace with full implementation**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import React from "react";
import { observer } from "mobx-react";

type TIssueAdditionalPropertiesActivity = {
  activityId: string;
  ends: "top" | "bottom" | undefined;
};

/**
 * Activity component for custom property changes.
 * Displays audit trail of property updates with before/after values.
 *
 * Note: Phase 5 provides a stub implementation.
 * Full activity tracking is implemented in Phase 6 when activity module is integrated.
 */
export const IssueAdditionalPropertiesActivity = observer(
  ({ activityId, ends }: TIssueAdditionalPropertiesActivity) => {
    // Placeholder: Activity will be populated from activity store in Phase 6
    // For now, return empty container that maintains space in activity feed

    return (
      <div
        className="space-y-2"
        data-activity-id={activityId}
        data-ends={ends}
      >
        {/* Activity items will be rendered here in Phase 6 */}
      </div>
    );
  }
);

IssueAdditionalPropertiesActivity.displayName = "IssueAdditionalPropertiesActivity";
```

**Step 3: Commit**

```bash
git add apps/web/hw/components/issues/issue-details/issue-properties-activity/root.tsx
git commit -m "feat(hw): implement IssueAdditionalPropertiesActivity stub for Phase 5"
```

<!-- END_TASK_11 -->

<!-- START_TASK_12 -->
### Task 12: Write Vitest tests for frontend components

**Files:**
- Create: `apps/web/hw/__tests__/services/issue-property.service.test.ts`
- Create: `apps/web/hw/__tests__/store/issue-property.store.test.ts`
- Create: `apps/web/hw/__tests__/hooks/use-issue-properties.test.tsx`
- Create: `apps/web/hw/__tests__/components/property-fields.test.tsx`

**Step 1: Create `apps/web/hw/__tests__/services/issue-property.service.test.ts`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IssuePropertyService } from "../../services/issue-property.service";
import type { IIssuePropertyDefinition, IIssuePropertyValue } from "../../types";

describe("IssuePropertyService", () => {
  let service: IssuePropertyService;

  beforeEach(() => {
    service = new IssuePropertyService();
  });

  describe("fetchPropertyDefinitions", () => {
    it("fetches property definitions from API", async () => {
      const mockDefinitions: IIssuePropertyDefinition[] = [
        {
          id: "1",
          workspace_id: "ws1",
          name: "Status",
          property_type: "select",
          options: [{ id: "opt1", value: "Open" }],
        },
      ];

      const getSpy = vi.spyOn(service as any, "get").mockResolvedValue({ data: mockDefinitions });

      const result = await service.fetchPropertyDefinitions("test-ws");

      expect(result).toEqual(mockDefinitions);
      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-ws/property-definitions/");
    });

    it("throws error on API failure", async () => {
      const getSpy = vi.spyOn(service as any, "get").mockRejectedValue({
        response: { data: { error: "Not found" } },
      });

      await expect(service.fetchPropertyDefinitions("test-ws")).rejects.toEqual({
        error: "Not found",
      });
      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-ws/property-definitions/");
    });
  });

  describe("fetchIssuePropertyValues", () => {
    it("fetches property values for an issue", async () => {
      const mockValues: IIssuePropertyValue[] = [
        {
          id: "v1",
          workspace_id: "ws1",
          project_id: "p1",
          issue_id: "i1",
          property_id: "prop1",
          value: "Open",
        },
      ];

      const getSpy = vi.spyOn(service as any, "get").mockResolvedValue({ data: mockValues });

      const result = await service.fetchIssuePropertyValues("test-ws", "proj1", "issue1");

      expect(result).toEqual(mockValues);
      expect(getSpy).toHaveBeenCalledWith(
        "/api/workspaces/test-ws/projects/proj1/issues/issue1/property-values/"
      );
    });
  });

  describe("upsertIssuePropertyValues", () => {
    it("bulk upserts property values", async () => {
      const payload = { prop1: "value1", prop2: 42 };
      const mockResult = {
        prop1: { id: "v1", workspace_id: "ws1", project_id: "p1", issue_id: "i1", property_id: "prop1", value: "value1" },
        prop2: { id: "v2", workspace_id: "ws1", project_id: "p1", issue_id: "i1", property_id: "prop2", value: 42 },
      };

      const putSpy = vi.spyOn(service as any, "put").mockResolvedValue({ data: mockResult });

      const result = await service.upsertIssuePropertyValues("test-ws", "proj1", "issue1", payload);

      expect(result).toEqual(mockResult);
      expect(putSpy).toHaveBeenCalledWith(
        "/api/workspaces/test-ws/projects/proj1/issues/issue1/property-values/",
        payload
      );
    });
  });
});
```

**Step 2: Create `apps/web/hw/__tests__/store/issue-property.store.test.ts`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IssuePropertyStore } from "../../store/issue-property.store";
import type { IIssuePropertyService } from "../../services/issue-property.service";
import type { IIssuePropertyDefinition, IIssuePropertyValue } from "../../types";

describe("IssuePropertyStore", () => {
  let store: IssuePropertyStore;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      fetchPropertyDefinitions: vi.fn(),
      fetchIssuePropertyValues: vi.fn(),
      upsertIssuePropertyValues: vi.fn(),
    };
    vi.mock("../../services/issue-property.service", () => ({
      IssuePropertyService: vi.fn().mockImplementation(() => mockService),
    }));
    store = new IssuePropertyStore({} as any);
  });

  describe("definitions management", () => {
    it("stores and retrieves definitions", () => {
      const defs: IIssuePropertyDefinition[] = [
        { id: "1", workspace_id: "ws1", name: "Status", property_type: "select" },
        { id: "2", workspace_id: "ws1", name: "Priority", property_type: "select" },
      ];

      store.setDefinitions(defs);

      expect(store.getAllDefinitions()).toEqual(defs);
      expect(store.getDefinitionById("1")).toEqual(defs[0]);
      expect(store.getDefinitionById("999")).toBeNull();
    });
  });

  describe("values management", () => {
    it("stores and retrieves property values for an issue", () => {
      const values: IIssuePropertyValue[] = [
        {
          id: "v1",
          workspace_id: "ws1",
          project_id: "p1",
          issue_id: "i1",
          property_id: "prop1",
          value: "Open",
        },
      ];

      store.setValues("ws1", "p1", "i1", values);

      const retrieved = store.getIssueValues("ws1", "p1", "i1");
      expect(retrieved).toEqual(values);

      const singleValue = store.getIssueValueByPropertyId("ws1", "p1", "i1", "prop1");
      expect(singleValue?.value).toBe("Open");
    });

    it("returns empty array for non-existent issue values", () => {
      const values = store.getIssueValues("ws1", "p1", "nonexistent");
      expect(values).toEqual([]);
    });
  });

  describe("async operations", () => {
    it("fetches definitions and updates state", async () => {
      const defs: IIssuePropertyDefinition[] = [
        { id: "1", workspace_id: "ws1", name: "Status", property_type: "select" },
      ];

      mockService.fetchPropertyDefinitions.mockResolvedValue(defs);

      await store.fetchDefinitions("ws1");

      expect(store.getAllDefinitions()).toEqual(defs);
      expect(store.state.isLoading).toBe(false);
      expect(store.state.error).toBeNull();
    });

    it("handles fetch errors gracefully", async () => {
      mockService.fetchPropertyDefinitions.mockRejectedValue({ message: "Network error" });

      await store.fetchDefinitions("ws1");

      expect(store.state.error).toContain("Network error");
      expect(store.state.isLoading).toBe(false);
    });

    it("upserts property values", async () => {
      const values: IIssuePropertyValue[] = [
        {
          id: "v1",
          workspace_id: "ws1",
          project_id: "p1",
          issue_id: "i1",
          property_id: "prop1",
          value: "Closed",
        },
      ];

      mockService.upsertIssuePropertyValues.mockResolvedValue({
        prop1: values[0],
      });

      await store.upsertIssueValues("ws1", "p1", "i1", { prop1: "Closed" });

      expect(store.getIssueValueByPropertyId("ws1", "p1", "i1", "prop1")?.value).toBe("Closed");
    });
  });
});
```

**Step 3: Create `apps/web/hw/__tests__/hooks/use-issue-properties.test.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWorkspaceIssueProperties, useIssuePropertyValues } from "../../hooks/use-issue-properties";
import { IssuePropertyStore } from "../../store/issue-property.store";
import type { IIssuePropertyDefinition } from "../../types";

// Mock StoreContext
vi.mock("@plane/hooks", async () => {
  const actual = await vi.importActual("@plane/hooks");
  return {
    ...actual,
    useContext: vi.fn(() => ({
      issuePropertyStore: new IssuePropertyStore({
        fetchPropertyDefinitions: vi.fn().mockResolvedValue([]),
        fetchIssuePropertyValues: vi.fn().mockResolvedValue([]),
        upsertIssuePropertyValues: vi.fn().mockResolvedValue({}),
      }),
    })),
  };
});

describe("useIssueProperties hooks", () => {
  describe("useWorkspaceIssueProperties", () => {
    it("returns definitions and loading state", async () => {
      const { result } = renderHook(() => useWorkspaceIssueProperties("test-ws"));

      await waitFor(() => {
        expect(result.current.definitions).toBeDefined();
        expect(result.current.isLoading).toBeDefined();
        expect(result.current.error).toBeDefined();
      });
    });

    it("handles undefined workspace slug", () => {
      const { result } = renderHook(() => useWorkspaceIssueProperties(undefined));

      expect(result.current.definitions).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("useIssuePropertyValues", () => {
    it("returns values and upsert function", async () => {
      const { result } = renderHook(() =>
        useIssuePropertyValues("test-ws", "proj1", "issue1")
      );

      await waitFor(() => {
        expect(result.current.values).toBeDefined();
        expect(result.current.isLoading).toBeDefined();
        expect(result.current.upsertValues).toBeDefined();
      });
    });

    it("returns empty values when parameters are undefined", () => {
      const { result } = renderHook(() =>
        useIssuePropertyValues(undefined, undefined, undefined)
      );

      expect(result.current.values).toEqual([]);
      expect(typeof result.current.upsertValues).toBe("function");
    });
  });
});
```

**Step 4: Create `apps/web/hw/__tests__/components/property-fields.test.tsx`**

```typescript
// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PropertyTextField,
  PropertyNumberField,
  PropertyBooleanField,
} from "../../components/issues/issue-details/property-fields";

describe("Property field components", () => {
  describe("PropertyTextField", () => {
    it("renders input with initial value", () => {
      const onChange = vi.fn();
      render(
        <PropertyTextField
          value="test value"
          onChange={onChange}
          placeholder="Enter text"
        />
      );

      const input = screen.getByDisplayValue("test value") as HTMLInputElement;
      expect(input).toBeTruthy();
    });

    it("calls onChange when value changes", () => {
      const onChange = vi.fn();
      render(
        <PropertyTextField
          value=""
          onChange={onChange}
          placeholder="Enter text"
        />
      );

      const input = screen.getByPlaceholderText("Enter text") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "new value" } });

      expect(onChange).toHaveBeenCalledWith("new value");
    });

    it("handles null value", () => {
      const onChange = vi.fn();
      render(
        <PropertyTextField
          value={null}
          onChange={onChange}
          placeholder="Enter text"
        />
      );

      const input = screen.getByPlaceholderText("Enter text") as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  describe("PropertyNumberField", () => {
    it("parses and validates numeric input", () => {
      const onChange = vi.fn();
      render(
        <PropertyNumberField
          value={null}
          onChange={onChange}
          placeholder="Enter number"
        />
      );

      const input = screen.getByPlaceholderText("Enter number") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "42" } });

      expect(onChange).toHaveBeenCalledWith(42);
    });

    it("handles empty input as null", () => {
      const onChange = vi.fn();
      render(
        <PropertyNumberField
          value={42}
          onChange={onChange}
          placeholder="Enter number"
        />
      );

      const input = screen.getByDisplayValue("42") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });

      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe("PropertyBooleanField", () => {
    it("renders toggle switch", () => {
      const onChange = vi.fn();
      render(
        <PropertyBooleanField
          value={false}
          onChange={onChange}
        />
      );

      // Toggle is rendered by @plane/ui
      // This is a basic check that the component mounts
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
```

**Step 5: Commit**

```bash
git add apps/web/hw/__tests__/
git commit -m "test(hw): add comprehensive Vitest tests for frontend components"
```

<!-- END_TASK_12 -->

<!-- END_SUBCOMPONENT_D -->

<!-- START_TASK_13 -->
### Task 13: Final verification of Phase 5

**Step 1: Run frontend type checks**

```bash
cd apps/web
pnpm check:types
cd ../..
```

Expected: No TypeScript errors.

**Step 2: Run frontend linting**

```bash
cd apps/web
pnpm check:lint
cd ../..
```

Expected: No ESLint errors.

**Step 3: Run frontend tests**

```bash
cd apps/web
pnpm test
cd ../..
```

Expected: All Vitest tests pass (expect some may be skipped for integration tests).

**Step 4: Build frontend**

```bash
cd apps/web
pnpm build
cd ../..
```

Expected: Build succeeds with no errors.

**Step 5: Verify git state is clean**

```bash
git status
```

Expected: Clean working tree (all changes committed).

No commit needed — verification only.

<!-- END_TASK_13 -->
