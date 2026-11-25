// IndexedDB 工艺档案仓储。单库单表，结构随 SCHEMA_VERSION 升级

import type { WorkOrder } from '@/sim/types'
import { presetOrders } from '@/data/presets'

const DB_NAME = 'xipi-lacquer-studio'
const STORE = 'work_orders'
const SCHEMA_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export async function listOrders(): Promise<WorkOrder[]> {
  const rows = await tx<WorkOrder[]>('readonly', (s) => s.getAll() as IDBRequest<WorkOrder[]>)
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getOrder(id: string): Promise<WorkOrder | undefined> {
  return tx<WorkOrder | undefined>('readonly', (s) => s.get(id) as IDBRequest<WorkOrder | undefined>)
}

export async function saveOrder(order: WorkOrder): Promise<void> {
  order.updatedAt = Date.now()
  await tx('readwrite', (s) => s.put(order))
}

export async function deleteOrder(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

// 首次启动灌入预置件；已存在同 id 则跳过，保证可重复初始化
export async function ensurePresets(): Promise<WorkOrder[]> {
  const existing = await listOrders()
  const ids = new Set(existing.map((o) => o.id))
  const presets = presetOrders()
  for (const order of presets) {
    if (!ids.has(order.id)) await saveOrder(order)
  }
  return listOrders()
}

export async function exportOrder(order: WorkOrder): Promise<string> {
  return JSON.stringify(order, null, 2)
}

export async function importOrder(json: string): Promise<WorkOrder> {
  const order = JSON.parse(json) as WorkOrder
  if (!order.id || !Array.isArray(order.layers)) {
    throw new Error('档案格式不正确：缺少 id 或 layers')
  }
  // 导入件换新 id，避免覆盖本地档案
  order.id = `${order.id}-imported-${Date.now().toString(36)}`
  await saveOrder(order)
  return order
}
