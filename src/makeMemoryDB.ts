import { z } from 'zod'
import { clone } from '@nerdo/utils'
import crypto from 'crypto'

export interface Settings<S extends Record<string, unknown>> {
  schema?: SchemaList<S>
  seeder?: (db: ReturnType<typeof makeSchema<S>>) => void
}

export type IdType = string

export type Identifiable = { readonly $id: IdType }

export type StoredModel<T extends {}> = Identifiable & T

export type StoredModelUpdate<T extends {}> = Identifiable & Partial<T>

export interface FindFunctionContext<Model, Extra extends object> {
  readonly results: Model[]
  index: number
  readonly options?: FindFunctionOptions<Extra>
  extra?: Extra
}

export interface FindFunctionOptions<Extra extends object> {
  // Value used to initialize context.extra in the matcher and stopper callbacks.
  extra: Extra
}

export interface Schema<T extends {}, I, Model = StoredModel<T>> {
  new: (p?: Partial<T>) => Model
  getAll: () => Model[]
  save: (...models: Model[]) => Model[]
  load: (...models: Model[]) => Model[]
  create: (...partials: Partial<T>[]) => Model[]
  findById: (...$ids: I[]) => Model[]

  // TODO find should deal with the Model in the DB, i.e. the Zod model... maybe - might depend on whether or not we validate with Zod
  find: <Extra extends object>(
    matcher: (m: Model, context: FindFunctionContext<Model, Extra>) => boolean,
    stopper: (context: FindFunctionContext<Model, Extra>) => boolean,
    options?: FindFunctionOptions<Extra>
  ) => Model[]
}

export type SchemaList<Type> = {
  [P in keyof Type]: Type[P] extends z.AnyZodObject ? Type[P] : never
}

const newId = crypto.randomUUID

const makeSchema = <S extends Record<string, unknown>>(settings: Required<Pick<Settings<S>, 'schema'>> & Settings<S>) => {
  type InferZodTypes<Type> = {
    [P in keyof Type as Type[P] extends z.AnyZodObject ? P : never]: Type[P] extends z.AnyZodObject ? z.infer<Type[P]> : never
  }

  type ZodTypes = InferZodTypes<typeof settings.schema>

  // Might want to make this configurable...
  type SchemaIdType = IdType

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type SchemaMap<Type> = {
    [P in keyof Type as Type[P] extends never ? never : P]: P extends keyof ZodTypes ? Schema<ZodTypes[P], SchemaIdType> : never
  }

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type ZodMap<Type> = {
    [P in keyof Type as Type[P] extends never ? never : P]: P extends keyof ZodTypes ? ZodTypes[P] : never
  }

  const apiParts = Object.keys(settings.schema).map((name) => {
    const zod = settings.schema[name]

    type Z = z.infer<typeof zod>
    type Model = { readonly $id: SchemaIdType } & Z
    type Collection = { cache: Record<SchemaIdType, Model>; array: Model[] }

    const isValidSchema = zod instanceof z.ZodObject

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
          extra: options?.extra ? clone(options.extra) : void 0,
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

    return { isValidSchema, name, schema, collection, zod }
  })

  return apiParts.reduce(
    (container: { schema: SchemaMap<ZodTypes>; zod: ZodMap<ZodTypes> }, current) => {
      if (!current.isValidSchema) return container
      container.schema[current.name as keyof typeof container.schema] = current.schema as typeof container.schema[keyof typeof container.schema]
      container.zod[current.name as keyof typeof container.zod] = current.zod as typeof container.zod[keyof typeof container.zod]
      return container
    },
    { schema: {} as SchemaMap<ZodTypes>, zod: {} as ZodMap<ZodTypes> }
  )
}

export const makeMemoryDB = <S extends {}>(settings: Settings<S> = {}) => {
  const { schema, zod } = makeSchema({ schema: {} as SchemaList<S>, ...settings })

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
