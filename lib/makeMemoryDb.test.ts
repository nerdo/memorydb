import { z } from 'zod'
import { describe, it, expect } from 'vitest'
import { makeMemoryDB } from './makeMemoryDB'

describe('makeMemoryDB', () => {
  it('should return a memory db', () => {
    const db = makeMemoryDB()

    expect(db).toBeDefined()
  })

  describe('zod', () => {
    it('should store the zod definitions', () => {
      const str = z.string()
      const obj = z.object({
        a: z.string(),
      })

      const db = makeMemoryDB({
        schema: {
          str,
          obj,
        },
      })

      expect(db.zod).toBeDefined()
      expect(db.zod.str).toEqual(str)
      expect(db.zod.obj).toEqual(obj)
    })

    describe('schema', () => {
      it('should exist', () => {
        const db = makeMemoryDB()

        expect(db.schema).toBeDefined()
      })

      describe('new()', () => {
        it('should return a new record', () => {
          const contact = z.object({
            name: z.string(),
            email: z.string().email(),
          })
          const address = z.object({
            street: z.string(),
            city: z.string(),
            state: z.string(),
          })

          const db = makeMemoryDB({
            schema: {
              contact,
              address,
            },
          })

          const c = db.schema.contact.new()

          expect(c).toBeDefined()
          expect(c.$id).toBeDefined()
          expect(c.name).toBeUndefined()
          expect(c.email).toBeUndefined()

          const a = db.schema.address.new()

          expect(a).toBeDefined()
          expect(a.$id).toBeDefined()
          expect(a.street).toBeUndefined()
          expect(a.city).toBeUndefined()
          expect(a.state).toBeUndefined()
        })
      })
    })
  })
})
