/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// types
import type { RootStore } from "@/plane-web/store/root.store";

export const useRootStore = (): RootStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useRootStore must be used within StoreProvider");
  return context;
};
