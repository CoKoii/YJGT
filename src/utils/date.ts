export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

export function normalizeDateKey(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? formatDateKey(new Date()) : formatDateKey(date)
}
