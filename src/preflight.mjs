export async function requireCapAbsent(readCap, capId) {
  try {
    const existing = await readCap(capId)
    if (existing) throw new Error("This cap already exists")
  } catch (error) {
    if (error instanceof Error && error.message === "This cap already exists") throw error
    if (!error || error.code !== "CAP_NOT_FOUND") throw error
  }
  return true
}
