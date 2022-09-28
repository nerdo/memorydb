import { z } from 'zod'
import { makeMemoryDB } from './makeMemoryDB'
import { describe, it, expect } from 'vitest'

describe('makeMemoryDB', () => {
  it('should return a memory db', () => {
    const db = makeMemoryDB()

    expect(db).toBeDefined()
  })

  describe('schema', () => {
    it('should store the schema', () => {
      const str = z.string()
      const obj = z.object({
        a: z.string()
      })

      const db = makeMemoryDB({
        schema: {
          str,
          obj
        },
      })
      
      expect(db.schema).toBeDefined()
      expect(db.schema.str).toEqual(str)
      expect(db.schema.obj).toEqual(obj)
    })
  })
})
