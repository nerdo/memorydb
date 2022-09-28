import { z } from 'zod'

export interface Settings {
  schema?: {
    [key: string]: Schema
  }
}

export type Schema = z.ZodTypeAny

export const makeMemoryDB = (settings: Settings = {}) => {
  const { schema } = settings

  return {
    schema
  }
}

export default makeMemoryDB
