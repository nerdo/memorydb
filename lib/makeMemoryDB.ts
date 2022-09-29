import { z } from 'zod'
import { clone } from '@nerdo/utils'
import crypto from 'crypto'

export interface Settings<S extends Record<string, unknown>> {
  schema?: SchemaList<S>
  seeder?: (db: ReturnType<typeof makeSchema<S>>) => void
}

export type IdType = string

export type DbModel<T extends {}, I = IdType> = { readonly $id: I } & Partial<T>

export type FindContext<M, Extra extends {} = unknown> = {
  readonly results: M[]
  readonly options: FindOptions<M>
  index: number
  extra: Extra
}

export type FindOptions<M, Extra extends {} = unknown> = {
  extra: Extra
}

export interface Schema<T, I, ID = { readonly $id: I }, Model = ID & Partial<T>> {
  new: (p?: Partial<T>) => Model
  getAll: () => Model[]
  save: (...models: Model[]) => Model[]
  load: (...models: Model[]) => Model[]
  create: (...partials: Partial<T>[]) => Model[]
  findById: (...$ids: I[]) => Model[]

  // TODO find should deal with the Model in the DB, i.e. the Zod model... maybe - might depend on whether or not we validate with Zod
  find: <E extends {} = unknown, Extra = Partial<E>>(
    matcher: (m: Model, context: FindContext<Model, Extra>) => boolean,
    stopper: (context: FindContext<Model, Extra>) => boolean,
    options?: FindOptions<Model>
  ) => Model[]
}

export type SchemaList<Type> = {
  [Property in keyof Type]: Type[Property] extends z.AnyZodObject ? Type[Property] : never
}

const newId = crypto.randomUUID

const makeSchema = <S extends Record<string, unknown>>(settings: Settings<S>) => {
  type InferZodTypes<Type> = {
    [Property in keyof Type]: Type[Property] extends z.AnyZodObject ? z.infer<Type[Property]> : never
  }

  type ZodTypes = InferZodTypes<typeof settings.schema>

  // Might want to make this configurable...
  type SchemaIdType = IdType

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type SchemaMap<Type> = {
    [Property in keyof Type as Type[Property] extends never ? never : Property]: Property extends keyof ZodTypes
      ? Schema<ZodTypes[Property], SchemaIdType>
      : never
  }

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type ZodMap<Type> = {
    [Property in keyof Type as Type[Property] extends never ? never : Property]: Property extends keyof ZodTypes ? ZodTypes[Property] : never
  }

  return Object.keys(settings.schema || {})
    .map((name: keyof S) => {
      const zod = settings.schema[name]

      // Runtime equivalent of filtering out non inferred zod keys
      if (!(zod instanceof z.ZodObject)) {
        return false
      }

      type Z = typeof zod extends z.AnyZodObject ? z.infer<typeof zod> : never
      type Model = { readonly $id: SchemaIdType } & Z
      type Collection = { cache: Record<SchemaIdType, Model>; array: Model[] }

      const collection: Collection = { cache: {}, array: [] }

      const save: Schema<Z, SchemaIdType>['save'] = (...models) => {
        return models.map((m) => {
          const isNew = !(m.$id in collection.cache)

          collection.cache[m.$id] = clone(m)

          if (isNew) {
            collection.array.push(collection.cache[m.$id])
          }

          return clone(collection.cache[m.$id])
        })
      }

      const schema: Schema<Z, SchemaIdType> = {
        new: (p) => {
          return { ...(p || {}), $id: newId() }
        },

        getAll: () => {
          return clone(collection.array)
        },

        save,

        load: save,

        create: (...partials) => {
          return schema.save(...partials.map((p) => schema.new(p)))
        },

        findById: (...$ids) => {
          return $ids.reduce((results: Model[], $id) => {
            const obj = collection.cache[$id]

            if (obj) {
              results.push(clone(obj))
            }

            return results
          }, [])
        },

        // find: <Extra>(matcher, stopper, options) => {
        find: (matcher, stopper, options) => {
          type Context = Parameters<typeof matcher>[1]

          const context: Context = {
            results: [],
            options,
            index: 0,
            extra: {},
          }

          for (context.index = 0; context.index < collection.array.length; context.index++) {
            const m = collection.array[context.index]

            if (matcher(m, context)) {
              context.results.push(clone(m))
            }

            if (stopper(context)) {
              break
            }
          }

          return context.results
        },
      }

      return { name, schema, collection, zod }
    })
    .reduce(
      (container, current) => {
        if (!current) return container

        container.schema[current.name as keyof typeof container.schema] = current.schema as typeof container.schema[keyof typeof container.schema]

        container.zod[current.name as keyof typeof container.zod] = current.zod as typeof container.zod[keyof typeof container.zod]

        return container
      },
      { schema: {}, zod: {} } as { schema: SchemaMap<ZodTypes>; zod: ZodMap<ZodTypes> }
    )
}

export const makeMemoryDB = <S extends {}>(settings: Settings<S> = {}) => {
  const { schema, zod } = makeSchema(settings)

  const db = {
    zod,
    schema,
  }

  if (settings.seeder) {
    settings.seeder(db)
  }

  return db
}

export default makeMemoryDB
