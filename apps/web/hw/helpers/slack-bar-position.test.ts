/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, vi } from "vitest";
import type { ChartDataType } from "@plane/types";
import type { CpmResult } from "./cpm-calculator";

// Import and mock BEFORE importing the function under test
vi.mock("@/components/gantt-chart/views/helpers");

// Now import after mocking
import { getSlackBarPosition } from "./slack-bar-position";
import * as ganttHelpers from "@/components/gantt-chart/views/helpers";

describe("getSlackBarPosition", () => {
  const baseChartData = {
    startDate: new Date("2024-01-01"),
    endDate: new Date("2024-01-31"),
    dataPoints: 31,
    key: "test",
    i18n_title: "Test Chart",
    data: {
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
      dayWidth: 30,
      currentDate: new Date("2024-01-01"),
      approxFilterRange: 31,
    },
  } as ChartDataType;

  describe("cpm-critical-path.AC5.1: Non-critical tasks with slack", () => {
    it("should return slack bar position when task has positive slack", () => {
      vi.mocked(ganttHelpers.getPositionFromDate).mockImplementation(
        (_chartData: unknown, date: string | Date, offsetWidth: number) => {
          // EF="2024-01-05" -> 120px, LF="2024-01-08" -> 180px
          if (date === "2024-01-05") return 120 + offsetWidth;
          if (date === "2024-01-08") return 180 + offsetWidth;
          return 0;
        }
      );

      const cpmResult: CpmResult = {
        es: "2024-01-05",
        ef: "2024-01-05",
        ls: "2024-01-08",
        lf: "2024-01-08",
        slack: 3,
        isCritical: false,
      };

      const result = getSlackBarPosition(cpmResult, baseChartData, 0);

      expect(result).not.toBeNull();
      expect(result?.left).toBe(120);
      expect(result?.width).toBe(60); // 180 - 120
    });

    it("should calculate correct width for slack spanning multiple days", () => {
      vi.mocked(ganttHelpers.getPositionFromDate).mockImplementation(
        (_chartData: unknown, date: string | Date, offsetWidth: number) => {
          // EF="2024-01-03" -> 60px, LF="2024-01-07" -> 180px
          if (date === "2024-01-03") return 60 + offsetWidth;
          if (date === "2024-01-07") return 180 + offsetWidth;
          return 0;
        }
      );

      const cpmResult: CpmResult = {
        es: "2024-01-03",
        ef: "2024-01-03",
        ls: "2024-01-07",
        lf: "2024-01-07",
        slack: 4,
        isCritical: false,
      };

      const result = getSlackBarPosition(cpmResult, baseChartData, 0);

      expect(result).not.toBeNull();
      expect(result?.width).toBe(120); // 180 - 60
    });
  });

  describe("cpm-critical-path.AC5.6: Critical tasks with zero slack", () => {
    it("should return null for critical task (isCritical=true)", () => {
      const mock = vi.mocked(ganttHelpers.getPositionFromDate);
      mock.mockClear();

      const cpmResult: CpmResult = {
        es: "2024-01-05",
        ef: "2024-01-05",
        ls: "2024-01-05",
        lf: "2024-01-05",
        slack: 0,
        isCritical: true,
      };

      const result = getSlackBarPosition(cpmResult, baseChartData, 0);

      expect(result).toBeNull();
      expect(mock).not.toHaveBeenCalled();
    });

    it("should return null when slack is zero but isCritical is false", () => {
      const mock = vi.mocked(ganttHelpers.getPositionFromDate);
      mock.mockClear();

      const cpmResult: CpmResult = {
        es: "2024-01-05",
        ef: "2024-01-05",
        ls: "2024-01-05",
        lf: "2024-01-05",
        slack: 0,
        isCritical: false,
      };

      const result = getSlackBarPosition(cpmResult, baseChartData, 0);

      expect(result).toBeNull();
      expect(mock).not.toHaveBeenCalled();
    });

    it("should return null when slack is negative", () => {
      const mock = vi.mocked(ganttHelpers.getPositionFromDate);
      mock.mockClear();

      const cpmResult: CpmResult = {
        es: "2024-01-05",
        ef: "2024-01-06",
        ls: "2024-01-05",
        lf: "2024-01-05",
        slack: -1,
        isCritical: false,
      };

      const result = getSlackBarPosition(cpmResult, baseChartData, 0);

      expect(result).toBeNull();
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should return null when ef equals lf (width would be zero)", () => {
      vi.mocked(ganttHelpers.getPositionFromDate).mockImplementation(
        (_chartData: unknown, _date: string | Date, offsetWidth: number) => {
          // EF and LF map to same position
          return 100 + offsetWidth;
        }
      );

      const cpmResult: CpmResult = {
        es: "2024-01-05",
        ef: "2024-01-05",
        ls: "2024-01-05",
        lf: "2024-01-05",
        slack: 0.5,
        isCritical: false,
      };

      const result = getSlackBarPosition(cpmResult, baseChartData, 0);

      expect(result).toBeNull();
    });

    it("should respect offsetWidth parameter", () => {
      vi.mocked(ganttHelpers.getPositionFromDate).mockImplementation(
        (_chartData: unknown, date: string | Date, offsetWidth: number) => {
          // EF="2024-01-05" -> 120px base, LF="2024-01-08" -> 180px base
          if (date === "2024-01-05") return 120 + offsetWidth;
          if (date === "2024-01-08") return 180 + offsetWidth;
          return 0;
        }
      );

      const cpmResult: CpmResult = {
        es: "2024-01-05",
        ef: "2024-01-05",
        ls: "2024-01-08",
        lf: "2024-01-08",
        slack: 3,
        isCritical: false,
      };

      const offsetWidth = 15;
      const result = getSlackBarPosition(cpmResult, baseChartData, offsetWidth);

      expect(result).not.toBeNull();
      expect(result?.left).toBe(135); // 120 + 15
      expect(result?.width).toBe(60); // (180 + 15) - (120 + 15)
    });

    it("should call getPositionFromDate with correct date strings", () => {
      const mock = vi.mocked(ganttHelpers.getPositionFromDate);
      mock.mockClear();
      mock.mockReturnValue(100);

      const cpmResult: CpmResult = {
        es: "2024-01-05",
        ef: "2024-01-05",
        ls: "2024-01-08",
        lf: "2024-01-08",
        slack: 3,
        isCritical: false,
      };

      getSlackBarPosition(cpmResult, baseChartData, 0);

      expect(mock).toHaveBeenCalledWith(baseChartData, "2024-01-05", 0);
      expect(mock).toHaveBeenCalledWith(baseChartData, "2024-01-08", 0);
    });
  });
});
