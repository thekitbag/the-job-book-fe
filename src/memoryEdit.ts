import type { AlreadyRememberedItem, MemoryItemEdit, MemoryType, MemoryViewItem } from './types'

// Build the editable form shape from a Job-memory item.
export function memoryItemToEdit(item: MemoryViewItem): MemoryItemEdit {
  return {
    memoryType: item.memoryType as MemoryType,
    summary: item.summary,
    materialName: item.materialName,
    quantity: item.quantity,
    unit: item.unit,
    supplierName: item.supplierName,
    deliveryTiming: item.deliveryTiming,
    locationOrUse: item.locationOrUse,
    costAmount: item.costAmount,
    costCurrency: item.costCurrency,
    costQualifier: item.costQualifier,
    totalCostAmount: item.totalCostAmount,
    budgetCategoryId: item.budgetCategoryId ?? null,
  }
}

// Build the editable form shape from an Already-remembered item (Things to check).
export function rememberedItemToEdit(item: AlreadyRememberedItem): MemoryItemEdit {
  return {
    memoryType: item.memoryType,
    summary: item.summary,
    materialName: item.materialName ?? null,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    supplierName: item.supplierName ?? null,
    deliveryTiming: item.deliveryTiming ?? null,
    locationOrUse: item.locationOrUse ?? null,
    costAmount: item.costAmount ?? null,
    costCurrency: item.costCurrency ?? null,
    costQualifier: item.costQualifier ?? null,
    totalCostAmount: item.totalCostAmount ?? null,
    budgetCategoryId: item.budgetCategoryId ?? null,
  }
}

// Apply a saved memory-view item back onto an Already-remembered card in place.
export function applyEditToRemembered(
  prev: AlreadyRememberedItem,
  updated: MemoryViewItem,
): AlreadyRememberedItem {
  return {
    ...prev,
    summary: updated.summary || prev.summary,
    memoryType: updated.memoryType as MemoryType,
    materialName: updated.materialName,
    quantity: updated.quantity,
    unit: updated.unit,
    supplierName: updated.supplierName,
    deliveryTiming: updated.deliveryTiming,
    locationOrUse: updated.locationOrUse,
    costAmount: updated.costAmount,
    costCurrency: updated.costCurrency,
    costQualifier: updated.costQualifier,
    totalCostAmount: updated.totalCostAmount,
    budgetCategoryId: updated.budgetCategoryId ?? null,
    uncertaintyFlags: updated.uncertaintyFlags ?? prev.uncertaintyFlags ?? [],
  }
}
