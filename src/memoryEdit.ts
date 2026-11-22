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
    labourHours: item.labourHours ?? null,
    labourPerson: item.labourPerson ?? null,
    labourTask: item.labourTask ?? null,
    happenedAt: item.happenedAt ?? null,
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
    labourHours: item.labourHours ?? null,
    labourPerson: item.labourPerson ?? null,
    labourTask: item.labourTask ?? null,
    happenedAt: item.happenedAt ?? null,
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
    labourHours: updated.labourHours ?? null,
    labourPerson: updated.labourPerson ?? null,
    labourTask: updated.labourTask ?? null,
    happenedAt: updated.happenedAt ?? null,
    uncertaintyFlags: updated.uncertaintyFlags ?? prev.uncertaintyFlags ?? [],
  }
}
