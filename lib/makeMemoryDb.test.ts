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
      const obj = z.object({
        a: z.string(),
      })

      const db = makeMemoryDB({
        schema: {
          obj,
        },
      })

      expect(db.zod).toBeDefined()
      expect(db.zod.obj).toEqual(obj)
    })

    it('should filter out non-object types', () => {
      const db = makeMemoryDB({
        schema: {
          string: z.string(),
          number: z.number(),
          boolean: z.boolean(),
          bigint: z.bigint(),
          date: z.date(),
          undefined: z.undefined(),
          null: z.null(),
          void: z.void(),
          any: z.any(),
          unknown: z.unknown(),
          never: z.never(),
        },
      })

      expect(db.zod.string).toBeUndefined()
      expect(db.zod.number).toBeUndefined()
      expect(db.zod.boolean).toBeUndefined()
      expect(db.zod.bigint).toBeUndefined()
      expect(db.zod.date).toBeUndefined()
      expect(db.zod.undefined).toBeUndefined()
      expect(db.zod.null).toBeUndefined()
      expect(db.zod.void).toBeUndefined()
      expect(db.zod.any).toBeUndefined()
      expect(db.zod.unknown).toBeUndefined()
      expect(db.zod.never).toBeUndefined()
    })

    describe('schema', () => {
      it('should exist', () => {
        const db = makeMemoryDB()

        expect(db.schema).toBeDefined()
      })

      it('should filter out non-object types', () => {
        const db = makeMemoryDB({
          schema: {
            string: z.string(),
            number: z.number(),
            boolean: z.boolean(),
            bigint: z.bigint(),
            date: z.date(),
            undefined: z.undefined(),
            null: z.null(),
            void: z.void(),
            any: z.any(),
            unknown: z.unknown(),
            never: z.never(),
          },
        })

        expect(db.schema.string).toBeUndefined()
        expect(db.schema.number).toBeUndefined()
        expect(db.schema.boolean).toBeUndefined()
        expect(db.schema.bigint).toBeUndefined()
        expect(db.schema.date).toBeUndefined()
        expect(db.schema.undefined).toBeUndefined()
        expect(db.schema.null).toBeUndefined()
        expect(db.schema.void).toBeUndefined()
        expect(db.schema.any).toBeUndefined()
        expect(db.schema.unknown).toBeUndefined()
        expect(db.schema.never).toBeUndefined()
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
