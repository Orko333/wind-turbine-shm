/**
 * Filters Store
 * Manages filtering and pagination state for turbine lists
 */

import { create } from "zustand";
import type { FilterState, PaginationState } from "../types/domain";

interface FiltersStoreState {
  filters: FilterState;
  pagination: PaginationState;
}

interface FiltersStoreActions {
  setFilters: (filters: FilterState) => void;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  setPagination: (pagination: Partial<PaginationState>) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setTotal: (total: number) => void;
  resetPagination: () => void;
  getFiltersQuery: () => Record<string, unknown>;
  getPaginationQuery: () => Record<string, unknown>;
}

type FiltersStore = FiltersStoreState & FiltersStoreActions;

const defaultFilters: FilterState = {
  turbineStatus: undefined,
  location: undefined,
  rulRange: undefined,
  searchQuery: undefined,
  sortBy: "name",
  sortOrder: "asc",
};

const defaultPagination: PaginationState = {
  page: 1,
  pageSize: 10,
  total: 0,
};

export const useFiltersStore = create<FiltersStore>((set, get) => ({
  filters: defaultFilters,
  pagination: defaultPagination,

  setFilters: (filters) => {
    set({ filters });
  },

  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
      },
    }));
  },

  resetFilters: () => {
    set({ filters: defaultFilters, pagination: defaultPagination });
  },

  setPagination: (pagination) => {
    set((state) => ({
      pagination: {
        ...state.pagination,
        ...pagination,
      },
    }));
  },

  setPage: (page) => {
    set((state) => ({
      pagination: {
        ...state.pagination,
        page,
      },
    }));
  },

  setPageSize: (pageSize) => {
    set((state) => ({
      pagination: {
        ...state.pagination,
        pageSize,
        page: 1, // Reset to first page when page size changes
      },
    }));
  },

  setTotal: (total) => {
    set((state) => ({
      pagination: {
        ...state.pagination,
        total,
      },
    }));
  },

  resetPagination: () => {
    set({ pagination: defaultPagination });
  },

  getFiltersQuery: () => {
    const { filters } = get();
    const query: Record<string, unknown> = {};

    if (filters.turbineStatus) {
      query.status = filters.turbineStatus;
    }
    if (filters.location) {
      query.location = filters.location;
    }
    if (filters.rulRange) {
      const [min, max] = filters.rulRange;
      query.rul_min = min;
      query.rul_max = max;
    }
    if (filters.searchQuery) {
      query.search = filters.searchQuery;
    }
    if (filters.sortBy) {
      query.sort_by = filters.sortBy;
    }
    if (filters.sortOrder) {
      query.sort_order = filters.sortOrder;
    }

    return query;
  },

  getPaginationQuery: () => {
    const { pagination } = get();
    return {
      page: pagination.page,
      page_size: pagination.pageSize,
    };
  },
}));
