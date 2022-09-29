import { z } from 'zod'
import { describe, it, expect } from 'vitest'
import { DbModel, makeMemoryDB } from './makeMemoryDB'

describe('makeMemoryDB()', () => {
  it('should return a memory db', () => {
    const db = makeMemoryDB()

    expect(db).toBeDefined()
  })

  describe('settings', () => {
    describe('seeder', () => {
      it('should seed the database', () => {
        const contact = z.object({
          name: z.string(),
          email: z.string().email(),
        })

        const address = z.object({
          street: z.string(),
          city: z.string(),
          state: z.string(),
        })

        const contacts: z.infer<typeof contact>[] = [
          { name: 'Jane', email: 'jane@example.test' },
          { name: 'Bob', email: 'bob@example.test' },
          { name: 'Ada', email: 'ada@example.test' },
        ]

        const addresses: DbModel<z.infer<typeof address>>[] = [{ $id: 'the-whitehouse', street: '1600 Pennsylvania Ave', city: 'Washington', state: 'DC' }]

        const testDB = makeMemoryDB({
          schema: {
            contact,
            address,
          },
          seeder: (db) => {
            // Use create for models that don't have $id (creating new models)
            db.schema.contact.create(...contacts)

            // Use save for restoring persisted models (e.g. restoring from a memoryDB dump)
            // Note: calling save() here works too, but using the alias "load" makes more sense in this context
            db.schema.address.load(...addresses)
          },
        })

        const c = testDB.schema.contact.getAll()

        expect(c).toHaveLength(contacts.length)
        expect(c[0]).toEqual(expect.objectContaining(contacts[0]))
        expect(c[1]).toEqual(expect.objectContaining(contacts[1]))
        expect(c[2]).toEqual(expect.objectContaining(contacts[2]))

        const a = testDB.schema.address.getAll()

        expect(a).toHaveLength(addresses.length)
        expect(a).toEqual(addresses)
        expect(a).not.toBe(addresses)
      })
    })
  })

  describe('returned instance', () => {
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

          const a = db.schema.address.new({ street: '123 main st' })

          expect(a).toBeDefined()
          expect(a.$id).toBeDefined()
          expect(a.street).toBe('123 main st')
          expect(a.city).toBeUndefined()
          expect(a.state).toBeUndefined()
        })
      })

      describe('getAll()', () => {
        it('should always return a fresh set of data', () => {
          const obj = z.object({})

          const db = makeMemoryDB({
            schema: {
              obj,
            },
          })

          const a = db.schema.obj.getAll()
          const b = db.schema.obj.getAll()

          expect(a).toEqual([])
          expect(b).toEqual([])
          expect(a).not.toBe(b)
        })
      })

      describe('save()', () => {
        it('should save multiple records', () => {
          const contact = z.object({
            name: z.string(),
            email: z.string().email(),
          })

          const db = makeMemoryDB({
            schema: {
              contact,
            },
          })

          const c = [
            { $id: 'test1', name: 'Jane', email: 'jane@example.test' },
            { $id: 'test2', name: 'Bob', email: 'bob@example.test' },
          ]

          db.schema.contact.save(...c)

          const r1 = db.schema.contact.getAll()
          const r2 = db.schema.contact.getAll()

          expect(r1).toEqual(c)
          expect(r2).toEqual(c)
          expect(r1).not.toBe(r2)
          expect(c[0]).toEqual(r1[0])
          expect(c[0]).not.toBe(r1[0])
          expect(c[1]).toEqual(r1[1])
          expect(c[1]).not.toBe(r1[1])
        })
      })

      describe('create()', () => {
        it('should make new models and persist them', () => {
          const contact = z.object({
            name: z.string(),
            email: z.string().email(),
          })

          const db = makeMemoryDB({
            schema: {
              contact,
            },
          })

          const s = [
            { name: 'Jane', email: 'jane@example.test' },
            { name: 'Bob', email: 'bob@example.test' },
          ]

          const c = db.schema.contact.create(...s)

          expect(c).toBeDefined()
          expect(c).not.toBe(s)
          expect(c[0].$id).toBeDefined()
          expect(c[0].name).toEqual(s[0].name)
          expect(c[0].email).toEqual(s[0].email)
          expect(c[1].$id).toBeDefined()
          expect(c[1].name).toEqual(s[1].name)
          expect(c[1].email).toEqual(s[1].email)
        })
      })
    })
  })
})
