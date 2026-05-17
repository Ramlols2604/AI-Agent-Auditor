export const DATA_CLEARED_EVENT = 'sentinel:data-cleared'

export function notifyDataCleared() {
  window.dispatchEvent(new CustomEvent(DATA_CLEARED_EVENT))
}
